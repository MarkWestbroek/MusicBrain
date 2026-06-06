#pragma once
/**
 * @file OminousVoiceModule.h
 * @brief Standalone Mutable Instruments "Ominous" dark FM voice as a
 *        MusicBrain AudioModule (typeId `tp_mmb_ominous`).
 *
 * "Ominous" is a dark 2x2-op FM synth (based on Braids' FM and FBFM modes).
 * It was originally an easter egg inside `elements::Part`; after ADR 0012 it
 * lives as its own routable module.
 *
 * The upstream `OminousVoice` DSP is vendored in `lib/mi-elements/` and runs
 * natively at 32 kHz.  This wrapper resamples 32 kHz → 44.1 kHz just like
 * `ElementsVoice`.
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <cstring>

#include "elements/dsp/dsp.h"
#include "elements/dsp/ominous_voice.h"
#include "elements/dsp/part.h"   // for PerformanceState, kMaxBlockSize

namespace mmb_link {

// ---------------------------------------------------------------------------
// OminousVoiceStream — Teensy AudioStream wrapper around elements::OminousVoice.
// ---------------------------------------------------------------------------
class OminousVoiceStream : public AudioStream {
public:
    static constexpr float kElementsRate = 32000.0f;
    static constexpr float kStep = 32000.0f / AUDIO_SAMPLE_RATE_EXACT;

    OminousVoiceStream()
        : AudioStream(0, nullptr)
    {
        ps_.gate       = false;
        ps_.note       = 69.0f;
        ps_.modulation = 0.0f;
        ps_.strength   = 0.8f;
    }

    void begin() {
        voice_.Init();
    }

    void noteOn(float hz, float strength) {
        ps_.note     = 69.0f + 12.0f * log2f(hz / 440.0f);
        ps_.strength = strength;
        ps_.gate     = true;
    }
    void noteOff() { ps_.gate = false; }

    void setGate(bool g)         { ps_.gate     = g; }
    void setNote(float midiNote) { ps_.note     = midiNote; }
    void setStrength(float s)    { ps_.strength = s; }
    void setModulation(float m)  { ps_.modulation = m; }

    elements::Patch* mutable_patch() { return &patch_; }

    void update() override {
        audio_block_t* outL = allocate();
        audio_block_t* outR = allocate();
        if (!outL || !outR) {
            if (outL) release(outL);
            if (outR) release(outR);
            return;
        }

        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            float yL = s0L_ + (s1L_ - s0L_) * phase_;
            float yR = s0R_ + (s1R_ - s0R_) * phase_;
            phase_ += kStep;
            while (phase_ >= 1.0f) {
                phase_ -= 1.0f;
                s0L_ = s1L_;
                s0R_ = s1R_;
                nextSourceSample(s1L_, s1R_);
            }
            if (yL > 1.0f) yL = 1.0f; else if (yL < -1.0f) yL = -1.0f;
            if (yR > 1.0f) yR = 1.0f; else if (yR < -1.0f) yR = -1.0f;
            outL->data[i] = static_cast<int16_t>(yL * 32767.0f);
            outR->data[i] = static_cast<int16_t>(yR * 32767.0f);
        }

        transmit(outL, 0);
        transmit(outR, 1);
        release(outL);
        release(outR);
    }

private:
    inline void nextSourceSample(float& l, float& r) {
        if (srcRead_ >= srcAvail_) generateBlock();
        l = srcBufL_[srcRead_];
        r = srcBufR_[srcRead_++];
    }

    void generateBlock() {
        static const float kSilence[elements::kMaxBlockSize] = {};
        float raw[elements::kMaxBlockSize];
        float center[elements::kMaxBlockSize];
        float sides[elements::kMaxBlockSize];

        float midi_pitch = ps_.note + ps_.modulation;
        voice_.Process(
            patch_,
            midi_pitch,
            ps_.strength,
            ps_.gate,
            kSilence,
            kSilence,
            raw,
            center,
            sides,
            elements::kMaxBlockSize);

        // Mixdown: centre/sides → L/R (same math as Part, fixed spread=0.7).
        constexpr float kSpread = 0.7f;
        for (size_t j = 0; j < elements::kMaxBlockSize; ++j) {
            float side = sides[j] * kSpread;
            srcBufR_[j] = center[j] - side;
            srcBufL_[j] = center[j] + side;
        }
        srcAvail_ = static_cast<int>(elements::kMaxBlockSize);
        srcRead_  = 0;
    }

    elements::OminousVoice voice_;
    elements::Patch patch_;
    elements::PerformanceState ps_{};

    float srcBufL_[elements::kMaxBlockSize] = {};
    float srcBufR_[elements::kMaxBlockSize] = {};
    int   srcAvail_ = 0;
    int   srcRead_  = 0;
    float phase_    = 0.0f;
    float s0L_      = 0.0f;
    float s1L_      = 0.0f;
    float s0R_      = 0.0f;
    float s1R_      = 0.0f;
};

// ---------------------------------------------------------------------------
// OminousVoiceModule — AudioModule wrapper (tp_mmb_ominous).
// ---------------------------------------------------------------------------
class OminousVoiceModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_ominous";

    explicit OminousVoiceModule(std::string_view id)
        : AudioModule(kTypeId, id) {}

    void begin() { stream_.begin(); }
    OminousVoiceStream& stream() { return stream_; }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out" || portId == "out_l")
            return { const_cast<OminousVoiceStream*>(&stream_), 0, true };
        if (portId == "out_r")
            return { const_cast<OminousVoiceStream*>(&stream_), 1, true };
        return {};
    }

    AudioPort inputPort(std::string_view /*portId*/) const override {
        return {};  // no audio inputs yet
    }

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out" || portId == "out_l" || portId == "out_r")
                   ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view /*portId*/) const override {
        return PortKind::None;
    }

    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct") {
            voct_ = value;
            stream_.setNote(60.0f + 12.0f * voct_);
        } else if (portId == "strength") {
            strength_ = value;
            stream_.setStrength(strength_);
        } else if (portId == "gate") {
            const bool high = value >= 0.5f;
            if (high && !lastGateHigh_) {
                stream_.setNote(60.0f + 12.0f * voct_);
                stream_.setStrength(strength_);
            }
            stream_.setGate(high);
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
        elements::Patch* p = stream_.mutable_patch();
        if (controlId == "envelope")      p->exciter_envelope_shape = asFloat(1.0f);
        else if (controlId == "bow_timbre")    p->exciter_bow_timbre    = asFloat(0.5f);
        else if (controlId == "blow_timbre")   p->exciter_blow_timbre   = asFloat(0.5f);
        else if (controlId == "strike_timbre") p->exciter_strike_timbre = asFloat(0.5f);
        else if (controlId == "blow_meta")     p->exciter_blow_meta     = asFloat(0.5f);
        else if (controlId == "strike_meta")   p->exciter_strike_meta   = asFloat(0.5f);
        else if (controlId == "signature")     p->exciter_signature     = asFloat(0.0f);
        else if (controlId == "geometry")      p->resonator_geometry    = asFloat(0.2f);
        else if (controlId == "brightness")    p->resonator_brightness  = asFloat(0.5f);
        else if (controlId == "damping")       p->resonator_damping     = asFloat(0.25f);
        else if (controlId == "mod_offset")    p->resonator_modulation_offset = asFloat(0.1f);
        else if (controlId == "fm") {
            const float f = asFloat(0.0f);
            stream_.setModulation(f * 48.0f - 24.0f);
        }
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<OminousVoiceModule>(id);
            });
    }

private:
    mutable OminousVoiceStream stream_;
    float voct_         = 0.0f;
    float strength_     = 0.8f;
    bool  lastGateHigh_ = false;
};

}  // namespace mmb_link
