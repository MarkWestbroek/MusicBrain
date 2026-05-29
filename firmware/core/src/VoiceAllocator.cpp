#include "mb/VoiceAllocator.h"

namespace mb {

void VoiceAllocator::configure(uint8_t voiceCount) {
    if (voiceCount > kMaxAllocVoices) voiceCount = kMaxAllocVoices;
    voiceCount_ = voiceCount;
    for (auto& v : voices_) v = VoiceState{};
    tick_ = 0;
}

int VoiceAllocator::pickByStrategy(bool (*eligible)(const VoiceState&)) const {
    int chosen = -1;
    for (uint8_t i = 0; i < voiceCount_; ++i) {
        const VoiceState& v = voices_[i];
        if (!eligible(v)) continue;
        if (chosen < 0) { chosen = i; continue; }
        const VoiceState& b = voices_[chosen];
        bool better = false;
        switch (steal_) {
            case StealStrategy::Lowest:
                // Lowest MIDI note wins; tie broken by oldest (lowest age).
                better = (v.note < b.note) || (v.note == b.note && v.age < b.age);
                break;
            case StealStrategy::Highest:
                // Highest MIDI note wins; tie broken by oldest (lowest age).
                better = (v.note > b.note) || (v.note == b.note && v.age < b.age);
                break;
            case StealStrategy::Oldest:
            default:
                // Longest sounding/releasing voice (lowest age).
                better = v.age < b.age;
                break;
        }
        if (better) chosen = i;
    }
    return chosen;
}

AllocResult VoiceAllocator::noteOn(uint8_t note) {
    AllocResult r{};
    // Step 1: prefer a fully *idle* voice (gate low AND release finished),
    // taking the one idle the longest. age == 0 means never used and always
    // wins; among used-then-finished voices the smallest age finished earliest.
    // This step ignores the steal strategy: there is no audible tail to
    // protect here, only click-minimisation, so oldest-age is always best.
    int chosen = -1;
    uint32_t bestAge = UINT32_MAX;
    for (uint8_t i = 0; i < voiceCount_; ++i) {
        if (!voices_[i].held && !voices_[i].releasing) {
            const uint32_t a = voices_[i].age;
            if (chosen < 0 || a < bestAge) {
                chosen  = i;
                bestAge = a;
            }
        }
    }
    // Step 2: no idle voice — reuse a *releasing* voice (gate low but envelope
    // still ringing) per the steal strategy. This cuts a release tail, so it is
    // preferred over stealing a held note but not over a truly idle voice.
    if (chosen < 0) {
        chosen = pickByStrategy([](const VoiceState& v) {
            return !v.held && v.releasing;
        });
    }
    // Step 3: all voices held — steal one per the steal strategy.
    if (chosen < 0) {
        chosen = pickByStrategy([](const VoiceState& v) { return v.held; });
        r.stole    = true;
        r.prevNote = voices_[chosen].note;
    }
    voices_[chosen].held      = true;
    voices_[chosen].releasing = false;
    voices_[chosen].note      = note;
    voices_[chosen].age       = ++tick_;
    r.voiceIdx = static_cast<uint8_t>(chosen);
    return r;
}

void VoiceAllocator::markReleaseComplete(uint8_t i) {
    if (i >= voiceCount_) return;
    if (!voices_[i].held) voices_[i].releasing = false;
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
    voices_[chosen].held      = false;
    voices_[chosen].releasing = true;  // gate low, envelope now ringing out.
    // Keep `note` and bump age so the released voice goes to the back of the
    // queue for reuse (oldest-released-first).
    voices_[chosen].age = ++tick_;
    return static_cast<uint8_t>(chosen);
}

void VoiceAllocator::allOff() {
    for (uint8_t i = 0; i < voiceCount_; ++i) {
        if (voices_[i].held) {
            voices_[i].held      = false;
            voices_[i].releasing = true;  // gates drop, envelopes release.
        }
    }
}

}  // namespace mb
