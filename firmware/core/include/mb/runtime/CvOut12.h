#pragma once
// ADR 0009 / ADR 0010 / ADR 0004 — 8-channel 12-bit modulation breakout.
//
// Matches the dac-sh-mux design (`doc/tech/dac-sh-mux.md`): one 12-bit DAC
// drives 8 outputs via a CD4051 + SMP08 S&H bank. Voltage range is a
// property of the board (0..5 V, +-5 V, 0..10 V, ...); the brain only
// ships a normalised float and the board scales it. Pitch / 1V-oct never
// goes through this class \u2014 use `CvOut16` for that.
//
// Each `tick()` walks the dirty list and sends a `CvSet` (curve 0 \u2014
// hold) frame for every slot that changed. For smooth ramps the upstream
// CV module should send `CvSegment` instead; this scaffolding keeps it
// simple and adds segmenting later when a concrete patch needs it.

#include "CvBreakout.h"
#include "Registry.h"

namespace mb::runtime {

class CvOut12 final : public CvBreakout {
public:
    static constexpr const char* kTypeId = "tp_mmb_cv_out_12";
    static constexpr std::uint8_t kDefaultSlotCount = 8;

    explicit CvOut12(std::string_view id,
                     std::uint8_t caseId = 0,
                     std::uint8_t firstSlot = 0,
                     std::uint8_t slotCount = kDefaultSlotCount)
        : CvBreakout(kTypeId, id, caseId, firstSlot, slotCount) {}

    // Drains dirty slots; encodes one CvSet frame per slot per tick.
    // Bit-depth quantisation happens on the board, not here \u2014 the
    // i16 wire value spans the full \u00b1full-scale range and the board
    // truncates to its DAC resolution.
    void tick() override;

    // Idempotent factory registration. Called automatically at static-init.
    static void registerFactory();
};

}  // namespace mb::runtime
