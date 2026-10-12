#pragma once
/**
 * @file BbdChorusModule.h
 * @brief BBD-chorus/flanger, mono in → stereo uit (`tp_mmb_bbd_chorus`).
 *
 * mmb_dsp::BbdChorus: emmertjesvertraging met driehoek-LFO, in-/uitgangs-
 * laagdoorlaat (`tone`), compander en klokruis (`age`), twee sporen met
 * LFO-fasehoek (`spread`) en feedback (flanger). Zonder rechterkabel krijgt
 * R hetzelfde als L — mono in, stereo uit is het gewone gebruik.
 *
 * Poorten: in_l/in_r (in = L), out_l/out_r (out = L); CV rate, depth, mix
 * (ook `*_cv`). Controls: rate (Hz), depth, delay (ms), feedback, mix,
 * spread, age, tone.
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <string_view>
#include "mmb_dsp/bbd_chorus.h"

namespace mmb_link {

class BbdChorusStream : public AudioStream {
public:
    BbdChorusStream() : AudioStream(2, inputQueue_) { chorus_.Init(AUDIO_SAMPLE_RATE_EXACT); }
    mmb_dsp::BbdChorus& chorus() { return chorus_; }

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
            chorus_.Process(x, inR != nullptr);
            outL->data[i] = static_cast<int16_t>(clamp1(x[0]) * 32767.0f);
            outR->data[i] = static_cast<int16_t>(clamp1(x[1]) * 32767.0f);
        }
        transmit(outL, 0); transmit(outR, 1);
        release(outL); release(outR);
        if (inL) release(inL); if (inR) release(inR);
    }

private:
    static float clamp1(float v) { return v != v ? 0.0f : (v > 1.0f ? 1.0f : (v < -1.0f ? -1.0f : v)); }
    audio_block_t* inputQueue_[2] = { nullptr, nullptr };
    mmb_dsp::BbdChorus chorus_;
};

class BbdChorusModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_bbd_chorus";
    explicit BbdChorusModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        auto* s = const_cast<BbdChorusStream*>(&stream_);
        if (portId == "out_l" || portId == "out") return { s, 0, true };
        if (portId == "out_r") return { s, 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        auto* s = const_cast<BbdChorusStream*>(&stream_);
        if (portId == "in_l" || portId == "in") return { s, 0, true };
        if (portId == "in_r") return { s, 1, true };
        return {};
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in_l" || portId == "in_r" || portId == "in") return PortKind::Audio;
        if (cvPortIs(portId, "rate") || cvPortIs(portId, "depth") || cvPortIs(portId, "mix")) return PortKind::Cv;
        return PortKind::None;
    }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out_l" || portId == "out_r" || portId == "out") return PortKind::Audio;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        auto& c = stream_.chorus();
        if      (cvPortIs(portId, "rate"))  { rateKc_.cv = value; c.set_rate(rateKc_.value(0.02f, 12.0f)); }
        else if (cvPortIs(portId, "depth")) { depthKc_.cv = value; c.set_depth(depthKc_.value(0.0f, 1.0f)); }
        else if (cvPortIs(portId, "mix"))   { mixKc_.cv = value; c.set_mix(mixKc_.value(0.0f, 1.0f)); }
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            if (auto* b = std::get_if<bool>        (&value)) return *b ? 1.0f : 0.0f;
            return fb;
        };
        auto& c = stream_.chorus();
        if      (controlId == "rate")     { rateKc_.knob = asFloat(0.6f); c.set_rate(rateKc_.value(0.02f, 12.0f)); }
        else if (controlId == "depth")    { depthKc_.knob = asFloat(0.5f); c.set_depth(depthKc_.value(0.0f, 1.0f)); }
        else if (controlId == "delay")    c.set_delay(asFloat(8.0f));
        else if (controlId == "feedback") c.set_feedback(asFloat(0.0f));
        else if (controlId == "mix")      { mixKc_.knob = asFloat(0.5f); c.set_mix(mixKc_.value(0.0f, 1.0f)); }
        else if (controlId == "spread")   c.set_spread(asFloat(1.0f));
        else if (controlId == "age")      c.set_age(asFloat(0.3f));
        else if (controlId == "tone")     c.set_tone(asFloat(0.6f));
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<BbdChorusModule>(id); });
    }

private:
    KnobCv rateKc_{0.6f, 0.0f};   ///< rate: knop + CV (FW-MOD-1)
    KnobCv depthKc_{0.5f, 0.0f};   ///< depth: knop + CV (FW-MOD-1)
    KnobCv mixKc_{0.5f, 0.0f};   ///< mix: knop + CV (FW-MOD-1)
    mutable BbdChorusStream stream_;
};

}  // namespace mmb_link
