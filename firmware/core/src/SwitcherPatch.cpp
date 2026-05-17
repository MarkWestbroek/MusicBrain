#include "mb/SwitcherPatch.h"
#include "mb/Protocol/SpiFrame.h"   // crc16Ccitt — small helper, lives there.

namespace mb::switcher {

namespace {

void pack(uint8_t out[kBlobSize], const SwitcherPatchV1& sp) {
    out[0] = kVersion;
    out[1] = sp.relayCount;
    out[2] = static_cast<uint8_t>(sp.relayMask & 0xFF);
    out[3] = static_cast<uint8_t>((sp.relayMask >> 8) & 0xFF);
    out[4] = sp.flags;
    out[5] = 0;
    const uint16_t crc = mb::proto::crc16Ccitt(out, 6);
    out[6] = static_cast<uint8_t>(crc & 0xFF);
    out[7] = static_cast<uint8_t>((crc >> 8) & 0xFF);
}

bool validate(const SwitcherPatchV1& sp) {
    if (sp.relayCount == 0 || sp.relayCount > kMaxRelays) return false;
    // No mask bits above relayCount.
    const uint16_t allowed = static_cast<uint16_t>((1u << sp.relayCount) - 1u);
    if ((sp.relayMask & ~allowed) != 0) return false;
    return true;
}

}  // namespace

bool writeBlob(Patch& out, const SwitcherPatchV1& sp) {
    if (!validate(sp)) return false;
    pack(out.blob.data(), sp);
    out.blobSize = kBlobSize;
    return true;
}

std::optional<SwitcherPatchV1> readBlob(const Patch& p) {
    if (p.blobSize != kBlobSize) return std::nullopt;
    const uint8_t* b = p.blob.data();
    if (b[0] != kVersion) return std::nullopt;
    if (b[5] != 0)        return std::nullopt;
    const uint16_t crcGot =
        static_cast<uint16_t>(b[6]) | (static_cast<uint16_t>(b[7]) << 8);
    if (mb::proto::crc16Ccitt(b, 6) != crcGot) return std::nullopt;

    SwitcherPatchV1 sp{};
    sp.relayCount = b[1];
    sp.relayMask  = static_cast<uint16_t>(b[2]) | (static_cast<uint16_t>(b[3]) << 8);
    sp.flags      = b[4];
    if (!validate(sp)) return std::nullopt;
    return sp;
}

}  // namespace mb::switcher
