#pragma once
/**
 * @file VcfModule.h
 * @brief VCF module (typeId `tp_mmb_vcf`): state-variable filter op de kernel
 *        `mmb_dsp::Svf` (float, TPT). Tot 2026-09 wikkelde dit bestand Teensy's
 *        int16-`AudioFilterStateVariable`; de kernel is nu dezelfde klasse die de
 *        sampler per stem-kanaal gebruikt, en `type` schakelt live.
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
#include <cmath>
#include <cstdint>
#include <string_view>

#include "mmb_dsp/svf.h"

namespace mmb_link {

/** @brief AudioStream-schil rond de kernel @ref mmb_dsp::Svf: één ingang, één
 *  uitgang, LP/HP/BP als live schakelaar (geen graph-rebuild meer nodig). */
class AudioFilterSvf : public AudioStream {
public:
    AudioFilterSvf() : AudioStream(1, inputQueueArray_) { svf_.Init(AUDIO_SAMPLE_RATE_EXACT); }
    void frequency(float hz)     { base_ = hz; apply(); }
    void resonance(float r01)    { svf_.set_resonance(r01); }
    void mode(int m)             { svf_.set_mode(m); }
    void octaveControl(float oc) { octaves_ = oc; apply(); }
    void frequencyCv(float v)    { cv_ = v < -1.0f ? -1.0f : (v > 1.0f ? 1.0f : v); apply(); }
    void update() override {
        audio_block_t* block = receiveWritable(0);
        if (!block) return;
        svf_.Prepare();
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            float y = svf_.Tick(block->data[i] * (1.0f / 32768.0f));
            if (y > 1.0f) y = 1.0f; else if (y < -1.0f) y = -1.0f;
            block->data[i] = static_cast<int16_t>(y * 32767.0f);
        }
        transmit(block, 0);
        release(block);
    }
private:
    void apply() { svf_.set_cutoff(base_ * exp2f(octaves_ * cv_)); }
    audio_block_t* inputQueueArray_[1] = { nullptr };
    mmb_dsp::Svf svf_;
    float base_ = 2000.0f, octaves_ = 2.0f, cv_ = 0.0f;
};

/** @brief State-variable filter op de kernel `mmb_dsp::Svf`. */
class VcfModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_vcf";

    explicit VcfModule(std::string_view id)
        : AudioModule(kTypeId, id)
    {
        vcf_.frequency(2000.0f);
        vcf_.octaveControl(cvAmt_);
        applyResonance();
    }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") return { const_cast<AudioFilterSvf*>(&vcf_), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in") return { const_cast<AudioFilterSvf*>(&vcf_), 0, true };
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
            if (auto* i = std::get_if<int32_t>(&value)) vcf_.mode(static_cast<int>(*i));   // live
        }
    }

    // --- Port-kind / CV-bridge -----------------------------------------

    /** @brief `cv` (cutoff) and `q_cv` (resonance) are CV-domain inputs. */
    PortKind inputPortKind(std::string_view portId) const override {
        return (portId == "cv" || portId == "q_cv") ? PortKind::Cv : PortKind::None;
    }

    /** @brief CV bridge: control-rate scalars, per blok gesmootht in de kernel. */
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "cv") {
            vcf_.frequencyCv(value);
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
    /// De catalogus geeft `q` in de oude AudioFilterStateVariable-eenheid
    /// (0,7 … 5,0); de kernel wil 0 … 1. Lineair omgezet, geclampt.
    void applyResonance() {
        float q = baseQ_ + qCvAmt_ * qCv_;
        if (q < 0.7f) q = 0.7f; else if (q > 5.0f) q = 5.0f;
        vcf_.resonance((q - 0.7f) / 4.3f);
    }

    mutable AudioFilterSvf vcf_;
    float cvAmt_  = 2.0f;  ///< Cutoff-mod depth in octaves.
    float baseQ_  = 0.7f;  ///< Base resonance from the `q` control (0,7 … 5,0).
    float qCvAmt_ = 2.0f;  ///< Q-mod depth in resonance units per full-scale CV.
    float qCv_    = 0.0f;  ///< Last `q_cv` scalar from the CV bridge.
};

}  // namespace mmb_link
