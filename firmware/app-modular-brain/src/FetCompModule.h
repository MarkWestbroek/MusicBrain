#pragma once
/**
 * @file FetCompModule.h
 * @brief FET-compressor in 1176-stijl (typeId `tp_mmb_fet_comp`, FW-FX-3 stap 1).
 *
 * @details
 * De DSP is mmb_dsp::FetComp (dezelfde header draait als wasm in de
 * simulator); zie daar en doc/plans/vintage-compressors.md voor het karakter.
 * Stereo gekoppeld: één detector over L en R. Alleen `in_l` aangesloten =
 * mono, en dan komt het resultaat op beide uitgangen.
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
 * | controlId | range             | default | effect                                  |
 * |-----------|-------------------|---------|-----------------------------------------|
 * | `input`   | -12 … +36 dB      | 0       | stuurt de vaste drempel aan             |
 * | `output`  | -24 … +12 dB      | 0       | uitgangsniveau                          |
 * | `attack`  | 1 … 7 (7 snelst)  | 4       | 800 → 20 µs                             |
 * | `release` | 1 … 7 (7 snelst)  | 4       | 1100 → 50 ms                            |
 * | `ratio`   | 0 … 4             | 0       | 4:1, 8:1, 12:1, 20:1, alle knoppen       |
 * | `mix`     | 0 … 1             | 1       | droog/nat (parallelle compressie)       |
 * | `color`   | 0 … 2             | 1       | vervorming: 0 schoon, 1 normaal, 2 dik  |
 * | `bypass`  | 0 / 1             | 0       | 1 = signaal ongemoeid door (A/B-test)   |
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <string_view>

#include "mmb_dsp/fet_comp.h"

namespace mmb_link {

class FetCompStream : public AudioStream {
public:
    FetCompStream() : AudioStream(2, inputQueue_) { comp_.Init(AUDIO_SAMPLE_RATE_EXACT); }

    mmb_dsp::FetComp& comp() { return comp_; }
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
    mmb_dsp::FetComp comp_;
    volatile float gr_ = 0.0f;
};

class FetCompModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_fet_comp";

    explicit FetCompModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        auto* s = const_cast<FetCompStream*>(&stream_);
        if (portId == "out_l" || portId == "out") return { s, 0, true };
        if (portId == "out_r") return { s, 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        auto* s = const_cast<FetCompStream*>(&stream_);
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
        if      (controlId == "input")   c.set_input_db(asFloat(0.0f));
        else if (controlId == "output")  c.set_output_db(asFloat(0.0f));
        else if (controlId == "attack")  c.set_attack(asFloat(4.0f));
        else if (controlId == "release") c.set_release(asFloat(4.0f));
        else if (controlId == "ratio")   c.set_ratio(static_cast<int>(asFloat(0.0f) + 0.5f));
        else if (controlId == "mix")     c.set_mix(asFloat(1.0f));
        else if (controlId == "color")   c.set_color(asFloat(1.0f));
        else if (controlId == "bypass")  c.set_bypass(asFloat(0.0f) >= 0.5f);
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<FetCompModule>(id);
            });
    }

private:
    mutable FetCompStream stream_;
};

}  // namespace mmb_link
