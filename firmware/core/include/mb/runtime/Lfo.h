#pragma once
// ADR 0009 — concrete LFO (low-frequency oscillator) as a CV-producing
// module. Models the same external behaviour as the simulator's
// `Tone.LFO`-backed `Lfo` class so the panel UI maps one-to-one onto
// firmware controls.
//
// Tone.LFO equivalents:
//   - frequency   → `rate` (Hz)
//   - type        → `wave` (sine / triangle / sawtooth / square)
//   - min / max   → derived from `depth` + `bipolar` flag
//
// Panel-only additions (no direct Tone.LFO equivalent):
//   - `wave` index 4 = "S&H" — sample-and-hold of a pseudo-random source,
//     refreshed once per cycle (rising zero-crossing).
//   - `bipolar` (bool): true → output ∈ [-depth, +depth];
//                       false → output ∈ [0, depth].
//   - `run` mode:
//       Always  — free-runs from construction on.
//       Gated   — phase only advances while the gate is high.
//       OneShot — rising gate starts one full cycle, then halts.
//   - `reset` (pulse): resets the phase to 0, regardless of run mode.
//
// All time bookkeeping is in *ticks* at `kCvTickRateHz`, so this class
// has no dependency on Arduino's `millis()` and runs unchanged on the
// host for testing.

#include "CvModule.h"
#include "Registry.h"
#include <cstdint>

namespace mb::runtime {

class Lfo final : public CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_lfo";

    // Waveform selector. Order matches the panel switch (`Sin`, `Tri`,
    // `Saw`, `Sqr`, `S&H`) so the layer-2 integer control value can be
    // cast straight into this enum.
    enum class Wave : std::uint8_t {
        Sine = 0,
        Triangle = 1,
        Sawtooth = 2,
        Square = 3,
        SampleAndHold = 4,
    };

    // Run policy. Order matches the 3-position panel switch
    // (`Always` / `Gated` / `OneShot`).
    enum class Run : std::uint8_t {
        Always   = 0,
        Gated    = 1,
        OneShot  = 2,
    };

    // Construct an Lfo with sensible defaults (1 Hz sine, bipolar, depth 1,
    // free-running). The instance id is opaque to the LFO; it is stored on
    // the `Module` base for identification by the patch system.
    explicit Lfo(std::string_view id);

    // --- Module overrides ------------------------------------------------

    // Apply a layer-2 control change. Unknown control ids are silently
    // ignored so a host can replay an older patch against newer firmware.
    // Supported ids: "rate"|"freq", "wave"|"shape", "depth"|"amount",
    // "bipolar", "run". See header preamble for value semantics.
    void setControl(std::string_view controlId, ControlValue value) override;

    // --- CvModule override ----------------------------------------------

    // Called once per CV tick (1 kHz by default). Advances the phase
    // (subject to run mode + gate), refreshes the S&H sample at cycle
    // boundaries, and updates `value()`.
    void tick() override;

    // --- LFO-specific API -----------------------------------------------

    // Gate input. Meaning depends on `run`:
    //   - Always : ignored.
    //   - Gated  : `open=true` allows phase to advance, `false` freezes it.
    //   - OneShot: rising edge starts a fresh cycle (resets phase). Falling
    //              edge is ignored — the cycle finishes by itself.
    void setGate(bool open);

    // Reset pulse (a single trigger input on the panel). Resets the phase
    // to 0 in every run mode. Does NOT change the gate / running state.
    void reset();

    // Current output value. Range depends on `bipolar` (see preamble).
    // Returned as a normalised float so the same code paths can drive
    // PWM, DAC or audio modulation downstream.
    float value() const { return value_; }

    // True when the LFO is currently producing a time-varying output
    // (i.e. Always-mode, or Gated with gate open, or OneShot mid-cycle).
    // OneShot ends with `running_ = false` after one complete cycle.
    bool running() const { return running_; }

    // Diagnostics for tests / the on-device view: phase in [0,1).
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
    float shCached_    = 0.0f;     // current S&H sample, refreshed each cycle
    std::uint32_t rng_ = 0xA341316Cu;  // xorshift32 state (arbitrary seed)
    float value_       = 0.0f;
};

}  // namespace mb::runtime
