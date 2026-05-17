#pragma once
// Abstract relay-board driver. The concrete implementation (RP2040 + 74HC595
// chain, host-mock for tests, etc.) lives in firmware/hal/*. Core code only
// ever talks to this interface so the same SwitcherRouter binary runs in unit
// tests and on real metal.

#include <cstddef>
#include <cstdint>

namespace mb {

class IRelayBoard {
public:
    virtual ~IRelayBoard() = default;

    // Total relays this board controls. Project 1 = 16.
    virtual std::size_t relayCount() const = 0;

    // Set one relay. id < relayCount(); ignored otherwise.
    virtual void setRelay(std::size_t id, bool on) = 0;

    // Apply a bitmask in one call. Implementations are encouraged (but not
    // required) to update all relays in a single shift-register transaction.
    virtual void setMask(uint16_t mask) = 0;
};

}  // namespace mb
