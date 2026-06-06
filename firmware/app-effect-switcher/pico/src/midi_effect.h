// midi_effect.h — Effect-switcher MIDI integration for RP2040.
//
// Connects both UART MIDI (DIN connector) and USB MIDI to the effect-switcher
// config + patch engine.
//
// MIDI IN behaviour:
//   - Program Change → finds the patch whose optional `midiProgram` field
//     matches the received program number; if no explicit match, falls back to
//     patches[program % patchCount].
//   - Control Change → reserved for future use (e.g. per-device bypass toggle).
//
// MIDI OUT behaviour:
//   - After each patch change, sends the `midiCcOut` events listed in the
//     active patch JSON (if any).
//
// JSON schema for a patch with MIDI fields (all optional, backward-compatible):
//
//   {
//     "id": 3,
//     "name": "Delay+Chorus",
//     "midiProgram": 5,          // listen for Program Change #5
//     "midiCcOut": [             // send these CCs when patch activates
//       { "ch": 1, "cc": 70, "val": 127 },
//       { "ch": 1, "cc": 71, "val": 64  }
//     ],
//     "bypassed": []
//   }
//
// GPIO defaults (from hal/mcu.h):
//   MIDI_RX_PIN = GP1   (UART0 RX)
//   MIDI_TX_PIN = GP0   (UART0 TX)

#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <functional>
#include <MidiPort.h>
#include "usb_midi.h"

namespace mb {

/**
 * Effect-switcher MIDI handler for RP2040.
 *
 * Wraps both a UART MidiPort (DIN connector) and UsbMidi (USB device),
 * connecting them to the live SwitcherProject JSON document held in main.cpp.
 */
class MidiEffect {
public:
    /// Called when MIDI IN causes a patch activation; argument is the patch id.
    using ActivateFn = std::function<void(int patchId)>;

    /**
     * Initialise MIDI (UART + USB) and register the patch-activate callback.
     * @param cfgRef      Reference to the live activeConfig document (must
     *                    remain valid for the lifetime of this object).
     * @param activateFn  Called with the resolved patch id on incoming
     *                    Program Change (from either UART or USB).
     */
    void begin(const JsonDocument& cfgRef, ActivateFn activateFn);

    /// Poll both MIDI ports and dispatch incoming messages. Call from loop().
    void loop();

    /// Send the CC events listed in the patch's `midiCcOut` array.
    void sendPatchCC(int patchId);

    /// Access the underlying UART MIDI port (for advanced use).
    MidiPort& port() { return _port; }

    /// Access the underlying USB MIDI port (for advanced use).
    UsbMidi& usbPort() { return _usbPort; }

private:
    const JsonDocument* _cfg = nullptr;
    ActivateFn          _activateFn;
    MidiPort            _port;      // UART MIDI (DIN connector)
    UsbMidi             _usbPort;   // USB MIDI (device mode)

    int resolvePatch(uint8_t program) const;
};

}  // namespace mb
