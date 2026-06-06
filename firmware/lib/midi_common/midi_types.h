// midi_types.h — Shared MIDI type definitions
// 
// This header defines the basic MIDI types used across MusicBrain firmware.
// It's separate from MidiPort.h to avoid circular dependencies.

#pragma once
#include <stdint.h>

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

}  // namespace mb
