#pragma once
// Fixed-size N-voice allocator. Last-note priority with round-robin stealing.
// Pure logic, no I/O. See doc/protocols/schemas/patch.synth.v1.md.

#include "Types.h"
#include <array>
#include <cstdint>

namespace mb {

inline constexpr uint8_t kMaxAllocVoices = 16;

struct VoiceState {
    bool    held    = false;  // gate currently high?
    uint8_t note    = 0;      // MIDI note number (only meaningful while held)
    uint32_t age    = 0;      // monotonically increasing on each alloc
};

struct AllocResult {
    uint8_t voiceIdx = 0;     // which voice slot was used (0 .. voiceCount-1)
    bool    stole    = false; // true if we kicked someone out
    uint8_t prevNote = 0;     // the note we stole (only valid if stole)
};

class VoiceAllocator {
public:
    void configure(uint8_t voiceCount);

    // NoteOn. Always succeeds: picks the oldest free voice; if none free,
    // steals the oldest held voice.
    AllocResult noteOn(uint8_t note);

    // NoteOff. Returns the voice idx that was holding `note` (and clears it),
    // or 0xFF if no voice was holding that note.
    uint8_t     noteOff(uint8_t note);

    void        allOff();

    uint8_t            voiceCount() const { return voiceCount_; }
    const VoiceState&  state(uint8_t i)  const { return voices_[i]; }

private:
    std::array<VoiceState, kMaxAllocVoices> voices_{};
    uint8_t  voiceCount_ = 0;
    uint32_t tick_       = 0;
};

}  // namespace mb
