#pragma once
// Behavioural model of the 8-gate breakout. Listens to GateSet opcodes on
// odd slots `channelBase + 1, +3, +5, ...` (the slots between this DAC's
// pitch channels). Writes a "gate" trace event on every state change.

#include "mb_sim/Clock.h"
#include "mb_sim/Trace.h"
#include "mb_sim/VirtualSpiBus.h"
#include <array>
#include <cstdint>

namespace mb::sim {

class GateBoard {
public:
    static constexpr std::size_t kChannels = 8;

    GateBoard(Clock& clock, Trace& trace, VirtualSpiBus& bus, uint16_t channelBase);

    bool state(uint16_t channel) const;

private:
    void onSpi(mb::proto::Opcode op, const uint8_t* payload, std::size_t len);

    Clock&                       clock_;
    Trace&                       trace_;
    uint16_t                     channelBase_;
    std::array<bool, kChannels>  states_{};
    std::array<bool, kChannels>  seen_{};
};

}  // namespace mb::sim
