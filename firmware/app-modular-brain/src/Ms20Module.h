#pragma once
/**
 * @file Ms20Module.h
 * @brief MS-20 filter (typeId `tp_mmb_ms20`): Korg35 Sallen-Key VCF met
 *        tanh-diodeclipper in de resonantielus. De DSP zelf is de kernel
 *        `mmb_dsp::Korg35` (firmware/lib/mmb-dsp), gedeeld met de browser en
 *        met het filter per stem in de sampler; dit bestand is de AudioStream-
 *        en Module-schil eromheen.
 *
 * @details
 * The Korg35 is the Sallen-Key filter of the MS-10 / early MS-20.  This is a
 * zero-delay-feedback (TPT) implementation after Will Pirkle's virtual-analog
 * model (AN-5 / AN-7, "Designing Software Synthesizer Plug-Ins in C++"),
 * built from three shared one-pole TPT sections:
 *
 * - **LP mode** (12 dB/oct): `x -> LPF1 -> Σ -> LPF2 -> [×K] -> y`, feedback
 *   `y -> HPF1 -> Σ`.  Delay-free loop resolved algebraically:
 *   `u = α0·(y1 + K·(1−G)²·s2 − (1−G)·s3)` with `α0 = 1/(1 − K·G + K·G²)`.
 * - **HP mode** (6 dB/oct — Korg35-typisch): `x -> HPF1 -> Σ -> [×K] -> y`,
 *   feedback `y -> HPF2 -> LPF1 -> Σ`.  Same `α0`;
 *   `u = α0·(y1 − G·(1−G)·s2 + (1−G)·s3)`.
 *
 * `K = 0.01 … 2.0` is the resonance loop gain; the filter self-oscillates at
 * K = 2.0.  The MS-20 "scream" comes from the diode clipper in the resonance
 * path, modelled as `u = tanh(drive·u)` inside the resolved loop — the same
 * character decision as the Gowin FPGA voice (MS20_synth_voice/ms20_filter.v),
 * which also inspired the **2x oversampling**: each input sample is processed
 * twice zero-order-hold at 2·fs (coefficients cooked at the internal rate)
 * and the two sub-outputs averaged, so the clipping harmonics fold back less.
 *
 * Port map:
 * | Direction | portId | Domain | Stream / channel                        |
 * |-----------|--------|--------|-----------------------------------------|
 * | input     | `in`   | Audio  | `k35_`, channel 0                       |
 * | input     | `cv`   | Cv     | cutoff mod, ±`cv_amt` octaves           |
 * | input     | `q_cv` | Cv     | resonance mod, +`q_cv_amt` at full CV   |
 * | input     | `drive_cv` | Cv | drive mod, ±2·`drive_cv_amt` "octaven" (×4…÷4) |
 * | output    | `out`  | Audio  | `k35_`, channel 0                       |
 *
 * Both CV ports are control-rate (~1 kHz tick -> per-block smoothing in the
 * DSP, like the SVF's q_cv).  Unlike VcfModule the `type` switch works live:
 * LP/HP is a DSP flag on one output, no graph rebuild needed.
 *
 * Controls:
 * | controlId  | type    | range      | default | effect                        |
 * |------------|---------|------------|---------|-------------------------------|
 * | `cutoff`   | float   | 20…18000 Hz| 2000    | Base cutoff                   |
 * | `q`        | float   | 0…1        | 0.3     | Resonance (K=0.01…2, osc @ 1) |
 * | `drive`    | float   | 0.1…10     | 1       | tanh drive in resonance loop  |
 * | `cv_amt`   | float   | 0…7 oct    | 2       | Cutoff-CV depth in octaves    |
 * | `q_cv_amt` | float   | 0…1        | 0.5     | Q-CV depth (resonance units)  |
 * | `drive_cv_amt` | float | 0…1      | 0.5     | Drive-CV depth (×4…÷4 bij 1)  |
 * | `type`     | int32_t | 0/1        | 0       | 0=LP (12 dB), 1=HP (6 dB)     |
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <cstdint>
#include <string_view>

#include "mmb_dsp/korg35.h"

namespace mmb_link {

/** @brief AudioStream-schil rond de kernel @ref mmb_dsp::Korg35 (LP 12 dB / HP 6 dB). */
class AudioFilterKorg35 : public AudioStream {
public:
    AudioFilterKorg35() : AudioStream(1, inputQueueArray_) { k35_.Init(AUDIO_SAMPLE_RATE_EXACT); }

    void frequency(float hz)   { k35_.set_cutoff(hz); }
    /** res 0…1 -> K 0.01…2.0 (self-oscillation at 1.0). */
    void resonance(float res)  { k35_.set_resonance(res); }
    void drive(float d)        { k35_.set_drive(d); }
    void mode(uint8_t m)       { k35_.set_mode(m); }
    void octaveControl(float octaves) { octaves_ = octaves < 0.0f ? 0.0f : (octaves > 7.0f ? 7.0f : octaves); apply(); }
    /** Control-rate cutoff CV: ±1.0 shifts the cutoff by ±`octaveControl` octaves. */
    void frequencyCv(float v)  { fcCv_ = v < -1.0f ? -1.0f : (v > 1.0f ? 1.0f : v); apply(); }
    /** Control-rate resonance CV, already scaled to resonance units. */
    void resonanceCv(float v)  { k35_.set_resonance_cv(v); }
    /** Control-rate drive CV (al ×amt): ±1 schaalt de drive ±2 "octaven" (×4 … ÷4). */
    void driveCv(float v)      { k35_.set_drive_cv(v); }

    void update() override {
        audio_block_t* block = receiveWritable(0);
        if (!block) return;
        k35_.Prepare();
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            const float y = k35_.Tick(block->data[i] * (1.0f / 32768.0f));
            block->data[i] = static_cast<int16_t>(y * 32767.0f);
        }
        transmit(block, 0);
        release(block);
    }

private:
    void apply() { k35_.set_cutoff_octaves(octaves_ * fcCv_); }
    audio_block_t* inputQueueArray_[1] = { nullptr };
    mmb_dsp::Korg35 k35_;
    float octaves_ = 2.0f;   ///< Cutoff-CV depth in octaves.
    float fcCv_    = 0.0f;   ///< Cutoff CV scalar (±1), control-rate.
};

/** @brief Module wrapper around @ref AudioFilterKorg35. */
class Ms20Module final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_ms20";

    explicit Ms20Module(std::string_view id)
        : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out")
            return { const_cast<AudioFilterKorg35*>(&k35_), 0, true };
        return {};
    }

    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in")
            return { const_cast<AudioFilterKorg35*>(&k35_), 0, true };
        return {};
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>   (&value)) return *f;
            if (auto* i = std::get_if<int32_t> (&value)) return static_cast<float>(*i);
            return fallback;
        };
        if      (controlId == "cutoff")   k35_.frequency(asFloat(2000.0f));
        else if (controlId == "q")        k35_.resonance(asFloat(0.3f));
        else if (controlId == "drive")    k35_.drive(asFloat(1.0f));
        else if (controlId == "cv_amt")   k35_.octaveControl(asFloat(2.0f));
        else if (controlId == "q_cv_amt") qCvAmt_ = asFloat(0.5f);
        else if (controlId == "drive_cv_amt") driveCvAmt_ = asFloat(0.5f);
        else if (controlId == "type") {
            if (auto* i = std::get_if<int32_t>(&value))
                k35_.mode(static_cast<uint8_t>(*i));   // live, no rebuild needed
        }
    }

    // --- Port-kind / CV-bridge -----------------------------------------

    PortKind inputPortKind(std::string_view portId) const override {
        return (portId == "cv" || portId == "q_cv" || portId == "drive_cv")
                   ? PortKind::Cv : PortKind::None;
    }

    /** @brief CV bridge: control-rate scalars, smoothed per block in the DSP. */
    void writeCvPort(std::string_view portId, float value) override {
        if      (portId == "cv")       k35_.frequencyCv(value);
        else if (portId == "q_cv")     k35_.resonanceCv(value * qCvAmt_);
        else if (portId == "drive_cv") k35_.driveCv(value * driveCvAmt_);
    }

    /** @brief Register the MS-20 factory with the global Registry.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<Ms20Module>(id);
            });
    }

private:
    mutable AudioFilterKorg35 k35_;
    float qCvAmt_     = 0.5f;  ///< Q-mod depth in resonance units per full-scale CV.
    float driveCvAmt_ = 0.5f;  ///< Drive-mod depth (±2·amt "octaven") per full-scale CV.
};

}  // namespace mmb_link
