#pragma once
/**
 * @file VcfModule.h
 * @brief VCF module (typeId `tp_mmb_vcf`): wraps `AudioFilterStateVariable`.
 *
 * @details
 * Port map:
 * | Direction | portId | Domain | Stream / channel                     |
 * |-----------|--------|--------|--------------------------------------|
 * | input     | `in`   | Audio  | `vcf_`, channel 0                    |
 * | input     | `cv`   | Cv     | internal `cvDc_` -> `vcf_` channel 1 |
 * | input     | `q_cv` | Cv     | control-rate `resonance()` update    |
 * | output    | `out`  | Audio  | `vcf_`, channel 0/1/2 (see `type`)   |
 *
 * Output channel mapping for `type` control:
 * - 0 = LP -> channel 0 (lowpass)
 * - 1 = HP -> channel 2 (highpass)
 * - 2 = BP -> channel 1 (bandpass)
 *
 * **Clean domain separation.**
 * Audio flows `in -> vcf_ ch0 -> out` at 44.1 kHz through `AudioGraph`.
 * The cutoff modulation arrives through the *CV domain*: `cv` is declared
 * `PortKind::Cv`, so `CvGraph` writes a scalar via `writeCvPort("cv", v)` at
 * the 1 kHz control tick.  `AudioFilterStateVariable` modulates its corner
 * frequency from the audio-rate signal on channel 1, scaled by
 * `octaveControl()`, so we keep a private `AudioSynthWaveformDc cvDc_` whose
 * amplitude mirrors the CV scalar.  An input of 1.0 raises the cutoff by
 * `cv_amt` octaves; 0.0 leaves it at the base `cutoff`.  The DC object is an
 * implementation detail and is **not** exposed as an audio port, so
 * `AudioGraph` never wires `cv`.
 *
 * **Q modulation (`q_cv`).**
 * `AudioFilterStateVariable` has no audio-rate resonance input (only signal +
 * frequency-control), so `q_cv` takes the PhaserModule route instead: the CV
 * scalar lands in `writeCvPort("q_cv", v)` at the ~1 kHz control tick and we
 * call `resonance()` directly with `baseQ + q_cv_amt * v`, clamped to the
 * stable 0.7 … 5.0 range.  Effectively per-audio-block resonance updates —
 * plenty for LFO/envelope sweeps, not for audio-rate Q-FM.
 *
 * Controls:
 * | controlId  | type    | effect                                    |
 * |------------|---------|-------------------------------------------|
 * | `cutoff`   | float   | Base cutoff frequency in Hz               |
 * | `q`        | float   | Base resonance (0.7 … 5.0 range)          |
 * | `cv_amt`   | float   | Cutoff-CV modulation depth in octaves     |
 * | `q_cv_amt` | float   | Q-CV modulation depth in resonance units  |
 * | `type`     | int32_t | 0=LP, 1=HP, 2=BP                          |
 *
 * **Note:** changing `type` at runtime only takes effect after the next
 * `AudioGraph::build()` call (the output channel is fixed per connection).
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <string_view>

namespace mmb_link {

/** @brief State-variable filter backed by `AudioFilterStateVariable`. */
class VcfModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_vcf";

    explicit VcfModule(std::string_view id)
        : AudioModule(kTypeId, id)
    {
        vcf_.frequency(2000.0f);
        vcf_.resonance(0.7f);
        vcf_.octaveControl(cvAmt_);  // CV depth in octaves (default 2)
        cvDc_.amplitude(0.0f);       // no modulation until the CV bridge drives it
    }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") {
            // Map filter type to the correct output channel
            uint8_t ch = 0;                // LP default
            if (type_ == 1) ch = 2;        // HP
            else if (type_ == 2) ch = 1;   // BP
            return { const_cast<AudioFilterStateVariable*>(&vcf_), ch, true };
        }
        return {};
    }

    /* Only `in` is an audio port.  `cv` is CV-domain (see file header) and is
     * intentionally not resolvable here, so AudioGraph never wires it. */
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in")
            return { const_cast<AudioFilterStateVariable*>(&vcf_), 0, true };
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
            vcf_.frequency(asFloat(2000.0f));
        } else if (controlId == "q") {
            baseQ_ = asFloat(0.7f);
            applyResonance();
        } else if (controlId == "q_cv_amt") {
            qCvAmt_ = asFloat(2.0f);
            applyResonance();
        } else if (controlId == "cv_amt") {
            cvAmt_ = asFloat(2.0f);
            vcf_.octaveControl(cvAmt_);
        } else if (controlId == "type") {
            if (auto* i = std::get_if<int32_t>(&value))
                type_ = static_cast<uint8_t>(*i);
        }
    }

    // --- Port-kind / CV-bridge -----------------------------------------

    /** @brief `cv` (cutoff) and `q_cv` (resonance) are CV-domain inputs. */
    PortKind inputPortKind(std::string_view portId) const override {
        return (portId == "cv" || portId == "q_cv") ? PortKind::Cv : PortKind::None;
    }

    /** @brief CV bridge entry point.
     *  `cv`: drives the cutoff-modulation DC proxy, scaled to +/- `cv_amt`
     *  octaves by `octaveControl()`.  Slewed over `kCvSlewMs` to de-zipper
     *  the ~1 kHz control tick (see VcaModule for the same rationale).
     *  `q_cv`: no audio-rate resonance input exists on the SVF, so the
     *  scalar updates `resonance()` directly (per-block, see file header). */
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "cv") {
            cvDc_.amplitude(value, kCvSlewMs);
        } else if (portId == "q_cv") {
            qCv_ = value;
            applyResonance();
        }
    }

    /** @brief Register the VCF factory with the global Registry.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<VcfModule>(id);
            });
    }

private:
    /// Recompute effective resonance from base Q + Q-CV, clamped to the
    /// range `AudioFilterStateVariable` is stable in (0.7 … 5.0).
    void applyResonance() {
        float q = baseQ_ + qCvAmt_ * qCv_;
        if (q < 0.7f) q = 0.7f;
        else if (q > 5.0f) q = 5.0f;
        vcf_.resonance(q);
    }

    mutable AudioFilterStateVariable vcf_;
    mutable AudioSynthWaveformDc cvDc_;  ///< CV-bridge cutoff-modulation proxy.
    /// Internal patch: CV proxy -> filter control input (channel 1), always on.
    AudioConnection cvPatch_{ cvDc_, 0, vcf_, 1 };
    float   cvAmt_  = 2.0f;  ///< Cutoff-mod depth in octaves (octaveControl).
    float   baseQ_  = 0.7f;  ///< Base resonance from the `q` control.
    float   qCvAmt_ = 2.0f;  ///< Q-mod depth in resonance units per full-scale CV.
    float   qCv_    = 0.0f;  ///< Last `q_cv` scalar from the CV bridge.
    uint8_t type_  = 0;     ///< 0=LP, 1=HP, 2=BP; used in outputPort() channel selection

    /// DC slew time (ms) per CV update — de-zippers the ~1 kHz control tick.
    static constexpr float kCvSlewMs = 2.0f;
};

}  // namespace mmb_link
