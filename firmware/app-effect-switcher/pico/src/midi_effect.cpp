// midi_effect.cpp — effect-switcher MIDI handler implementation for RP2040.

#include "midi_effect.h"
#include "hal/mcu.h"

namespace mb {

// ─── public ──────────────────────────────────────────────────────────────────

void MidiEffect::begin(const JsonDocument& cfgRef, ActivateFn activateFn) {
    _cfg        = &cfgRef;
    _activateFn = std::move(activateFn);

    // Initialize UART MIDI (DIN connector)
    _port.begin(Serial1, MB_MIDI_RX, MB_MIDI_TX,
        [this](const MidiMessage& m) {
            switch (m.type) {
                case MidiType::ProgramChange:
                    if (_activateFn) {
                        const int id = resolvePatch(m.data1);
                        if (id >= 0) {
                            Serial.printf("[midi-uart] PC %u → patch %d\n", m.data1, id);
                            _activateFn(id);
                        }
                    }
                    break;
                case MidiType::ControlChange:
                    // Future: e.g. CC 64 (sustain) → toggle device bypass.
                    Serial.printf("[midi-uart] CC ch=%u cc=%u val=%u\n",
                                  m.channel, m.data1, m.data2);
                    break;
                default:
                    break;
            }
        });

    // Initialize USB MIDI
    _usbPort.begin();
    _usbPort.onMessage(
        [this](const MidiMessage& m) {
            switch (m.type) {
                case MidiType::ProgramChange:
                    if (_activateFn) {
                        const int id = resolvePatch(m.data1);
                        if (id >= 0) {
                            Serial.printf("[midi-usb] PC %u → patch %d\n", m.data1, id);
                            _activateFn(id);
                        }
                    }
                    break;
                case MidiType::ControlChange:
                    Serial.printf("[midi-usb] CC ch=%u cc=%u val=%u\n",
                                  m.channel, m.data1, m.data2);
                    break;
                default:
                    break;
            }
        });

    Serial.printf("[midi] ready  uart-rx=GP%d  uart-tx=GP%d  usb=device\n",
                  MB_MIDI_RX, MB_MIDI_TX);
}

void MidiEffect::loop() {
    _port.loop();
    _usbPort.loop();
}

void MidiEffect::sendPatchCC(int patchId) {
    if (!_cfg) return;
    const JsonArrayConst patches = (*_cfg)["patches"].as<JsonArrayConst>();
    if (patches.isNull()) return;

    for (JsonObjectConst p : patches) {
        if (p["id"].as<int>() != patchId) continue;

        const JsonArrayConst ccList = p["midiCcOut"].as<JsonArrayConst>();
        if (ccList.isNull() || ccList.size() == 0) return;

        for (JsonObjectConst ev : ccList) {
            const uint8_t ch  = ev["ch"].as<uint8_t>();
            const uint8_t cc  = ev["cc"].as<uint8_t>();
            const uint8_t val = ev["val"].as<uint8_t>();
            
            // Send to both UART and USB
            _port.sendCC(ch, cc, val);
            _usbPort.sendCC(ch, cc, val);
            
            Serial.printf("[midi] → CC ch=%u cc=%u val=%u\n", ch, cc, val);
        }
        return;
    }
}

// ─── private ─────────────────────────────────────────────────────────────────

int MidiEffect::resolvePatch(uint8_t program) const {
    if (!_cfg) return -1;
    const JsonArrayConst patches = (*_cfg)["patches"].as<JsonArrayConst>();
    if (patches.isNull() || patches.size() == 0) return -1;

    // First pass: look for an explicit `midiProgram` match.
    for (JsonObjectConst p : patches) {
        if (p["midiProgram"].is<int>() &&
            p["midiProgram"].as<int>() == static_cast<int>(program))
            return p["id"].as<int>();
    }

    // Fallback: treat program number as a 0-based index (wraps around).
    const size_t idx = static_cast<size_t>(program) % patches.size();
    return patches[idx]["id"].as<int>();
}

}  // namespace mb
