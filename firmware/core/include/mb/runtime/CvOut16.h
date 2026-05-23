#pragma once
// ADR 0009 / ADR 0010 / ADR 0004 \u2014 dedicated pitch / 1V-oct breakout.
//
// 16-bit DAC (DAC8568 reference; 8 channels per chip) with per-oscillator
// calibration table applied on the board. The brain still ships a
// normalised float \u2014 calibration is a board concern so that swapping
// VCOs does not require a brain firmware flash.
//
// This class is currently a thin subclass of `CvBreakout` reusing the
// `CvOut12` framing path (the wire opcode is identical \u2014 CvSet \u2014 only
// the i16 \u2192 voltage scaling on the *board* differs). A dedicated cpp
// will land alongside the first real pitch-board hardware tests.

#include "CvBreakout.h"
#include "Registry.h"

namespace mb::runtime {

class CvOut16 final : public CvBreakout {
public:
    static constexpr const char* kTypeId = "tp_mmb_cv_out_16";
    static constexpr std::uint8_t kDefaultSlotCount = 8;

    explicit CvOut16(std::string_view id,
                     std::uint8_t caseId = 0,
                     std::uint8_t firstSlot = 0,
                     std::uint8_t slotCount = kDefaultSlotCount)
        : CvBreakout(kTypeId, id, caseId, firstSlot, slotCount) {}

    void tick() override;
    static void registerFactory();
};

}  // namespace mb::runtime
