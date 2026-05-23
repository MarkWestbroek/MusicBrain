#pragma once
// ADR 0009 — concrete AHDSR envelope.
//
// Modelled after the working Teensy 3.1 prototype in
// `doc/old-code/ADSR/v3/.../Envelope.{h,cpp}` but adapted to the
// ISR-tick model defined in ADR 0008:
//   - the old code polled `millis()` from a busy loop;
//   - this version is driven by `tick()` at `kCvTickRateHz`, so the
//     elapsed time of a phase is simply the tick counter.
//
// Phase machine (unchanged from the prototype):
//   gate-open  (from O/D/S/R) → A → H → D → S
//   gate-close (from A/H/D/S) → R → O
//   if loop && phase == R    → A (instead of O)
//
// Controls (TS-layer-2 ids match `tp_mmb_ahdsr`):
//   attack   float   ms   ≥ 0
//   hold     float   ms   ≥ 0
//   decay    float   ms   ≥ 0
//   sustain  float   0..1
//   release  float   ms   ≥ 0
//   loop     bool         if true, jumps back to Attack after Release
//   curve    int    0=Lin (default), 1=Exp, 2=Log
//
// Curve affects only the Attack / Decay / Release ramp shape — Hold and
// Sustain are always flat. The shape is applied as a pow() on the linear
// progress, so the start/end values are identical to the linear case and
// only the in-between trajectory changes. This keeps phase-transition
// thresholds (≥1.0, ≤sustain, ≤0) working unchanged.

#include "Envelope.h"
#include "Registry.h"
#include <cstdint>

namespace mb::runtime {

class Ahdsr final : public Envelope {
public:
    static constexpr const char* kTypeId = "tp_mmb_ahdsr";

    // Internal phase state, exposed for diagnostics (tests + on-device view).
    // The fixed integer values match the prototype enum so any saved logs
    // remain comparable.
    enum class Phase : std::uint8_t { Zero, Attack, Hold, Decay, Sustain, Release };

    // Curve shape for Attack / Decay / Release. Matches the 3-position
    // panel switch labelled `Lin / Exp / Log`.
    enum class Curve : std::uint8_t { Linear = 0, Exponential = 1, Logarithmic = 2 };

    // Construct an envelope in the `Zero` (idle) phase. The instance id
    // is stored on the Module base for identification by the patch system;
    // the envelope itself only uses its own internal state.
    explicit Ahdsr(std::string_view id);

    // --- Module override -------------------------------------------------

    // Apply a layer-2 control change. Times come in as floats in *milli-
    // seconds*; the implementation converts to ticks once and never
    // touches floating-point time per tick. Unknown ids are no-ops.
    void setControl(std::string_view controlId, ControlValue value) override;

    // --- CvModule override -----------------------------------------------

    // Called once per CV tick. Advances `phaseTicks_`, recomputes `value_`
    // through the curve function for the current phase, and triggers a
    // phase transition when a threshold is hit. Safe to call from an ISR.
    void tick() override;

    // --- Envelope overrides ----------------------------------------------

    // Gate input. Rising edge: starts Attack from Zero, or retriggers
    // from D/S/R while preserving the current value (avoids clicks).
    // Falling edge: from A/H/D/S → Release, starting from current value.
    // No-op if the requested transition is not allowed in the current
    // phase (e.g. opening the gate while already in Attack / Hold).
    void setGate(bool open) override;

    // Current envelope output, normalised 0..1.
    float value() const override { return value_; }

    // True while the envelope is producing a non-idle value. Used by the
    // voice allocator to know when a voice slot becomes free again.
    bool  active() const override { return phase_ != Phase::Zero; }

    // Current phase. Public for tests and the on-device view.
    Phase phase() const { return phase_; }
    Curve curve() const { return curve_; }

    // Register the factory with the global registry. Idempotent. Called
    // automatically at static-init time by the translation unit; tests
    // can also call it explicitly if they construct an isolated registry.
    static void registerFactory();

private:
    // Move to the next phase per the state machine
    // (see header preamble in Ahdsr.cpp). Resets `phaseTicks_`.
    void advancePhase();

    // Compute the current value from the current phase, `phaseTicks_`,
    // and the curve setting. Pure function of state — easy to test.
    float computeValue() const;

    // Apply the curve shape to a linear progress value `p ∈ [0,1]`. The
    // returned value is also in [0,1]; for Linear it is the identity.
    // Exp accelerates the end of the ramp; Log accelerates the start.
    float shape(float p) const;

    // Tick→ms conversion (1 ms per tick at 1 kHz). `constexpr` so the
    // compiler folds it at every call site that has a literal argument.
    static constexpr std::uint32_t msToTicks(float ms) {
        return ms <= 0.0f ? 0u
                          : static_cast<std::uint32_t>(ms * (kCvTickRateHz / 1000.0f));
    }

    // Parameters (durations are stored as ticks; converted from ms by setControl).
    std::uint32_t attackTicks_  = msToTicks(10.0f);
    std::uint32_t holdTicks_    = 0;
    std::uint32_t decayTicks_   = msToTicks(200.0f);
    float         sustainLevel_ = 0.7f;
    std::uint32_t releaseTicks_ = msToTicks(300.0f);
    bool          loop_         = false;
    Curve         curve_        = Curve::Linear;

    // State.
    Phase         phase_ = Phase::Zero;
    std::uint32_t phaseTicks_ = 0;
    float         value_ = 0.0f;
    float         releaseFromLevel_ = 0.0f;
};

}  // namespace mb::runtime
