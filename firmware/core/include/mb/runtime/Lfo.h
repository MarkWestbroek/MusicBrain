#pragma once
/**
 * @file Lfo.h
 * @brief Concrete LFO (Low-Frequency Oscillator) module, tick-driven at 1 kHz.
 *
 * @details
 * Produces a periodic CV signal at frequencies well below the audio range.
 * The waveform, rate, depth, polarity, and run policy are all configurable
 * as layer-2 controls from the editor.
 *
 * **Waveforms** (`wave` control):
 * | Value | Name           | Description                               |
 * |-------|----------------|-------------------------------------------|
 * | 0     | Sine           | Smooth sinusoidal wave                    |
 * | 1     | Triangle       | Linear rise/fall                          |
 * | 2     | Sawtooth       | Linear ramp-up, instant reset             |
 * | 3     | Square         | Alternates \u00b1depth with no transition       |
 * | 4     | Sample & Hold  | Pseudo-random value refreshed each cycle  |
 *
 * **Polarity** (`bipolar` control):
 * - `true`  \u2192 output \u2208 [\u2212depth, +depth]
 * - `false` \u2192 output \u2208 [0, depth]   (unipolar, suits VCA depth modulation)
 *
 * **Run modes** (`run` control):
 * | Value | Name     | Behaviour                                           |
 * |-------|----------|-----------------------------------------------------|
 * | 0     | Always   | Free-runs continuously from construction             |
 * | 1     | Gated    | Phase advances only while the gate input is high     |
 * | 2     | OneShot  | Rising gate edge starts one full cycle, then halts  |
 *
 * **`reset` control (pulse):**
 * Resets the phase to 0 regardless of run mode.  Can be patched as a CV
 * trigger input to synchronise multiple LFOs.
 *
 * **`rate_cv` input (CV):**
 * Exponentially modulates the base rate: a value of +1 multiplies the rate
 * by 2^`kRateCvOctaves`, −1 divides it by the same factor, 0 leaves it at
 * the `rate` control.  Lets an envelope or another LFO sweep the speed.
 *
 * **Outputs:**
 * - `out`     — the LFO value.
 * - `out_inv` — the same value negated (handy for complementary modulation,
 *   e.g. one VCA up while another goes down).
 *
 * **Implementation:**
 * All time bookkeeping is in ticks at `kCvTickRateHz` (1 kHz), so the
 * class has no dependency on Arduino's `millis()` and runs identically
 * on the host for unit testing.  The S&H value is refreshed once per
 * cycle at the rising zero-crossing using a 32-bit xorshift PRNG.
 *
 * **Editor mirror:** `tp_mmb_lfo` in
 * `editor/src/modular-mb/seedModules.ts::mmbLfo()`.  The control ids and
 * value ranges are shared with the browser-side Tone.LFO-backed simulator.
 *
 * **ADR references:** ADR-0008 (CV tick), ADR-0009 (module hierarchy).
 */

#include "CvModule.h"
#include "Registry.h"
#include <cstdint>

namespace mb::runtime {

/** @brief Concrete LFO module. */
class Lfo final : public CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_lfo";

    /** @brief Waveform selector.
     *  Order matches the 5-position panel switch so the layer-2 integer
     *  control value can be cast directly to this enum. */
    enum class Wave : std::uint8_t {
        Sine = 0,
        Triangle = 1,
        Sawtooth = 2,
        Square = 3,
        SampleAndHold = 4,
    };

    /** @brief Run-mode selector.
     *  Order matches the 3-position panel switch (`Always`/`Gated`/`OneShot`). */
    enum class Run : std::uint8_t {
        Always   = 0,
        Gated    = 1,
        OneShot  = 2,
    };

    /** @brief Construct an LFO with sensible defaults: 1 Hz sine, bipolar, depth 1, free-running. */
    explicit Lfo(std::string_view id);

    // --- Module overrides ------------------------------------------------

    /** @brief Apply a layer-2 control change.
     *  Supported ids: `"rate"` / `"freq"`, `"wave"` / `"shape"`,
     *  `"depth"` / `"amount"`, `"bipolar"`, `"run"`.  Unknown ids are
     *  silently ignored for backwards compatibility. */
    void setControl(std::string_view controlId, ControlValue value) override;

    // --- CvModule override ----------------------------------------------

    /** @brief Advance the LFO by one CV tick (1 ms).
     *  Updates the phase (subject to run mode and gate state), refreshes
     *  the S&H sample at cycle boundaries, and recomputes `value()`. */
    void tick() override;

    // --- LFO-specific API -----------------------------------------------

    /** @brief Set the gate input.
     *  - **Always**: ignored.
     *  - **Gated**: `true` allows the phase to advance; `false` freezes it.
     *  - **OneShot**: a rising edge (`false` → `true`) starts a fresh cycle;
     *    the falling edge is ignored. */
    void setGate(bool open);

    /** @brief Pulse the reset input: resets the phase to 0 in every run mode.
     *  Can be driven by a CV trigger to synchronise multiple LFOs. */
    void reset();

    // --- Port-kind / CV-bridge -----------------------------------------

    /** @brief `gate` and `reset` are gate-domain inputs; `rate_cv` is CV. */
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "gate" || portId == "reset") return PortKind::Gate;
        if (portId == "rate_cv")                   return PortKind::Cv;
        return PortKind::None;
    }
    /** @brief `out` and `out_inv` are CV outputs. */
    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out" || portId == "out_inv") ? PortKind::Cv
                                                         : PortKind::None;
    }
    /** @brief CV bridge entry point.  `gate` drives the run-mode gate;
     *  `reset` pulses the phase reset on a rising edge (0 → 1);
     *  `rate_cv` exponentially modulates the rate (see header). */
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "gate") {
            setGate(value >= 0.5f);
        } else if (portId == "reset") {
            const bool high = value >= 0.5f;
            if (high && !lastResetHigh_) reset();
            lastResetHigh_ = high;
        } else if (portId == "rate_cv") {
            rateCv_ = value;
        }
    }
    /** @brief CV bridge sample point.  `out` returns the current LFO value;
     *  `out_inv` returns its negation. */
    float readCvPort(std::string_view portId) const override {
        if (portId == "out")     return value_;
        if (portId == "out_inv") return -value_;
        return 0.0f;
    }

    /** @brief Current output value.
     *  Range: [−depth, +depth] in bipolar mode; [0, depth] in unipolar mode.
     *  Returned as float so the same signal can drive PWM, DAC, or audio
     *  modulation downstream. */
    float value() const { return value_; }

    /** @brief True while the LFO is advancing its phase.
     *  Always-mode → always true; Gated → true while gate is open;
     *  OneShot → true during the single cycle, false afterwards. */
    bool running() const { return running_; }

    /** @brief Current phase position in [0, 1), for diagnostics and tests. */
    float phase() const { return phase_; }

    // Register the factory with the global registry. Idempotent. Called
    // automatically at static-init time by the translation unit; tests
    // can call it explicitly when they construct an isolated registry.
    static void registerFactory();

private:
    // Maps the phase ∈ [0,1) to a raw waveform value in [-1, +1].
    // For S&H the raw value comes from the cached random sample instead
    // of a continuous function.
    float waveValue(float phase) const;

    // Maps the raw waveform value [-1, +1] through depth + bipolar to the
    // public `value_` field. Centralised so panel-mode changes (bip on/off,
    // depth slider) take effect on the very next tick.
    float applyShape(float raw) const;

    // Advance one xorshift step. Used by S&H. Kept inline + private so the
    // RNG is fully deterministic per instance (good for replay tests).
    std::uint32_t nextRandom();

    // Parameters.
    float rateHz_   = 1.0f;
    float depth_    = 1.0f;
    Wave  wave_     = Wave::Sine;
    bool  bipolar_  = true;
    Run   run_      = Run::Always;

    // State.
    float phase_       = 0.0f;     // [0, 1)
    bool  running_     = true;     // see `running()`
    bool  lastGate_    = false;    // for rising-edge detection in OneShot
    bool  lastResetHigh_ = false;  // for rising-edge detection on the reset CV input
    float rateCv_      = 0.0f;     // exponential rate modulation from `rate_cv` input
    float shCached_    = 0.0f;     // current S&H sample, refreshed each cycle
    std::uint32_t rng_ = 0xA341316Cu;  // xorshift32 state (arbitrary seed)
    float value_       = 0.0f;
};

}  // namespace mb::runtime
