#pragma once
// Virtual clock: 64-bit microsecond timestamp, monotonically advanced by the
// driver. Pure sim — no syscalls.

#include <cstdint>

namespace mb::sim {

class Clock {
public:
    uint64_t now() const { return us_; }
    void     advance(uint64_t deltaUs) { us_ += deltaUs; }
    void     set(uint64_t us) { us_ = us; }

private:
    uint64_t us_ = 0;
};

}  // namespace mb::sim
