#pragma once
#include "Patch.h"
#include <array>
#include <cstddef>
#include <optional>

namespace mb {

inline constexpr std::size_t kBankCapacity = 128;

class PatchBank {
public:
    bool insert(const Patch& p);                 // returns false if full or duplicate id
    const Patch* find(ProgramId id) const;
    const Patch* at(std::size_t idx) const;      // 0..size()-1, nullptr otherwise
    std::size_t  indexOf(ProgramId id) const;    // size() if not found
    std::size_t  size() const { return count_; }

    bool                       setActive(ProgramId id);  // false if id unknown
    std::optional<ProgramId>   activeId() const { return active_; }
    const Patch*               active() const;

private:
    std::array<Patch, kBankCapacity> patches_{};
    std::size_t                      count_{0};
    std::optional<ProgramId>         active_{};
};

}  // namespace mb
