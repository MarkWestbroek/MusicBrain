#pragma once
/**
 * @file Ahdsr.h
 * @brief Concrete AHDSR (Attack / Hold / Decay / Sustain / Release) envelope
 *        generator, driven by the 1 kHz CV tick ISR.
 *
 * @details
 * Modelled after the working Teensy 3.1 prototype in
 * `doc/old-code/ADSR/v3/`, ported from a busy-polling `millis()` loop to
 * the ISR-tick model (ADR-0008): `tick()` is called once per millisecond, so
 * the elapsed time of a phase equals its tick counter \u00d7 1 ms.
 *
 * **Phase state machine:**
 * ```
 * gate opens  (from Zero/D/S/R) \u2192 Attack \u2192 Hold \u2192 Decay \u2192 Sustain
 * gate closes (from A/H/D/S)   \u2192 Release \u2192 Zero
 * if loop && Release finishes  \u2192 Attack  (loop mode)
 * ```
 * Retrigger while already in D/S/R preserves the current value to avoid
 * amplitude clicks.
 *
 * **Layer-2 controls (`setControl()`):**
 * | controlId  | type  | unit | range        |
 * |------------|-------|------|--------------|
 * | `attack`   | float | ms   | \u2265 0           |
 * | `hold`     | float | ms   | \u2265 0           |
 * | `decay`    | float | ms   | \u2265 0           |
 * | `sustain`  | float | \u2014    | 0 \u2026 1         |
 * | `release`  | float | ms   | \u2265 0           |
 * | `loop`     | bool  | \u2014    | false / true |
 * | `curve`    | int   | \u2014    | 0=Lin, 1=Exp, 2=Log |
 *
 * **Curve:**
 * Applies only to the ramping phases (Attack/Decay/Release).  Hold and
 * Sustain are always flat.  The curve is implemented as `pow(linear, exp)`,
 * so start and end values are identical to the linear case; only the
 * in-between trajectory changes.  Phase-transition thresholds (`\u2265 1.0`,
 * `\u2264 sustain`, `\u2264 0`) therefore work unchanged regardless of curve selection.
 *
 * **Thread safety:**
 * `tick()` runs from the CV ISR; `setControl()` and `setGate()` are called
 * from the main thread.  ARM Cortex-M7 single-word reads/writes are atomic,
 * but multi-field updates use `__disable_irq()` / `__enable_irq()` to
 * prevent torn reads between `value_` and `phase_`.
 *
 * **Editor mirror:** `tp_mmb_ahdsr` in
 * `editor/src/modular-mb/seedModules.ts::mmbAhdsr()`.
 *
 * **ADR references:** ADR-0008 (CV tick), ADR-0009 (module hierarchy).
 */

#include "Envelope.h"
#include "Registry.h"
#include <cstdint>

namespace mb::runtime {

/** @brief Concrete AHDSR envelope generator. */
class Ahdsr final : public Envelope {
public:
    static constexpr const char* kTypeId = "tp_mmb_ahdsr";

    /** @brief Internal phase state.
     *  Exposed publicly for diagnostic use (tests and on-device displays).
     *  The fixed integer values are kept stable so any saved log output
     *  remains comparable across firmware versions. */
    enum class Phase : std::uint8_t { Zero, Attack, Hold, Decay, Sustain, Release };

    /** @brief Ramp-curve shape for Attack, Decay, and Release phases.
     *  Matches the 3-position panel switch labelled "Lin / Exp / Log". */
    enum class Curve : std::uint8_t { Linear = 0, Exponential = 1, Logarithmic = 2 };

    /** @brief Construct an envelope starting in the `Zero` (idle) phase. */
    explicit Ahdsr(std::string_view id);

    // --- Module override -------------------------------------------------

    /** @brief Apply a layer-2 control change.
     *  Times arrive as floats in milliseconds and are converted to ticks
     *  once on assignment; no floating-point arithmetic occurs per tick.
     *  Unknown control ids are silently ignored. */
    void setControl(std::string_view controlId, ControlValue value) override;

    // --- CvModule override -----------------------------------------------

    /** @brief Advance the envelope by one CV tick (1 ms).
     *  Updates `value_`, triggers phase transitions at the appropriate
     *  thresholds.  Safe to call from a timer ISR. */
    void tick() override;

    // --- Envelope overrides ----------------------------------------------

    /** @brief Set the gate (trigger) input.
     *  Rising edge: starts Attack from Zero, or retriggers from D/S/R while
     *  preserving the current output value to avoid amplitude clicks.
     *  Falling edge: transitions A/H/D/S → Release from the current value.
     *  Transitions that are not allowed in the current phase are no-ops. */
    void setGate(bool open) override;

    // --- Port-kind / CV-bridge -----------------------------------------

    /** @brief `gate`/`trig` are gate-domain inputs; `cv_out` is a CV output. */
    PortKind inputPortKind(std::string_view portId) const override {
        return (portId == "gate" || portId == "trig") ? PortKind::Gate
                                                      : PortKind::None;
    }
    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "cv_out") ? PortKind::Cv : PortKind::None;
    }
    /** @brief CV bridge entry point.  `gate` / `trig` accept 0.0 / 1.0. */
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "gate" || portId == "trig") setGate(value >= 0.5f);
    }
    /** @brief CV bridge sample point.  `cv_out` returns the envelope value. */
    float readCvPort(std::string_view portId) const override {
        return (portId == "cv_out") ? value_ : 0.0f;
    }

    /** @brief Current envelope output, normalised to [0.0 … 1.0]. */
    float value() const override { return value_; }

    /** @brief True while the envelope is producing a non-idle (non-Zero) value.
     *  Used by the voice allocator to detect when a voice slot is free again. */
    bool  active() const override { return phase_ != Phase::Zero; }

    /** @brief Current phase, for diagnostics and tests. */
    Phase phase() const { return phase_; }

    /** @brief Current curve setting. */
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
