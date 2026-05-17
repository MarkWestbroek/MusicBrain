#pragma once
// In-memory IRelayBoard for tests + host harness. Records the latest state
// of every relay and counts how many setRelay/setMask calls have been made.

#include "mb/IRelayBoard.h"
#include <array>
#include <cstddef>
#include <cstdint>

namespace mb::host {

class HostRelayBoard : public IRelayBoard {
public:
    explicit HostRelayBoard(std::size_t count = 16) : count_(count) {}

    std::size_t relayCount() const override { return count_; }

    void setRelay(std::size_t id, bool on) override {
        if (id >= count_) return;
        states_[id] = on;
        ++setRelayCalls_;
    }

    void setMask(uint16_t mask) override {
        for (std::size_t i = 0; i < count_; ++i) {
            states_[i] = ((mask >> i) & 0x1u) != 0;
        }
        ++setMaskCalls_;
    }

    bool   state(std::size_t id) const { return id < count_ && states_[id]; }
    uint16_t mask() const {
        uint16_t m = 0;
        for (std::size_t i = 0; i < count_; ++i) if (states_[i]) m |= (1u << i);
        return m;
    }
    std::size_t setRelayCalls() const { return setRelayCalls_; }
    std::size_t setMaskCalls()  const { return setMaskCalls_; }

private:
    std::size_t                count_;
    std::array<bool, 16>       states_{};
    std::size_t                setRelayCalls_{0};
    std::size_t                setMaskCalls_{0};
};

}  // namespace mb::host
