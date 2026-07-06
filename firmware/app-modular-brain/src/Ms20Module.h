#pragma once
/**
 * @file Ms20Module.h
 * @brief MS-20 filter (typeId `tp_mmb_ms20`): custom `AudioStream` Korg35
 *        Sallen-Key VCF with tanh diode-clipping in the resonance loop.
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

namespace mmb_link {

/** @brief Korg35 ZDF Sallen-Key filter (LP 12 dB / HP 6 dB) with tanh loop. */
class AudioFilterKorg35 : public AudioStream {
public:
    static constexpr int kOversample = 2;   // internal rate = 2 * AUDIO_SAMPLE_RATE

    AudioFilterKorg35() : AudioStream(1, inputQueueArray_) {}

    void frequency(float hz)   { fcTarget_ = clampf(hz, 20.0f, 18000.0f); }
    /** res 0…1 -> K 0.01…2.0 (self-oscillation at 1.0). */
    void resonance(float res)  { kTarget_ = 0.01f + clampf(res, 0.0f, 1.0f) * 1.99f; }
    void drive(float d)        { drive_ = clampf(d, 0.1f, 10.0f); }
    void mode(uint8_t m)       { hp_ = (m == 1); }
    void octaveControl(float octaves) { octaves_ = clampf(octaves, 0.0f, 7.0f); }
    /** Control-rate cutoff CV: ±1.0 shifts the cutoff by ±`octaveControl` octaves. */
    void frequencyCv(float v)  { fcCv_ = clampf(v, -1.0f, 1.0f); }
    /** Control-rate resonance CV, already scaled to resonance units (0…1 adds to `q`). */
    void resonanceCv(float v)  { resCv_ = clampf(v, -1.0f, 1.0f); }
    /** Control-rate drive CV (al ×amt): ±1 schaalt de drive ±2 "octaven" (×4 … ÷4). */
    void driveCv(float v)      { driveCv_ = clampf(v, -1.0f, 1.0f); }

    void update() override {
        audio_block_t* block = receiveWritable(0);
        if (!block) return;

        // ── per-block coefficient cook (smoothed, at the oversampled rate) ──
        const float fcMod = fcTarget_ * exp2f(octaves_ * fcCv_);
        fcSm_ += 0.35f * (clampf(fcMod, 20.0f, 18000.0f) - fcSm_);
        const float kMod = kTarget_ + 1.99f * resCv_;   // res units -> K units
        kSm_  += 0.35f * (clampf(kMod, 0.01f, 2.0f) - kSm_);
        const float driveMod = drive_ * exp2f(2.0f * driveCv_);
        driveSm_ += 0.35f * (clampf(driveMod, 0.1f, 10.0f) - driveSm_);

        const float fsInt = AUDIO_SAMPLE_RATE_EXACT * kOversample;
        const float g  = tanf(3.14159265f * fcSm_ / fsInt);
        const float G  = g / (1.0f + g);
        const float mG = 1.0f - G;                       // == 1/(1+g)
        const float K  = kSm_;
        const float alpha0 = 1.0f / (1.0f - K * G + K * G * G);
        const float norm   = 1.0f / K;                   // passband gain compensation

        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            const float x = block->data[i] * (1.0f / 32768.0f);
            float acc = 0.0f;
            for (int os = 0; os < kOversample; ++os) {   // zero-order hold input
                float y;
                if (!hp_) {
                    // LP: x -> LP1 -> Σ -> LP2 -> ×K -> y, fb y -> HP1 -> Σ
                    const float y1 = lp(s1_, x, G);
                    const float u0 = alpha0 * (y1 + K * mG * mG * s2_ - mG * s3_);
                    const float u  = tanhf(driveSm_ * u0);
                    y = K * lp(s2_, u, G);
                    hpUpd(s3_, y, G);
                } else {
                    // HP: x -> HP1 -> Σ -> ×K -> y, fb y -> HP2 -> LP1 -> Σ
                    const float y1 = x - lp(s1_, x, G);
                    const float u0 = alpha0 * (y1 - G * mG * s2_ + mG * s3_);
                    const float u  = tanhf(driveSm_ * u0);
                    y = K * u;
                    const float yhp2 = y - lp(s2_, y, G);
                    lp(s3_, yhp2, G);
                }
                acc += y;
            }
            float out = (acc / kOversample) * norm;
            if (out >  1.0f) out =  1.0f;
            if (out < -1.0f) out = -1.0f;
            block->data[i] = static_cast<int16_t>(out * 32767.0f);
        }

        transmit(block, 0);
        release(block);
    }

private:
    static float clampf(float v, float lo, float hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }
    /** One-pole TPT lowpass step on state `s` (v-form: zero-input out = (1-G)·s). */
    static inline float lp(float& s, float x, float G) {
        const float v = G * (x - s);
        const float y = v + s;
        s = y + v;
        return y;
    }
    /** Highpass step where only the state update matters (feedback tap HP1). */
    static inline void hpUpd(float& s, float x, float G) { (void)lp(s, x, G); }

    audio_block_t* inputQueueArray_[1] = { nullptr };

    // One-pole states.  LP mode: s1=LPF1, s2=LPF2, s3=HPF1's internal LP.
    // HP mode: s1=HPF1's internal LP, s2=HPF2's internal LP, s3=LPF1.
    float s1_ = 0.0f, s2_ = 0.0f, s3_ = 0.0f;

    float fcTarget_ = 2000.0f;  ///< Base cutoff from the `cutoff` control.
    float fcCv_     = 0.0f;     ///< Cutoff CV scalar (±1), control-rate.
    float fcSm_     = 2000.0f;  ///< Smoothed effective cutoff (per-block slew).
    float kTarget_  = 0.607f;   ///< Base K from the `q` control (res 0.3).
    float resCv_    = 0.0f;     ///< Resonance CV scalar, already ×q_cv_amt.
    float kSm_      = 0.607f;   ///< Smoothed effective K.
    float drive_    = 1.0f;     ///< Basis-drive (control `drive`).
    float driveCv_  = 0.0f;     ///< Drive-CV scalar (al ×amt), ±1.
    float driveSm_  = 1.0f;     ///< Gesmoothde effectieve drive.
    float octaves_  = 2.0f;     ///< Cutoff-CV depth in octaves.
    bool  hp_       = false;    ///< false = LP (12 dB), true = HP (6 dB).
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
