#pragma once
/**
 * @file ProgramEqModule.h
 * @brief Passieve program-EQ in Pultec-EQP-1A-stijl (typeId `tp_mmb_program_eq`, FW-FX-3 stap 5).
 *
 * @details
 * De DSP is mmb_dsp::ProgramEq (dezelfde header draait als wasm in de simulator);
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
 * | `low_freq` | 0 … 3 | 20 / 30 / 60 / 100 Hz |
 * | `low_boost` | 0 … 10 | laag erbij (tot +13,5 dB) |
 * | `low_atten` | 0 … 10 | laag eraf (tot −10 dB, hoger en zachter) |
 * | `high_freq` | 0 … 6 | 3 / 4 / 5 / 8 / 10 / 12 / 16 kHz |
 * | `high_boost` | 0 … 10 | hoog erbij (bell, tot +16 dB) |
 * | `bandwidth` | 0 … 10 | scherp … breed |
 * | `atten_freq` | 0 … 2 | 5 / 10 / 20 kHz |
 * | `high_atten` | 0 … 10 | hoog eraf (shelf, tot −16 dB) |
 * | `output` | -12 … +12 dB | uitgangsniveau |
 * | `color` | 0 … 2 | buistrap: 0 schoon, 2 dik |
 * | `bypass` | 0 / 1 | 1 = signaal ongemoeid door (A/B-test) |
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <string_view>

#include "mmb_dsp/program_eq.h"

namespace mmb_link {

class ProgramEqStream : public AudioStream {
public:
    ProgramEqStream() : AudioStream(2, inputQueue_) { comp_.Init(AUDIO_SAMPLE_RATE_EXACT); }

    mmb_dsp::ProgramEq& comp() { return comp_; }
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
    mmb_dsp::ProgramEq comp_;
    volatile float gr_ = 0.0f;
};

class ProgramEqModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_program_eq";

    explicit ProgramEqModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        auto* s = const_cast<ProgramEqStream*>(&stream_);
        if (portId == "out_l" || portId == "out") return { s, 0, true };
        if (portId == "out_r") return { s, 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        auto* s = const_cast<ProgramEqStream*>(&stream_);
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
        if      (controlId == "low_freq") c.set_low_freq(static_cast<int>(asFloat(2.0f) + 0.5f));
        else if (controlId == "low_boost") c.set_low_boost(asFloat(0.0f));
        else if (controlId == "low_atten") c.set_low_atten(asFloat(0.0f));
        else if (controlId == "high_freq") c.set_high_freq(static_cast<int>(asFloat(4.0f) + 0.5f));
        else if (controlId == "high_boost") c.set_high_boost(asFloat(0.0f));
        else if (controlId == "bandwidth") c.set_bandwidth(asFloat(5.0f));
        else if (controlId == "atten_freq") c.set_atten_freq(static_cast<int>(asFloat(1.0f) + 0.5f));
        else if (controlId == "high_atten") c.set_high_atten(asFloat(0.0f));
        else if (controlId == "output") c.set_output_db(asFloat(0.0f));
        else if (controlId == "color") c.set_color(asFloat(1.0f));
        else if (controlId == "bypass") c.set_bypass(asFloat(0.0f) >= 0.5f);
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<ProgramEqModule>(id);
            });
    }

private:
    mutable ProgramEqStream stream_;
};

}  // namespace mmb_link
