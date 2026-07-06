#pragma once
/**
 * @file LadderModule.h
 * @brief Ladder VCF module (typeId `tp_mmb_ladder`): wraps `AudioFilterLadder`.
 *
 * @details
 * Moog-style 4-pole lowpass (Huovilainen New Moog model, CMJ jun 2006; Teensy
 * object by Richard van Hoesel).  Unlike `AudioFilterStateVariable` this
 * object has **three** audio-rate inputs, so both cutoff *and* resonance are
 * modulated through the audio graph via DC proxies — true audio-rate Q-CV.
 *
 * Port map:
 * | Direction | portId | Domain | Stream / channel                        |
 * |-----------|--------|--------|-----------------------------------------|
 * | input     | `in`   | Audio  | `ladder_`, channel 0                    |
 * | input     | `cv`   | Cv     | internal `fcDc_` -> `ladder_` channel 1 |
 * | input     | `q_cv` | Cv     | internal `qDc_`  -> `ladder_` channel 2 |
 * | output    | `out`  | Audio  | `ladder_`, channel 0 (LP 24 dB/oct)     |
 *
 * **CV scaling.**
 * Channel 1 (frequency) works like the SVF: a full-scale signal shifts the
 * cutoff by `octaveControl()` octaves, so `cv` mirrors VcfModule exactly.
 * Channel 2 (resonance) adds `sample * 4.0` to the internal feedback gain
 * `K = 4 * resonance`, i.e. a full-scale signal adds exactly +1.0 in
 * `resonance()` units.  `writeCvPort("q_cv", v)` therefore drives `qDc_` with
 * `v * q_cv_amt` so `q_cv_amt` is calibrated in resonance units per
 * full-scale CV.  Note the DC proxy saturates at amplitude 1.0, which caps
 * the CV contribution at +1.0 resonance — combined with the base `q` knob
 * (max 1.8) that still covers the filter's full 0 … 1.8 range
 * (self-oscillation starts around 1.1).
 *
 * Controls:
 * | controlId  | type  | effect                                          |
 * |------------|-------|--------------------------------------------------|
 * | `cutoff`   | float | Base cutoff frequency in Hz (max ~18.7 kHz)      |
 * | `q`        | float | Base resonance 0 … 1.8 (self-osc above ~1.1)     |
 * | `drive`    | float | Input drive 0 … 4 (>1 overdrives, tanh clipping) |
 * | `cv_amt`   | float | Cutoff-CV depth in octaves (0 … 7)               |
 * | `q_cv_amt` | float | Q-CV depth in resonance units (0 … 1)            |
 * | `drive_cv_amt` | float | Drive-CV depth: ±1 CV ⇒ drive ×4…÷4 bij amt 1 |
 *
 * CPU (Teensy 4.x): ~1% static, ~2-3% with both CV inputs active.
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <string_view>

namespace mmb_link {

/** @brief Moog-style ladder filter backed by `AudioFilterLadder`. */
class LadderModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_ladder";

    explicit LadderModule(std::string_view id)
        : AudioModule(kTypeId, id)
    {
        ladder_.frequency(2000.0f);
        ladder_.resonance(0.7f);
        ladder_.octaveControl(cvAmt_);  // cutoff-CV depth in octaves
        ladder_.inputDrive(1.0f);
        fcDc_.amplitude(0.0f);          // no modulation until the CV bridge drives it
        qDc_.amplitude(0.0f);
    }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out")
            return { const_cast<AudioFilterLadder*>(&ladder_), 0, true };
        return {};
    }

    /* Only `in` is an audio port; `cv` and `q_cv` are CV-domain (see file
     * header) and intentionally not resolvable here, so AudioGraph never
     * wires them. */
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in")
            return { const_cast<AudioFilterLadder*>(&ladder_), 0, true };
        return {};
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>   (&value)) return *f;
            if (auto* i = std::get_if<int32_t> (&value)) return static_cast<float>(*i);
            return fallback;
        };
        if (controlId == "cutoff") {
            ladder_.frequency(asFloat(2000.0f));
        } else if (controlId == "q") {
            ladder_.resonance(asFloat(0.7f));  // clamps to 0 … 1.8 internally
        } else if (controlId == "drive") {
            driveBase_ = asFloat(1.0f);
            applyDrive();                      // clamps to 0 … 4 internally
        } else if (controlId == "cv_amt") {
            cvAmt_ = asFloat(2.0f);
            ladder_.octaveControl(cvAmt_);     // clamps to 0 … 7 internally
        } else if (controlId == "q_cv_amt") {
            qCvAmt_ = asFloat(0.5f);
        } else if (controlId == "drive_cv_amt") {
            driveCvAmt_ = asFloat(0.5f);
        }
    }

    // --- Port-kind / CV-bridge -----------------------------------------

    /** @brief `cv` (cutoff), `q_cv` (resonance) en `drive_cv` zijn CV-domein. */
    PortKind inputPortKind(std::string_view portId) const override {
        return (portId == "cv" || portId == "q_cv" || portId == "drive_cv")
                   ? PortKind::Cv : PortKind::None;
    }

    /** @brief CV bridge entry point: drive the DC proxies.  Both slewed over
     *  `kCvSlewMs` to de-zipper the ~1 kHz control tick (see VcaModule).
     *  Drive heeft geen CV-ingang op `AudioFilterLadder`; die gaat als
     *  setter-write op de 1 kHz-tick (single-float write, ISR-veilig). */
    void writeCvPort(std::string_view portId, float value) override {
        if      (portId == "cv")   fcDc_.amplitude(value, kCvSlewMs);
        else if (portId == "q_cv") qDc_.amplitude(value * qCvAmt_, kCvSlewMs);
        else if (portId == "drive_cv") {
            driveCv_ = value < -1.0f ? -1.0f : (value > 1.0f ? 1.0f : value);
            applyDrive();
        }
    }

    /** @brief Register the ladder factory with the global Registry.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<LadderModule>(id);
            });
    }

private:
    mutable AudioFilterLadder ladder_;
    mutable AudioSynthWaveformDc fcDc_;  ///< CV-bridge cutoff-modulation proxy.
    mutable AudioSynthWaveformDc qDc_;   ///< CV-bridge resonance-modulation proxy.
    /// Internal patches: DC proxies -> ladder control inputs, always on.
    AudioConnection fcPatch_{ fcDc_, 0, ladder_, 1 };
    AudioConnection qPatch_ { qDc_,  0, ladder_, 2 };
    /// Effectieve drive = base × 2^(2·amt·cv), door inputDrive op 0…4 geklemd.
    void applyDrive() {
        ladder_.inputDrive(driveBase_ * exp2f(2.0f * driveCvAmt_ * driveCv_));
    }

    float cvAmt_      = 2.0f;  ///< Cutoff-mod depth in octaves (octaveControl).
    float qCvAmt_     = 0.5f;  ///< Q-mod depth in resonance units per full-scale CV.
    float driveBase_  = 1.0f;  ///< Basis-drive (control `drive`).
    float driveCv_    = 0.0f;  ///< Drive-CV scalar (±1).
    float driveCvAmt_ = 0.5f;  ///< Drive-CV-diepte (doseerknop).

    /// DC slew time (ms) per CV update — de-zippers the ~1 kHz control tick.
    static constexpr float kCvSlewMs = 2.0f;
};

}  // namespace mmb_link
