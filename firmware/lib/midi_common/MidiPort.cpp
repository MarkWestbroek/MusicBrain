// MidiPort.cpp — implementation of the generic MIDI port.

#include "MidiPort.h"

namespace mb {

// ─── public ──────────────────────────────────────────────────────────────────

void MidiPort::begin(HardwareSerial& serial, int rxPin, int txPin,
                     MessageCallback cb) {
    _serial = &serial;
    if (cb) _cb = std::move(cb);
    
#if defined(ARDUINO_ARCH_ESP32)
    // ESP32 HardwareSerial allows per-pin remapping in begin().
    serial.begin(31250, SERIAL_8N1, rxPin, txPin);
#elif defined(ARDUINO_ARCH_RP2040)
    // Arduino-Pico: set pins before calling begin().
    if (rxPin >= 0) serial.setRX(rxPin);
    if (txPin >= 0) serial.setTX(txPin);
    serial.begin(31250);
#else
    // Fallback: assume standard begin() without pin remapping.
    serial.begin(31250);
#endif
}

void MidiPort::loop() {
    if (!_serial) return;
    while (_serial->available())
        processByte(static_cast<uint8_t>(_serial->read()));
}

void MidiPort::sendCC(uint8_t channel, uint8_t cc, uint8_t value) {
    if (!_serial) return;
    _serial->write(static_cast<uint8_t>(0xB0 | ((channel - 1u) & 0x0Fu)));
    _serial->write(cc    & 0x7Fu);
    _serial->write(value & 0x7Fu);
}

void MidiPort::sendProgramChange(uint8_t channel, uint8_t program) {
    if (!_serial) return;
    _serial->write(static_cast<uint8_t>(0xC0 | ((channel - 1u) & 0x0Fu)));
    _serial->write(program & 0x7Fu);
}

void MidiPort::sendNoteOn(uint8_t channel, uint8_t note, uint8_t velocity) {
    if (!_serial) return;
    _serial->write(static_cast<uint8_t>(0x90 | ((channel - 1u) & 0x0Fu)));
    _serial->write(note     & 0x7Fu);
    _serial->write(velocity & 0x7Fu);
}

void MidiPort::sendNoteOff(uint8_t channel, uint8_t note, uint8_t velocity) {
    if (!_serial) return;
    _serial->write(static_cast<uint8_t>(0x80 | ((channel - 1u) & 0x0Fu)));
    _serial->write(note     & 0x7Fu);
    _serial->write(velocity & 0x7Fu);
}

// ─── private ─────────────────────────────────────────────────────────────────

uint8_t MidiPort::dataLen(uint8_t status) {
    switch (status >> 4) {
        case 0x8: case 0x9: case 0xA:  // Note Off / On / Poly Pressure
        case 0xB: case 0xE:            // CC / Pitch Bend
            return 2;
        case 0xC: case 0xD:            // Program Change / Channel Pressure
            return 1;
        default:
            return 0;
    }
}

void MidiPort::processByte(uint8_t b) {
    // System Real-Time (0xF8..0xFF): single-byte — ignore but don't disturb
    // running status.
    if (b >= 0xF8) return;

    // SysEx: skip bytes until End-of-Exclusive (0xF7).
    if (b == 0xF0) { _sysex = true;  return; }
    if (_sysex)    { if (b == 0xF7) _sysex = false; return; }

    // Any other status byte?
    if (b & 0x80) {
        _status = b;
        _dLen   = 0;
        // System Common (0xF0..0xF7) resets running status but we don't parse them.
        if (b >= 0xF0) _status = 0;
        return;
    }

    // Data byte — need a valid channel-voice status.
    if (_status == 0) return;

    _d[_dLen++] = b;
    if (_dLen >= dataLen(_status)) {
        dispatch();
        _dLen = 0;  // keep running status; reset accumulator for next message
    }
}

void MidiPort::dispatch() {
    if (!_cb) return;
    const uint8_t nibble = _status >> 4;
    MidiMessage m{};
    m.channel = (_status & 0x0Fu) + 1u;
    m.data1   = _d[0];
    m.data2   = (_dLen > 1) ? _d[1] : 0u;
    switch (nibble) {
        case 0x8: m.type = MidiType::NoteOff;        break;
        case 0x9: m.type = MidiType::NoteOn;         break;
        case 0xB: m.type = MidiType::ControlChange;  break;
        case 0xC: m.type = MidiType::ProgramChange;  break;
        default: return;  // Poly Pressure, Pitch Bend etc. — not wired up yet
    }
    _cb(m);
}

}  // namespace mb
