#pragma once
/**
 * @file StereoPhaserModule.h
 * @brief Stereo phaser (`tp_mmb_stereo_phaser`): twee Phaser-cascades met
 *        LFO-fasehoek `spread`. Zonder rechterkabel krijgt R hetzelfde als L.
 *
 * Poorten: in_l/in_r (in = L) → out_l/out_r (out = L); CV rate, depth (ook
 * `*_cv`). Controls: rate, depth, feedback, mix, spread.
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <string_view>
#include "mmb_dsp/stereo_phaser.h"

namespace mmb_link {

class StereoPhaserStream : public AudioStream {
public:
    StereoPhaserStream() : AudioStream(2, inputQueue_) { ph_.Init(AUDIO_SAMPLE_RATE_EXACT); }
    mmb_dsp::StereoPhaser& ph() { return ph_; }

    void update() override {
        audio_block_t* inL = receiveReadOnly(0);
        audio_block_t* inR = receiveReadOnly(1);
        audio_block_t* outL = allocate();
        audio_block_t* outR = allocate();
        if (!outL || !outR) {
            if (outL) release(outL); if (outR) release(outR);
            if (inL) release(inL);   if (inR) release(inR);
            return;
        }
        float x[2];
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            x[0] = inL ? inL->data[i] * (1.0f / 32768.0f) : 0.0f;
            x[1] = inR ? inR->data[i] * (1.0f / 32768.0f) : 0.0f;
            ph_.Process(x, inR != nullptr);
            outL->data[i] = static_cast<int16_t>(x[0] * 32767.0f);
            outR->data[i] = static_cast<int16_t>(x[1] * 32767.0f);
        }
        transmit(outL, 0); transmit(outR, 1);
        release(outL); release(outR);
        if (inL) release(inL); if (inR) release(inR);
    }

private:
    audio_block_t* inputQueue_[2] = { nullptr, nullptr };
    mmb_dsp::StereoPhaser ph_;
};

class StereoPhaserModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_stereo_phaser";
    explicit StereoPhaserModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        auto* s = const_cast<StereoPhaserStream*>(&stream_);
        if (portId == "out_l" || portId == "out") return { s, 0, true };
        if (portId == "out_r") return { s, 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        auto* s = const_cast<StereoPhaserStream*>(&stream_);
        if (portId == "in_l" || portId == "in") return { s, 0, true };
        if (portId == "in_r") return { s, 1, true };
        return {};
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in_l" || portId == "in_r" || portId == "in") return PortKind::Audio;
        if (cvPortIs(portId, "rate") || cvPortIs(portId, "depth")) return PortKind::Cv;
        return PortKind::None;
    }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out_l" || portId == "out_r" || portId == "out") return PortKind::Audio;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        auto& p = stream_.ph();
        if      (cvPortIs(portId, "rate"))  p.set_rate(value);
        else if (cvPortIs(portId, "depth")) p.set_depth(value);
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            if (auto* b = std::get_if<bool>        (&value)) return *b ? 1.0f : 0.0f;
            return fb;
        };
        auto& p = stream_.ph();
        if      (controlId == "rate")     p.set_rate(asFloat(0.4f));
        else if (controlId == "depth")    p.set_depth(asFloat(0.7f));
        else if (controlId == "feedback") p.set_feedback(asFloat(0.3f));
        else if (controlId == "mix")      p.set_mix(asFloat(0.5f));
        else if (controlId == "spread")   p.set_spread(asFloat(0.5f));
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<StereoPhaserModule>(id); });
    }

private:
    mutable StereoPhaserStream stream_;
};

}  // namespace mmb_link
