#pragma once
/**
 * @file ElementsModule.h
 * @brief SPIKE skeleton for porting Mutable Instruments *Elements* (MIT) as a
 *        MusicBrain AudioModule (typeId `tp_mmb_elements`).
 *
 * @details
 * ## What this is
 * Elements is an open-source (MIT) modal / physical-modelling synth voice:
 * an **exciter** (bow / blow / strike) feeds a tuned **resonator** (modal
 * filter bank + optional string model).  Upstream source lives in
 * `mutable-instruments/eurorack` under `elements/dsp/` (`part.cc`,
 * `voice.cc`, `exciter.cc`, `resonator.cc`, `tube.cc`, `string.cc`, …).
 *
 * This file is the **integration skeleton** only.  The real DSP is *not*
 * vendored yet — `ElementsCore` below is a deliberately simple modal stub so
 * the target builds, makes a plausible struck/metallic sound, and lets us
 * measure the audio-block CPU cost of the wrapper + resampling plumbing.
 * Replace `ElementsCore` with the ported `elements::Part` to finish the job.
 *
 * ## Porting notes (M4 @ 168 MHz → Teensy 4.1 M7 @ 600 MHz + FPU)
 * - **Sample rate:** Elements runs internally at **32 kHz** in blocks of 16
 *   samples; the Teensy Audio lib runs at **44.1 kHz** in blocks of 128.
 *   The wrapper must resample 32 kHz → 44.1 kHz (and any external blow/strike
 *   input the other way).  For the skeleton we run the stub directly at the
 *   Teensy rate; see `kElementsRate` / `TODO(resample)` in `ElementsVoice`.
 * - **stmlib / CMSIS-DSP:** replace `stmlib` fixed-point helpers and CMSIS
 *   intrinsics with plain float math (the M7 FPU makes this cheap).
 * - **Memory:** Elements reverb/resonator buffers are modest; allocate as
 *   members, never in the audio ISR.
 *
 * ## Port map (target — for app-modular-brain integration)
 * | Direction | portId    | Domain | Meaning                              |
 * |-----------|-----------|--------|--------------------------------------|
 * | input     | `voct`    | Cv     | pitch (V/Oct, MIDI 60 = 0 V)         |
 * | input     | `gate`    | Gate   | rising edge → strike / note-on       |
 * | input     | `strength`| Cv     | exciter strength / contour           |
 * | input     | `blow_in` | Audio  | external blow excitation (optional)  |
 * | input     | `strike_in`| Audio | external strike excitation (optional)|
 * | output    | `out`     | Audio  | main (aux+main mixed) voice output   |
 *
 * ## Controls (target)
 * | controlId   | type  | maps to Elements param        |
 * |-------------|-------|-------------------------------|
 * | `exciter`   | int   | bow / blow / strike model     |
 * | `geometry`  | float | resonator geometry            |
 * | `brightness`| float | resonator brightness          |
 * | `damping`   | float | resonator damping             |
 * | `position`  | float | excitation position           |
 * | `space`     | float | reverb / space amount         |
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <arm_math.h>
#include <cmath>
#include <cstdint>
#include <string_view>

namespace mmb_link {

// ---------------------------------------------------------------------------
// ElementsCore — PLACEHOLDER modal voice.
//
// Stand-in for elements::Part.  A small bank of exponentially-decaying sine
// "modes" struck by a short noise burst on trigger().  Exists to exercise the
// FPU and validate the audio plumbing; tonal accuracy is NOT a goal here.
// Replace with the ported Mutable DSP.
// ---------------------------------------------------------------------------
class ElementsCore {
public:
    static constexpr int kModes = 24;  ///< Modal partials (real Elements: ~64).

    void init(float sampleRate) {
        sr_ = sampleRate;
        for (int m = 0; m < kModes; ++m) {
            phase_[m] = 0.0f;
            amp_[m]   = 0.0f;
        }
    }

    /** @brief Set base pitch in Hz and recompute modal ratios. */
    void setFrequency(float hz) { baseHz_ = hz; }

    void setBrightness(float v) { brightness_ = clamp01(v); }
    void setDamping(float v)    { damping_    = clamp01(v); }
    void setPosition(float v)   { position_   = clamp01(v); }

    /** @brief Strike the resonator (note-on). @p strength 0..1. */
    void trigger(float strength) {
        const float s = clamp01(strength);
        for (int m = 0; m < kModes; ++m) {
            // Inharmonic-ish ratio so it sounds metallic rather than a stack
            // of perfect octaves.
            const float ratio = 1.0f + m * (1.0f + 0.015f * m);
            const float bandGain = expf(-(float)m * (1.5f - brightness_));
            // Excitation position colours which partials are emphasised.
            const float posGain = fabsf(sinf((m + 1) * position_ * 3.14159265f));
            amp_[m]   = s * bandGain * posGain;
            decay_[m] = expf(-(1.0f + 8.0f * damping_) * (1.0f + 0.03f * m) / sr_ * 6.2831853f);
            ratio_[m] = ratio;
        }
    }

    /** @brief Render one sample. @p exc optional external excitation. */
    inline float process(float exc) {
        float out = 0.0f;
        for (int m = 0; m < kModes; ++m) {
            phase_[m] += 6.2831853f * baseHz_ * ratio_[m] / sr_;
            if (phase_[m] > 6.2831853f) phase_[m] -= 6.2831853f;
            out += amp_[m] * arm_sin_f32(phase_[m]);
            amp_[m] *= decay_[m];          // exponential mode decay
            amp_[m] += exc * 0.002f;       // external excitation feeds the bank
        }
        return out * 0.12f;
    }

private:
    static float clamp01(float v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

    float sr_         = 44100.0f;
    float baseHz_     = 220.0f;
    float brightness_ = 0.5f;
    float damping_    = 0.3f;
    float position_   = 0.3f;
    float phase_[kModes] = {};
    float amp_[kModes]   = {};
    float decay_[kModes] = {};
    float ratio_[kModes] = {};
};

// ---------------------------------------------------------------------------
// ElementsVoice — Teensy AudioStream wrapper around ElementsCore.
//
// 2 audio inputs: 0 = blow_in, 1 = strike_in (external excitation, optional).
// 1 audio output: main voice mix.
// ---------------------------------------------------------------------------
class ElementsVoice : public AudioStream {
public:
    /// Native Elements rate.  TODO(resample): when the real DSP is dropped in,
    /// run ElementsCore at 32 kHz and resample to AUDIO_SAMPLE_RATE_EXACT.
    static constexpr float kElementsRate = 32000.0f;

    ElementsVoice()
        : AudioStream(2, inputQueue_)
    {
        // Skeleton runs the stub at the Teensy rate directly (no resampler yet).
        core_.init(AUDIO_SAMPLE_RATE_EXACT);
    }

    void noteOn(float hz, float strength) {
        core_.setFrequency(hz);
        core_.trigger(strength);
    }

    ElementsCore& core() { return core_; }

    void update() override {
        audio_block_t* blow   = receiveReadOnly(0);
        audio_block_t* strike = receiveReadOnly(1);
        audio_block_t* out    = allocate();
        if (!out) {
            if (blow)   release(blow);
            if (strike) release(strike);
            return;
        }
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            float exc = 0.0f;
            if (blow)   exc += blow->data[i]   * (1.0f / 32768.0f);
            if (strike) exc += strike->data[i] * (1.0f / 32768.0f);
            float s = core_.process(exc);
            if (s > 1.0f) s = 1.0f; else if (s < -1.0f) s = -1.0f;
            out->data[i] = (int16_t)(s * 32767.0f);
        }
        transmit(out, 0);
        release(out);
        if (blow)   release(blow);
        if (strike) release(strike);
    }

private:
    audio_block_t* inputQueue_[2] = { nullptr, nullptr };
    ElementsCore   core_;
};

// ---------------------------------------------------------------------------
// ElementsModule — AudioModule wrapper (tp_mmb_elements).
//
// Ready to register with the runtime; in the spike, main.cpp drives the voice
// directly.  When integrated into app-modular-brain, AudioGraph wires `out`
// and CvGraph drives `voct` / `gate` / `strength`.
// ---------------------------------------------------------------------------
class ElementsModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_elements";

    explicit ElementsModule(std::string_view id)
        : AudioModule(kTypeId, id) {}

    ElementsVoice& voice() { return voice_; }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out")
            return { const_cast<ElementsVoice*>(&voice_), 0, true };
        return {};
    }

    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "blow_in")
            return { const_cast<ElementsVoice*>(&voice_), 0, true };
        if (portId == "strike_in")
            return { const_cast<ElementsVoice*>(&voice_), 1, true };
        return {};  // voct / gate / strength are CV-domain
    }

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out") ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "voct")      return PortKind::Cv;
        if (portId == "gate")      return PortKind::Gate;
        if (portId == "strength")  return PortKind::Cv;
        if (portId == "blow_in" || portId == "strike_in") return PortKind::Audio;
        return PortKind::None;
    }

    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct") {
            voct_ = value;
        } else if (portId == "strength") {
            strength_ = value;
        } else if (portId == "gate") {
            const bool high = value >= 0.5f;
            if (high && !lastGateHigh_) {
                const float hz = 261.6256f * powf(2.0f, voct_);
                voice_.noteOn(hz, strength_);
            }
            lastGateHigh_ = high;
        }
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>  (&value)) return *f;
            if (auto* i = std::get_if<int32_t>(&value)) return static_cast<float>(*i);
            return fallback;
        };
        ElementsCore& c = voice_.core();
        if (controlId == "brightness") c.setBrightness(asFloat(0.5f));
        else if (controlId == "damping")  c.setDamping(asFloat(0.3f));
        else if (controlId == "position") c.setPosition(asFloat(0.3f));
        // exciter / geometry / space: TODO once real DSP is in.
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<ElementsModule>(id);
            });
    }

private:
    mutable ElementsVoice voice_;
    float voct_         = 0.0f;
    float strength_     = 0.8f;
    bool  lastGateHigh_ = false;
};

}  // namespace mmb_link
