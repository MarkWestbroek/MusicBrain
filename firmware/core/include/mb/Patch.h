#pragma once
// Patch = one program / preset. The concrete payload depends on the application
// (effect-loop bitmask, amp routing, modular CV matrix). The core only knows
// about identity, name and a versioned binary blob; applications cast / parse
// the blob into their own schema.

#include "Types.h"
#include <array>
#include <cstdint>
#include <string_view>

namespace mb {

inline constexpr std::size_t kPatchNameMax = 24;
inline constexpr std::size_t kPatchBlobMax = 512;  // tune per application

struct Patch {
    ProgramId id{0};
    uint16_t  schemaVersion{1};
    std::array<char, kPatchNameMax> name{};
    uint16_t  blobSize{0};
    std::array<uint8_t, kPatchBlobMax> blob{};  // CBOR-encoded payload (see ADR 0005)

    std::string_view nameView() const;
    void setName(std::string_view s);
};

}  // namespace mb
