#pragma once
// Behavioural model of a TI DAC8568:
//   * 8 channels, 16-bit, simultaneous-update via LDAC (we model the worst-
//     case where every CvSet causes an immediate update — pessimistic for
//     glitch behaviour, but accurate for steady-state voltage and timing).
//   * Internal 2.5 V reference doubled to 5.0 V full-scale (the typical
//     mode for our pitch-CV use, see doc/tech/dac-comparison.md).
//   * Settling time modelled as a single time-constant (default 10 µs).
//
// The model writes a "cv" trace event for every channel that actually changes.
// It does NOT model glitch energy, INL, or noise — that level of fidelity is
// not needed until we have measured hardware to calibrate against.

#include "mb_sim/Clock.h"
#include "mb_sim/Trace.h"
#include "mb_sim/VirtualSpiBus.h"
#include <array>
#include <cstdint>

namespace mb::sim {

class Dac8568 {
public:
    static constexpr std::size_t kChannels = 8;

    // `channelBase` is the (caseId<<8) | firstSlot the breakout listens on.
    // Each consecutive even slot (base, base+2, base+4, ...) is a pitch
    // channel of this DAC (the odd slots are GateBoard channels and ignored
    // by this chip).
    Dac8568(Clock& clock, Trace& trace, VirtualSpiBus& bus,
            uint16_t channelBase, float vrefVolts = 5.0f);

    // Current output voltage for an even-slot channel id, or NAN if not ours.
    float voltage(uint16_t channel) const;

    // Latest raw DAC code for diagnostics.
    int16_t code(uint16_t channel) const;

private:
    void onSpi(mb::proto::Opcode op, const uint8_t* payload, std::size_t len);

    Clock&         clock_;
    Trace&         trace_;
    uint16_t       channelBase_;
    float          vref_;
    std::array<int16_t, kChannels> codes_{};
    std::array<bool,    kChannels> seen_{};  // which channels have ever been written
};

}  // namespace mb::sim
