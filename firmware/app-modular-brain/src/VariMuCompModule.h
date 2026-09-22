#pragma once
/**
 * @file VariMuCompModule.h
 * @brief Variable-mu buizencompressor in Fairchild-stijl (typeId `tp_mmb_varimu_comp`, FW-FX-3 stap 4).
 *
 * @details
 * De DSP is mmb_dsp::VariMuComp (dezelfde header draait als wasm in de simulator);
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
 * | output    | `gr`    | Cv     | gain reduction, 0..1 (1 = 20 dB of meer) |
 *
 * Controls:
 * | controlId | range | effect |
 * |---|---|---|
 * | `input` | -12 … +24 dB | ingangsversterking |
 * | `threshold` | -40 … 0 dBFS | drempel (na Input) |
 * | `output` | -24 … +12 dB | uitgangsniveau |
 * | `time` | 1 … 6 | tijdstand; 5 en 6 programma-afhankelijk |
 * | `mode` | 0 / 1 | LR gekoppeld of M/S (lateral/vertical) |
 * | `color` | 0 … 2 | buisvervorming: 0 schoon, 2 dik |
 * | `mix` | 0 … 1 | droog/nat (parallelle compressie) |
 * | `bypass` | 0 / 1 | 1 = signaal ongemoeid door (A/B-test) |
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <string_view>

#include "mmb_dsp/varimu_comp.h"

namespace mmb_link {

class VariMuCompStream : public AudioStream {
public:
    VariMuCompStream() : AudioStream(2, inputQueue_) { comp_.Init(AUDIO_SAMPLE_RATE_EXACT); }

    mmb_dsp::VariMuComp& comp() { return comp_; }
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
        gr_ = comp_.gr();
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
    mmb_dsp::VariMuComp comp_;
    volatile float gr_ = 0.0f;
};

class VariMuCompModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_varimu_comp";

    explicit VariMuCompModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        auto* s = const_cast<VariMuCompStream*>(&stream_);
        if (portId == "out_l" || portId == "out") return { s, 0, true };
        if (portId == "out_r") return { s, 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        auto* s = const_cast<VariMuCompStream*>(&stream_);
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
        if (portId == "gr") return PortKind::Cv;
        return PortKind::None;
    }
    /** `gr`: gain reduction van het laatste blok, 0..1 (1 = 20 dB of meer). */
    float readCvPort(std::string_view portId) const override {
        return portId == "gr" ? stream_.gr() : 0.0f;
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
        if      (controlId == "input") c.set_input_db(asFloat(0.0f));
        else if (controlId == "threshold") c.set_threshold_db(asFloat(-18.0f));
        else if (controlId == "output") c.set_output_db(asFloat(0.0f));
        else if (controlId == "time") c.set_time(static_cast<int>(asFloat(2.0f) + 0.5f));
        else if (controlId == "mode") c.set_mode(static_cast<int>(asFloat(0.0f) + 0.5f));
        else if (controlId == "color") c.set_color(asFloat(1.0f));
        else if (controlId == "mix") c.set_mix(asFloat(1.0f));
        else if (controlId == "bypass") c.set_bypass(asFloat(0.0f) >= 0.5f);
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<VariMuCompModule>(id);
            });
    }

private:
    mutable VariMuCompStream stream_;
};

}  // namespace mmb_link
