// MidiPort.h — Generic MIDI 1.0 port over a hardware UART.
//
// Shared across all MusicBrain firmware projects.
// No external dependencies beyond Arduino-ESP32 core.
//
// Usage:
//   mb::MidiPort midi;
//   midi.begin(Serial2, 26 /*rx*/, 27 /*tx*/);
//   midi.onMessage([](const mb::MidiMessage& m) { ... });
//   // call midi.loop() from loop()

#pragma once
#include <Arduino.h>
#include <functional>

namespace mb {

/// MIDI 1.0 message type (status nibble).
enum class MidiType : uint8_t {
    NoteOff       = 0x8,
    NoteOn        = 0x9,
    ControlChange = 0xB,
    ProgramChange = 0xC,
};

/// Parsed MIDI 1.0 message delivered to the onMessage callback.
struct MidiMessage {
    MidiType type;
    uint8_t  channel; ///< 1..16
    uint8_t  data1;   ///< note / CC number / program number
    uint8_t  data2;   ///< velocity / CC value; always 0 for Program Change
};

/**
 * Generic MIDI 1.0 port over a HardwareSerial UART (31 250 baud, 8N1).
 *
 * Handles:
 *   - MIDI IN parsing: running status, SysEx skip, System Real-Time passthrough.
 *   - MIDI OUT: CC, Program Change, Note On/Off.
 *
 * Note on signal polarity (important for hardware design):
 *   The standard 6N138 optocoupler circuit and 74AHC1G125 buffer both preserve
 *   UART polarity — no firmware inversion is needed. Power the MIDI breakout
 *   from the ESP32 3.3 V rail for compatible logic levels.
 */
class MidiPort {
public:
    using MessageCallback = std::function<void(const MidiMessage&)>;

    /**
     * Initialise the UART and optionally set the message callback.
     * @param serial   Hardware UART to use (e.g. Serial2).
     * @param rxPin    GPIO for MIDI IN (−1 = receive only not needed).
     * @param txPin    GPIO for MIDI OUT (−1 = transmit not needed).
     * @param cb       Optional callback; can also be set later via onMessage().
     */
    void begin(HardwareSerial& serial, int rxPin, int txPin = -1,
               MessageCallback cb = nullptr);

    /// Register (or replace) the incoming-message callback.
    void onMessage(MessageCallback cb) { _cb = std::move(cb); }

    /// Drain the UART receive buffer and fire callbacks for complete messages.
    /// Must be called from loop().
    void loop();

    /// Send a Control Change. channel 1..16, cc and value 0..127.
    void sendCC(uint8_t channel, uint8_t cc, uint8_t value);

    /// Send a Program Change. channel 1..16, program 0..127.
    void sendProgramChange(uint8_t channel, uint8_t program);

    /// Send Note On.  Velocity 0 is treated as Note Off by most receivers.
    void sendNoteOn(uint8_t channel, uint8_t note, uint8_t velocity);

    /// Send Note Off.
    void sendNoteOff(uint8_t channel, uint8_t note, uint8_t velocity = 0);

private:
    HardwareSerial*  _serial = nullptr;
    MessageCallback  _cb;

    // Running-status parser state
    uint8_t  _status = 0;    ///< Current status byte; 0 = none yet
    uint8_t  _d[2]   = {};   ///< Data byte accumulator
    uint8_t  _dLen   = 0;    ///< Number of data bytes collected so far
    bool     _sysex  = false;///< True while inside a SysEx message

    static uint8_t dataLen(uint8_t status);
    void processByte(uint8_t b);
    void dispatch();
};

}  // namespace mb
