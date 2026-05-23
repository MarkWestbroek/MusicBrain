#pragma once
// ADR 0009 / ADR 0010 \u2014 digital gate / trigger breakout.
//
// N-channel digital output. A patch writes a float per slot; any value
// > 0.5 is sent as gate-high, anything else as gate-low. Trigger pulses
// (fixed-duration highs that fall back automatically) are scheduled by
// upstream `Trigger` modules; this class is dumb about timing.

#include "CvBreakout.h"
#include "Registry.h"

namespace mb::runtime {

class GateOut final : public CvBreakout {
public:
    static constexpr const char* kTypeId = "tp_mmb_gate_out";
    static constexpr std::uint8_t kDefaultSlotCount = 8;

    explicit GateOut(std::string_view id,
                     std::uint8_t caseId = 0,
                     std::uint8_t firstSlot = 0,
                     std::uint8_t slotCount = kDefaultSlotCount)
        : CvBreakout(kTypeId, id, caseId, firstSlot, slotCount) {}

    void tick() override;
    static void registerFactory();

private:
    // Last sent gate state \u2014 used to suppress redundant frames so the
    // bus does not carry one frame per tick on a quiescent gate.
    std::array<bool, kMaxBreakoutSlots> lastSent_{};
    std::array<bool, kMaxBreakoutSlots> hasSent_{};
};

}  // namespace mb::runtime
