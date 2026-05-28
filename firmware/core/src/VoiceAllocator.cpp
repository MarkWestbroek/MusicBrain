#include "mb/VoiceAllocator.h"

namespace mb {

void VoiceAllocator::configure(uint8_t voiceCount) {
    if (voiceCount > kMaxAllocVoices) voiceCount = kMaxAllocVoices;
    voiceCount_ = voiceCount;
    for (auto& v : voices_) v = VoiceState{};
    tick_ = 0;
}

AllocResult VoiceAllocator::noteOn(uint8_t note) {
    AllocResult r{};
    // Step 1: prefer the free voice that has been idle the longest.
    // age == 0 means never used and always wins; among used-then-released
    // voices the one with the smallest age was released earliest, giving
    // it the most time to finish its release phase before being retriggered.
    int chosen = -1;
    uint32_t bestAge = UINT32_MAX;
    for (uint8_t i = 0; i < voiceCount_; ++i) {
        if (!voices_[i].held) {
            // age 0 (never used) wins; otherwise oldest free voice.
            const uint32_t a = voices_[i].age;
            if (chosen < 0 || a < bestAge) {
                chosen  = i;
                bestAge = a;
            }
        }
    }
    if (chosen < 0) {
        // Step 2: all voices held — steal the oldest (lowest age = has been
        // sounding the longest), which is most likely past its transient.
        bestAge = UINT32_MAX;
        for (uint8_t i = 0; i < voiceCount_; ++i) {
            if (voices_[i].age < bestAge) {
                bestAge = voices_[i].age;
                chosen  = i;
            }
        }
        r.stole    = true;
        r.prevNote = voices_[chosen].note;
    }
    voices_[chosen].held = true;
    voices_[chosen].note = note;
    voices_[chosen].age  = ++tick_;
    r.voiceIdx = static_cast<uint8_t>(chosen);
    return r;
}

uint8_t VoiceAllocator::noteOff(uint8_t note) {
    // Last-note priority: when the same MIDI note number has been allocated
    // to multiple voices (possible after steal + retrigger), only release
    // the most recently allocated one.  A stale NoteOff for an earlier
    // instance then becomes a no-op, so the retriggered note keeps sounding.
    int chosen = -1;
    uint32_t bestAge = 0;
    for (uint8_t i = 0; i < voiceCount_; ++i) {
        if (voices_[i].held && voices_[i].note == note) {
            if (voices_[i].age >= bestAge) {
                bestAge = voices_[i].age;
                chosen  = i;
            }
        }
    }
    if (chosen < 0) return 0xFF;
    voices_[chosen].held = false;
    // Keep `note` and bump age so the released voice goes to the back of the
    // queue for reuse (oldest-released-first).
    voices_[chosen].age = ++tick_;
    return static_cast<uint8_t>(chosen);
}

void VoiceAllocator::allOff() {
    for (uint8_t i = 0; i < voiceCount_; ++i) {
        voices_[i].held = false;
    }
}

}  // namespace mb
