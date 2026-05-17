#pragma once
// PatchCodec: convert mb::Patch to/from JSON (editor, git) and CBOR (device).
// See doc/protocols/schemas/patch.md and ADR 0005.
//
// Hand-rolled, zero-dependency on purpose:
//   - the schema is fixed (4 fields, no nesting)
//   - the same code must compile on the device with no allocator pressure
//     beyond the std::string / std::vector return values used host-side
//   - keeps `firmware/core` free of third-party headers

#include "Patch.h"
#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

#if __has_include(<span>) && __cplusplus >= 202002L
#  include <span>
#endif

namespace mb {

// Equality helper used by tests.
bool operator==(const Patch& a, const Patch& b) noexcept;

class PatchCodec {
public:
    // ---- JSON ----
    static std::string             toJson(const Patch& p);
    static std::optional<Patch>    fromJson(std::string_view s);

    // ---- CBOR ----
    static std::vector<uint8_t>    toCbor(const Patch& p);
    static std::optional<Patch>    fromCbor(const uint8_t* data, std::size_t size);

    // Convenience overload for std::vector / arrays.
    static std::optional<Patch>    fromCbor(const std::vector<uint8_t>& v) {
        return fromCbor(v.data(), v.size());
    }
};

}  // namespace mb
