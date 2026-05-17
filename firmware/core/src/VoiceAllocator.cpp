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
    // 1) Prefer a free voice with the smallest age (= released longest ago,
    //    or never used).
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
        // 2) All voices held → steal the OLDEST (smallest age).
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
    // Last-note priority: drop the most-recently-allocated voice that
    // matches (covers the case where the same note was retriggered after
    // a steal — only the newest instance should be released by this NoteOff).
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
