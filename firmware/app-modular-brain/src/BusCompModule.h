#pragma once
/**
 * @file BusCompModule.h
 * @brief VCA-buscompressor in SSL-G-stijl (typeId `tp_mmb_bus_comp`, FW-FX-3 stap 3).
 *
 * @details
 * De DSP is mmb_dsp::BusComp (dezelfde header draait als wasm in de simulator);
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
 * | `threshold` | -60 … 0 dBFS | drempel |
 * | `ratio` | 0 … 2 | 2:1, 4:1, 10:1 |
 * | `attack` | 0 … 5 | 0,1 / 0,3 / 1 / 3 / 10 / 30 ms |
 * | `release` | 0 … 4 | 0,1 / 0,3 / 0,6 / 1,2 s / Auto |
 * | `makeup` | 0 … +20 dB | uitgangsversterking |
 * | `sc_hpf` | 0 … 3 | detector-hoogdoorlaat: uit / 60 / 100 / 150 Hz |
 * | `mix` | 0 … 1 | droog/nat (parallelle compressie) |
 * | `bypass` | 0 / 1 | 1 = signaal ongemoeid door (A/B-test) |
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <string_view>

#include "mmb_dsp/bus_comp.h"

namespace mmb_link {

class BusCompStream : public AudioStream {
public:
    BusCompStream() : AudioStream(2, inputQueue_) { comp_.Init(AUDIO_SAMPLE_RATE_EXACT); }

    mmb_dsp::BusComp& comp() { return comp_; }
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
    mmb_dsp::BusComp comp_;
    volatile float gr_ = 0.0f;
};

class BusCompModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_bus_comp";

    explicit BusCompModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        auto* s = const_cast<BusCompStream*>(&stream_);
        if (portId == "out_l" || portId == "out") return { s, 0, true };
        if (portId == "out_r") return { s, 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        auto* s = const_cast<BusCompStream*>(&stream_);
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
        if      (controlId == "threshold") c.set_threshold_db(asFloat(-18.0f));
        else if (controlId == "ratio") c.set_ratio(static_cast<int>(asFloat(1.0f) + 0.5f));
        else if (controlId == "attack") c.set_attack(static_cast<int>(asFloat(5.0f) + 0.5f));
        else if (controlId == "release") c.set_release(static_cast<int>(asFloat(4.0f) + 0.5f));
        else if (controlId == "makeup") c.set_makeup_db(asFloat(0.0f));
        else if (controlId == "sc_hpf") c.set_sc_hpf(static_cast<int>(asFloat(0.0f) + 0.5f));
        else if (controlId == "mix") c.set_mix(asFloat(1.0f));
        else if (controlId == "bypass") c.set_bypass(asFloat(0.0f) >= 0.5f);
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<BusCompModule>(id);
            });
    }

private:
    mutable BusCompStream stream_;
};

}  // namespace mmb_link
