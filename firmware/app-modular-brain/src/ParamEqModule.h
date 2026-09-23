#pragma once
/**
 * @file ParamEqModule.h
 * @brief Vierbands parametrische EQ in SSL/API-stijl (typeId `tp_mmb_para_eq`, vintage-eq stap 2).
 *
 * @details
 * De DSP is mmb_dsp::ParamEq (dezelfde header draait als wasm in de simulator);
 * zie daar en doc/plans/vintage-compressors.md voor het karakter. Stereo;
 * alleen `in_l` aangesloten = mono, en dan komt het resultaat op beide
 * uitgangen.
 *
 * Port map:
 * | Direction | portId  | Domain | Stream / channel |
 * |-----------|---------|--------|------------------|
 * | input     | `in_l`  | Audio  | stream_, 0       |
 * | input     | `in_r`  | Audio  | stream_, 1       |
 * | output    | `out_l` | Audio  | stream_, 0       |
 * | output    | `out_r` | Audio  | stream_, 1       |
 *
 * Controls:
 * | controlId | range | effect |
 * |---|---|---|
 * | `hpf` | 16 … 400 Hz | hoogdoorlaat 12 dB/oct; 16 = uit |
 * | `lpf` | 3 … 20 kHz | laagdoorlaat 12 dB/oct; 20k = uit |
 * | `lf_freq` | 30 … 450 Hz | LF |
 * | `lf_gain` | -15 … +15 dB | LF |
 * | `lf_shelf` | 0 / 1 | LF: bell of shelf |
 * | `lmf_freq` | 200 … 2000 Hz | LMF |
 * | `lmf_gain` | -15 … +15 dB | LMF |
 * | `lmf_q` | 0,4 … 4 | LMF |
 * | `hmf_freq` | 600 … 7000 Hz | HMF |
 * | `hmf_gain` | -15 … +15 dB | HMF |
 * | `hmf_q` | 0,4 … 4 | HMF |
 * | `hf_freq` | 1,5 … 16 kHz | HF |
 * | `hf_gain` | -15 … +15 dB | HF |
 * | `hf_shelf` | 0 / 1 | HF: bell of shelf |
 * | `prop_q` | 0 / 1 | proportionele Q (Amerikaanse stand) |
 * | `output` | -12 … +12 dB | uitgangsniveau |
 * | `bypass` | 0 / 1 | 1 = signaal ongemoeid door (A/B-test) |
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <string_view>

#include "mmb_dsp/param_eq.h"

namespace mmb_link {

class ParamEqStream : public AudioStream {
public:
    ParamEqStream() : AudioStream(2, inputQueue_) { comp_.Init(AUDIO_SAMPLE_RATE_EXACT); }

    mmb_dsp::ParamEq& comp() { return comp_; }
    float gr() const { return gr_; }

    void update() override {
        audio_block_t* inL = receiveReadOnly(0);
        audio_block_t* inR = receiveReadOnly(1);
        audio_block_t* outL = allocate();
        audio_block_t* outR = allocate();
        if (!outL || !outR) {
            if (outL) release(outL);
            if (outR) release(outR);
            if (inL) release(inL);
            if (inR) release(inR);
            return;
        }
        // Mono: zonder rechterkabel krijgt R hetzelfde als L.
        const audio_block_t* srcR = inR ? inR : inL;
        float x[2];
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            x[0] = inL  ? inL->data[i]  * (1.0f / 32768.0f) : 0.0f;
            x[1] = srcR ? srcR->data[i] * (1.0f / 32768.0f) : 0.0f;
            comp_.Process(x, 2);
            outL->data[i] = static_cast<int16_t>(clamp1(x[0]) * 32767.0f);
            outR->data[i] = static_cast<int16_t>(clamp1(x[1]) * 32767.0f);
        }
        transmit(outL, 0);
        transmit(outR, 1);
        release(outL);
        release(outR);
        if (inL) release(inL);
        if (inR) release(inR);
    }

private:
    static float clamp1(float v) { return v > 1.0f ? 1.0f : (v < -1.0f ? -1.0f : v); }

    audio_block_t* inputQueue_[2] = { nullptr, nullptr };
    mmb_dsp::ParamEq comp_;
    volatile float gr_ = 0.0f;
};

class ParamEqModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_para_eq";

    explicit ParamEqModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        auto* s = const_cast<ParamEqStream*>(&stream_);
        if (portId == "out_l" || portId == "out") return { s, 0, true };
        if (portId == "out_r") return { s, 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        auto* s = const_cast<ParamEqStream*>(&stream_);
        if (portId == "in_l" || portId == "in") return { s, 0, true };
        if (portId == "in_r") return { s, 1, true };
        return {};
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in_l" || portId == "in_r" || portId == "in") return PortKind::Audio;
        return PortKind::None;
    }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out_l" || portId == "out_r" || portId == "out") return PortKind::Audio;
        return PortKind::None;
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            if (auto* b = std::get_if<bool>        (&value)) return *b ? 1.0f : 0.0f;
            return fb;
        };
        auto& c = stream_.comp();
        if      (controlId == "hpf") c.set_hpf(asFloat(16.0f));
        else if (controlId == "lpf") c.set_lpf(asFloat(20000.0f));
        else if (controlId == "lf_freq") c.set_lf_freq(asFloat(100.0f));
        else if (controlId == "lf_gain") c.set_lf_gain(asFloat(0.0f));
        else if (controlId == "lf_shelf") c.set_lf_shelf(asFloat(1.0f) >= 0.5f);
        else if (controlId == "lmf_freq") c.set_lmf_freq(asFloat(600.0f));
        else if (controlId == "lmf_gain") c.set_lmf_gain(asFloat(0.0f));
        else if (controlId == "lmf_q") c.set_lmf_q(asFloat(1.0f));
        else if (controlId == "hmf_freq") c.set_hmf_freq(asFloat(2500.0f));
        else if (controlId == "hmf_gain") c.set_hmf_gain(asFloat(0.0f));
        else if (controlId == "hmf_q") c.set_hmf_q(asFloat(1.0f));
        else if (controlId == "hf_freq") c.set_hf_freq(asFloat(8000.0f));
        else if (controlId == "hf_gain") c.set_hf_gain(asFloat(0.0f));
        else if (controlId == "hf_shelf") c.set_hf_shelf(asFloat(1.0f) >= 0.5f);
        else if (controlId == "prop_q") c.set_prop_q(asFloat(0.0f) >= 0.5f);
        else if (controlId == "output") c.set_output_db(asFloat(0.0f));
        else if (controlId == "bypass") c.set_bypass(asFloat(0.0f) >= 0.5f);
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<ParamEqModule>(id);
            });
    }

private:
    mutable ParamEqStream stream_;
};

}  // namespace mmb_link
