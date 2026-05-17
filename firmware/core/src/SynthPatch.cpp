#include "mb/SynthPatch.h"
#include "mb/Protocol/SpiFrame.h"  // reuse crc16Ccitt

namespace mb::synth {

bool writeBlob(Patch& p, const SynthPatchV1& sp) {
    if (sp.voiceCount == 0 || sp.voiceCount > kMaxVoices) return false;
    if (sp.pitchBits != 12 && sp.pitchBits != 16) return false;
    // The highest slot used is firstSlot + 2*(voiceCount-1) + 1. Must fit in u8.
    const int last = static_cast<int>(sp.firstSlot) + 2 * sp.voiceCount - 1;
    if (last > 0xFF) return false;

    uint8_t* b = p.blob.data();
    b[0] = kVersion;
    b[1] = sp.voiceCount;
    b[2] = sp.caseId;
    b[3] = sp.firstSlot;
    b[4] = sp.pitchBits;
    b[5] = 0;  // _pad
    const uint16_t crc = mb::proto::crc16Ccitt(b, 6);
    b[6] = static_cast<uint8_t>(crc >> 8);
    b[7] = static_cast<uint8_t>(crc & 0xFF);
    p.blobSize = static_cast<uint16_t>(kBlobSize);
    return true;
}

std::optional<SynthPatchV1> readBlob(const Patch& p) {
    if (p.blobSize != kBlobSize) return std::nullopt;
    const uint8_t* b = p.blob.data();
    if (b[0] != kVersion) return std::nullopt;
    if (b[5] != 0)        return std::nullopt;
    const uint16_t expected = mb::proto::crc16Ccitt(b, 6);
    const uint16_t got      = static_cast<uint16_t>(b[6]) << 8 | b[7];
    if (got != expected) return std::nullopt;

    SynthPatchV1 sp{};
    sp.voiceCount = b[1];
    sp.caseId     = b[2];
    sp.firstSlot  = b[3];
    sp.pitchBits  = b[4];
    if (sp.voiceCount == 0 || sp.voiceCount > kMaxVoices) return std::nullopt;
    if (sp.pitchBits != 12 && sp.pitchBits != 16) return std::nullopt;
    return sp;
}

}  // namespace mb::synth
