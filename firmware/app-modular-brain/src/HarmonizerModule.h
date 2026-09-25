#pragma once
/**
 * @file HarmonizerModule.h
 * @brief Pitch-shifter / harmonizer, mono in → stereo uit (`tp_mmb_harmonizer`).
 *
 * mmb_dsp::Harmonizer: twee stemmen met elk een twee-koppen-shifter
 * (semi + cents + V/Oct), stem A links, stem B rechts (`spread`), feedback
 * voor getrapte herhalingen (shimmer), `window` = korrelgrootte in ms.
 *
 * Poorten: in → out_l/out_r (out = L); CV voct_a, voct_b (1 V = 12 st),
 * mix (ook `mix_cv`). Controls: semi_a, cent_a, lvl_a, semi_b, cent_b,
 * lvl_b, window, feedback, spread, mix.
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <string_view>
#include "mmb_dsp/pitch_shift.h"

namespace mmb_link {

class HarmonizerStream : public AudioStream {
public:
    HarmonizerStream() : AudioStream(1, inputQueue_) { h_.Init(AUDIO_SAMPLE_RATE_EXACT); }
    mmb_dsp::Harmonizer& h() { return h_; }

    void update() override {
        audio_block_t* in = receiveReadOnly(0);
        audio_block_t* outL = allocate();
        audio_block_t* outR = allocate();
        if (!outL || !outR) { if (outL) release(outL); if (outR) release(outR); if (in) release(in); return; }
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            const float x = in ? in->data[i] * (1.0f / 32768.0f) : 0.0f;
            float l, r;
            h_.Process(x, &l, &r);
            outL->data[i] = static_cast<int16_t>(clamp1(l) * 32767.0f);
            outR->data[i] = static_cast<int16_t>(clamp1(r) * 32767.0f);
        }
        transmit(outL, 0); transmit(outR, 1);
        release(outL); release(outR);
        if (in) release(in);
    }

private:
    static float clamp1(float v) { return v != v ? 0.0f : (v > 1.0f ? 1.0f : (v < -1.0f ? -1.0f : v)); }
    audio_block_t* inputQueue_[1] = { nullptr };
    mmb_dsp::Harmonizer h_;
};

class HarmonizerModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_harmonizer";
    explicit HarmonizerModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        auto* s = const_cast<HarmonizerStream*>(&stream_);
        if (portId == "out_l" || portId == "out") return { s, 0, true };
        if (portId == "out_r") return { s, 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in" || portId == "in_l") return { const_cast<HarmonizerStream*>(&stream_), 0, true };
        return {};
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in" || portId == "in_l") return PortKind::Audio;
        if (portId == "voct_a" || portId == "voct_b" || cvPortIs(portId, "mix")) return PortKind::Cv;
        return PortKind::None;
    }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out_l" || portId == "out_r" || portId == "out") return PortKind::Audio;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        auto& h = stream_.h();
        if      (portId == "voct_a")      h.set_voct(0, value);
        else if (portId == "voct_b")      h.set_voct(1, value);
        else if (cvPortIs(portId, "mix")) h.set_mix(value);
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            if (auto* b = std::get_if<bool>        (&value)) return *b ? 1.0f : 0.0f;
            return fb;
        };
        auto& h = stream_.h();
        if      (controlId == "semi_a")   h.set_semitones(0, asFloat(0.0f));
        else if (controlId == "cent_a")   h.set_cents(0, asFloat(0.0f));
        else if (controlId == "lvl_a")    h.set_level(0, asFloat(1.0f));
        else if (controlId == "semi_b")   h.set_semitones(1, asFloat(7.0f));
        else if (controlId == "cent_b")   h.set_cents(1, asFloat(0.0f));
        else if (controlId == "lvl_b")    h.set_level(1, asFloat(0.0f));
        else if (controlId == "window")   h.set_window(asFloat(40.0f));
        else if (controlId == "feedback") h.set_feedback(asFloat(0.0f));
        else if (controlId == "spread")   h.set_spread(asFloat(0.5f));
        else if (controlId == "mix")      h.set_mix(asFloat(0.5f));
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<HarmonizerModule>(id); });
    }

private:
    mutable HarmonizerStream stream_;
};

}  // namespace mmb_link
