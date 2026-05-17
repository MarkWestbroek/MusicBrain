#pragma once
// patch.switcher.v1 blob — see doc/protocols/schemas/patch.switcher.v1.md.
// 8 bytes packed into Patch::body via writeBlob/readBlob.

#include "Patch.h"
#include <cstdint>
#include <optional>

namespace mb::switcher {

inline constexpr uint8_t      kVersion   = 1;
inline constexpr std::size_t  kMaxRelays = 16;
inline constexpr std::size_t  kBlobSize  = 8;

struct SwitcherPatchV1 {
    uint8_t  relayCount{0};
    uint16_t relayMask{0};
    uint8_t  flags{0};

    bool isRelayOn(uint8_t i) const {
        return i < relayCount && ((relayMask >> i) & 0x1u) != 0;
    }
};

// Pack into patch.body + crc. Returns false on invalid input.
bool writeBlob(Patch& out, const SwitcherPatchV1& sp);

// Parse patch.body. Returns nullopt on bad CRC / malformed blob.
std::optional<SwitcherPatchV1> readBlob(const Patch& p);

}  // namespace mb::switcher
