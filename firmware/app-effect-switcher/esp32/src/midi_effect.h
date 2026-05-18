// midi_effect.h — Effect-switcher MIDI integration.
//
// Connects the generic MidiPort to the effect-switcher config + patch engine.
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
// GPIO defaults (remappable in midi_effect.cpp):
//   MIDI_RX_PIN = 26   (UART2, remapped)
//   MIDI_TX_PIN = 27   (UART2, remapped)

#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <functional>
#include <MidiPort.h>

namespace mb {

/// GPIO for MIDI UART2 (change to match your wiring).
constexpr int MIDI_RX_PIN = 26;
constexpr int MIDI_TX_PIN = 27;

/**
 * Effect-switcher MIDI handler.
 *
 * Wraps a MidiPort and connects it to the live SwitcherProject JSON document
 * held in main.cpp, without requiring a copy of that document.
 */
class MidiEffect {
public:
    /// Called when MIDI IN causes a patch activation; argument is the patch id.
    using ActivateFn = std::function<void(int patchId)>;

    /**
     * Initialise MIDI UART and register the patch-activate callback.
     * @param cfgRef      Reference to the live activeConfig document (must
     *                    remain valid for the lifetime of this object).
     * @param activateFn  Called with the resolved patch id on incoming
     *                    Program Change.
     */
    void begin(const JsonDocument& cfgRef, ActivateFn activateFn);

    /// Drain UART receive buffer. Call from loop().
    void loop() { _port.loop(); }

    /**
     * Send all `midiCcOut` events listed in the patch with the given id.
     * Call this AFTER the relay mask has been applied (from applyActivePatch).
     * No-op if the patch has no midiCcOut array.
     */
    void sendPatchCC(int patchId);

    /// Direct port access for custom sends (e.g. from REST handler or tests).
    MidiPort& port() { return _port; }

private:
    MidiPort            _port;
    ActivateFn          _activateFn;
    const JsonDocument* _cfg = nullptr;

    /// Map a received program number to a patch id in the current config.
    int resolvePatch(uint8_t program) const;
};

}  // namespace mb
