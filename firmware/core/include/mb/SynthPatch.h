#pragma once
// patch.synth.v1 — project 3 (modular brain) patch blob.
// See doc/protocols/schemas/patch.synth.v1.md.

#include "Patch.h"
#include "Types.h"
#include <cstdint>
#include <optional>

namespace mb::synth {

inline constexpr uint8_t  kVersion       = 1;
inline constexpr uint8_t  kMaxVoices     = 16;
inline constexpr std::size_t kBlobSize   = 8;

// Parsed view of a patch.synth.v1 blob. POD-ish, no allocations.
struct SynthPatchV1 {
    uint8_t voiceCount = 0;
    uint8_t caseId     = 0;
    uint8_t firstSlot  = 0;
    uint8_t pitchBits  = 16;

    // Helpers to compute channel ids per voice.
    ChannelId pitchChannel(uint8_t voiceIdx) const {
        return static_cast<ChannelId>(
            (static_cast<uint16_t>(caseId) << 8)
            | static_cast<uint16_t>(firstSlot + 2 * voiceIdx));
    }
    ChannelId gateChannel(uint8_t voiceIdx) const {
        return static_cast<ChannelId>(
            (static_cast<uint16_t>(caseId) << 8)
            | static_cast<uint16_t>(firstSlot + 2 * voiceIdx + 1));
    }
};

// Write the 8-byte blob into `p.blob` and update `p.blobSize`.
// Returns false on out-of-range arguments.
bool writeBlob(Patch& p, const SynthPatchV1& sp);

// Parse the 8-byte blob from `p`. Returns nullopt on bad version, bad CRC,
// wrong size, or voiceCount out of range.
std::optional<SynthPatchV1> readBlob(const Patch& p);

}  // namespace mb::synth
