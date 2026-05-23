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
#include <cstdint>

namespace mb::runtime {

// Control rate at which the CV-domain timer ISR calls `tick()`. 1 kHz
// gives 1 ms resolution which is fine for envelopes/LFOs and well within
// the budget of a Teensy 3.x/4.x at the brain's CV update load.
constexpr std::uint32_t kCvTickRateHz = 1000;

class CvModule : public Module {
public:
    using Module::Module;

    // Called once per control tick from the CV-domain timer ISR. Must be:
    //   - lock-free (no mutex, no malloc)
    //   - bounded in runtime (≪ 1 / kCvTickRateHz seconds)
    //   - safe to interleave with `setControl` calls from the main thread
    //     (read-modify-write on shared scalars must be considered).
    // Concrete implementations advance their internal state and update
    // any output values they expose (e.g. `Envelope::value()`).
    virtual void tick() = 0;
};

}  // namespace mb::runtime
