#pragma once
/**
 * @file RingModModule.h
 * @brief Ringmodulator (`tp_mmb_ringmod`), mono.
 *
 * mmb_dsp::RingMod: ingang × draaggolf. Draaggolf = eigen oscillator
 * (`freq` × 2^voct, sinus/driehoek/blok) of de `carrier`-audio-ingang als
 * daar een kabel in zit. Mode Clean = zuiver product; Diode = de vier-
 * diodenring met doorlek en oneven harmonischen (`bias` = drempel).
 *
 * Poorten: in, carrier (audio), voct + mix (CV, ook `mix_cv`) → out.
 * Controls: freq (Hz), wave (0 sin/1 tri/2 sqr), mode (0/1), bias, mix.
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <string_view>
#include "mmb_dsp/ring_mod.h"

namespace mmb_link {

class RingModStream : public AudioStream {
public:
    RingModStream() : AudioStream(2, inputQueue_) { rm_.Init(AUDIO_SAMPLE_RATE_EXACT); }
    mmb_dsp::RingMod& rm() { return rm_; }

    void update() override {
        audio_block_t* in  = receiveReadOnly(0);
        audio_block_t* car = receiveReadOnly(1);
        audio_block_t* out = allocate();
        if (!out) { if (in) release(in); if (car) release(car); return; }
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            const float x = in ? in->data[i] * (1.0f / 32768.0f) : 0.0f;
            float c = 0.0f;
            if (car) c = car->data[i] * (1.0f / 32768.0f);
            const float y = rm_.Process(x, car ? &c : nullptr);
            out->data[i] = static_cast<int16_t>(clamp1(y) * 32767.0f);
        }
        transmit(out, 0); release(out);
        if (in) release(in); if (car) release(car);
    }

private:
    static float clamp1(float v) { return v != v ? 0.0f : (v > 1.0f ? 1.0f : (v < -1.0f ? -1.0f : v)); }
    audio_block_t* inputQueue_[2] = { nullptr, nullptr };
    mmb_dsp::RingMod rm_;
};

class RingModModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_ringmod";
    explicit RingModModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") return { const_cast<RingModStream*>(&stream_), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        auto* s = const_cast<RingModStream*>(&stream_);
        if (portId == "in")      return { s, 0, true };
        if (portId == "carrier") return { s, 1, true };
        return {};
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in" || portId == "carrier") return PortKind::Audio;
        if (portId == "voct" || cvPortIs(portId, "mix")) return PortKind::Cv;
        return PortKind::None;
    }
    PortKind outputPortKind(std::string_view portId) const override {
        return portId == "out" ? PortKind::Audio : PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        auto& r = stream_.rm();
        if      (portId == "voct")        r.set_voct(value);
        else if (cvPortIs(portId, "mix")) r.set_mix(value);
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            if (auto* b = std::get_if<bool>        (&value)) return *b ? 1.0f : 0.0f;
            return fb;
        };
        auto& r = stream_.rm();
        if      (controlId == "freq") r.set_freq(asFloat(440.0f));
        else if (controlId == "wave") r.set_wave(static_cast<int>(asFloat(0.0f) + 0.5f));
        else if (controlId == "mode") r.set_mode(static_cast<int>(asFloat(0.0f) + 0.5f));
        else if (controlId == "bias") r.set_bias(asFloat(0.3f));
        else if (controlId == "mix")  r.set_mix(asFloat(1.0f));
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<RingModModule>(id); });
    }

private:
    mutable RingModStream stream_;
};

}  // namespace mmb_link
