#pragma once
// ADR 0009 — CV-producing/routing module base class (firmware skeleton).
//
// Concrete subclasses include `EnvelopeGenerator` (AHDSR), `Lfo`,
// `Sequencer`, `CvBreakout`, `CvBreakIn`, `ControllerBreakIn`.
//
// On the main brain Teensy: a timer ISR calls `tick()` at the control rate
// (1–2 kHz; see ADR 0008). Cross-boundary writes (MIDI ISR / main loop →
// timer ISR state) must be guarded with `__disable_irq()` / `__enable_irq()`
// (same pattern as the Teensy Audio library).

#include "Module.h"

namespace mb::runtime {

class CvModule : public Module {
public:
    using Module::Module;
    // Called once per control tick. Must be lock-free and short.
    virtual void tick() = 0;
};

}  // namespace mb::runtime
