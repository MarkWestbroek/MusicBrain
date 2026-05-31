#pragma once
/**
 * @file Seq16.h
 * @brief 16-step CV/Gate sequencer module (typeId `tp_mmb_seq8`), tick-driven
 *        at 1 kHz (FW-SQ-1).
 *
 * @details
 * The firmware counterpart of the editor's `mmbSeq8()` ("SEQ-16").  Each step
 * holds a semitone offset relative to a root note; the sequencer walks the
 * first `length` steps at `rate` Hz and emits a V/Oct CV, a gate, and a short
 * trigger pulse per step.
 *
 * Being a pure CV-domain @ref CvModule, all time bookkeeping is in 1 ms ticks
 * (`kCvTickRateHz`), so it runs identically on the host for unit testing — no
 * Arduino dependency.
 *
 * **Run modes** (`run` control, matches the 3-position panel switch):
 * | Value | Name | Behaviour                                                  |
 * |-------|------|------------------------------------------------------------|
 * | 0     | Free | Free-runs on the internal `rate` clock.                    |
 * | 1     | Off  | Bypass: `cv` = `voct_in`, `gate_out` = `run_in` (a wire).  |
 * | 2     | Gate | Internal clock advances only while `run_in` is high.       |
 *
 * **External clock:** once a `clock` edge is received the sequencer switches
 * to external clocking (steps advance on each rising clock edge) and ignores
 * the internal `rate`.  `reset` returns the sequence to step 0.
 *
 * Port map:
 * | Direction | portId     | Domain   | Meaning                          |
 * |-----------|------------|----------|----------------------------------|
 * | input     | `clock`    | Gate     | external step clock (rising edge)|
 * | input     | `reset`    | Gate     | rising edge → step 0             |
 * | input     | `voct_in`  | Cv       | transpose (added to CV); root in Off mode |
 * | input     | `run_in`   | Gate     | run/gate enable (Gate/Off modes) |
 * | output    | `cv`       | Cv       | V/Oct of the current step        |
 * | output    | `gate_out` | Gate     | high for `gate` fraction of step |
 * | output    | `trig`     | Gate     | short pulse at each step start   |
 *
 * Controls:
 * | controlId | type    | range      | default | effect                     |
 * |-----------|---------|------------|---------|----------------------------|
 * | `s1`…`s16`| float   | −24 … +24  | 0       | Step semitone offset       |
 * | `root`    | float   | 24 … 96    | 60      | Root MIDI note (60 = 0 V)  |
 * | `rate`    | float   | 0.5 … 16   | 4       | Internal clock rate (Hz)   |
 * | `gate`    | float   | 0.05 … 0.95| 0.5     | Gate length (step fraction)|
 * | `length`  | int32_t | 2 … 16     | 8       | Active step count          |
 * | `run`     | int32_t | 0 … 2      | 0       | Run mode (Free/Off/Gate)   |
 *
 * **Editor mirror:** `tp_mmb_seq8` in `seedModules.ts::mmbSeq8()`.
 */

#include "CvModule.h"
#include "Registry.h"
#include <array>
#include <cstdint>

namespace mb::runtime {

/** @brief 16-step CV/Gate sequencer. */
class Seq16 final : public CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_seq8";
    static constexpr int          kSteps = 16;

    /** @brief Run-mode selector (matches the panel switch order). */
    enum class Run : std::uint8_t { Free = 0, Off = 1, Gate = 2 };

    explicit Seq16(std::string_view id);

    // --- Module overrides ------------------------------------------------

    void setControl(std::string_view controlId, ControlValue value) override;

    // --- CvModule override ----------------------------------------------

    /** @brief Advance the sequencer by one 1 ms tick. */
    void tick() override;

    // --- Port-kind / CV-bridge -----------------------------------------

    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "clock" || portId == "reset" || portId == "run_in")
            return PortKind::Gate;
        if (portId == "voct_in") return PortKind::Cv;
        return PortKind::None;
    }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "cv")                              return PortKind::Cv;
        if (portId == "gate_out" || portId == "trig")    return PortKind::Gate;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override;
    float readCvPort(std::string_view portId) const override;

    // --- Diagnostics / tests --------------------------------------------

    /** @brief Current step index (0-based). */
    int currentStep() const { return step_; }
    /** @brief True while the gate output is high. */
    bool gateHigh() const { return gateTicks_ > 0; }

    static void registerFactory();

private:
    /** @brief Move to the next active step and (re)arm gate + trig pulses. */
    void advanceStep();

    /** @brief V/Oct for the current step, including the `voct_in` transpose. */
    float stepVolts() const;

    std::array<float, kSteps> steps_{};   ///< Per-step semitone offsets.
    float        root_      = 60.0f;      ///< Root MIDI note (60 = 0 V).
    float        rateHz_    = 4.0f;       ///< Internal clock rate.
    float        gateFrac_  = 0.5f;       ///< Gate length as step fraction.
    int          length_    = 8;          ///< Active step count (2..16).
    Run          run_       = Run::Free;

    // Live state.
    int          step_      = 0;          ///< Current step index.
    float        phase_     = 0.0f;       ///< Internal-clock phase [0,1).
    std::int32_t gateTicks_ = 0;          ///< Remaining gate-high ticks.
    std::int32_t trigTicks_ = 0;          ///< Remaining trig-pulse ticks.
    std::int32_t stepTicks_ = 0;          ///< Length of the current step (ticks).

    // CV-input state + edge detectors.
    float        voctIn_      = 0.0f;
    bool         runInHigh_   = false;
    bool         lastClock_   = false;
    bool         lastReset_   = false;
    bool         externalClock_ = false;  ///< True once a clock edge arrived.

    /// Trigger pulse width in ticks (~2 ms).
    static constexpr std::int32_t kTrigTicks = 2;
};

}  // namespace mb::runtime
