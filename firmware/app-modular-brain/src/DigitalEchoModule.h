#pragma once
/**
 * @file DigitalEchoModule.h
 * @brief Vintage digitale echo, stereo met modulatie (`tp_mmb_digital_echo`).
 *
 * mmb_dsp::DigitalEcho: 12-bit companderende converters, beperkte
 * bandbreedte met de aliasing van toen, sinus-modulatie op de leeskop,
 * twee sporen (`ratio` = R/L) en cross-feedback. Zonder rechterkabel krijgt
 * R hetzelfde als L.
 *
 * Poorten: in_l/in_r (in = L), out_l/out_r (out = L); CV time, fbk, mix,
 * mod (= modulatiediepte; ook `*_cv`). Controls: time (s), ratio, feedback,
 * cross, mix, mod_rate (Hz), mod_depth, bits (6..16), band (Hz).
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <memory>
#include <new>
#include <string_view>
#include "mmb_dsp/digital_echo.h"

namespace mmb_link {

class DigitalEchoStream : public AudioStream {
public:
    DigitalEchoStream() : AudioStream(2, inputQueue_) {
        const int len = mmb_dsp::DigitalEcho::bufferLength(AUDIO_SAMPLE_RATE_EXACT);
        memL_.reset(new (std::nothrow) int16_t[len]);
        memR_.reset(new (std::nothrow) int16_t[len]);
        if (memL_ && memR_) echo_.Init(AUDIO_SAMPLE_RATE_EXACT, memL_.get(), memR_.get(), len);
        else Serial.println("[digital_echo] geheugen alloc FAILED — module blijft stil");
    }
    mmb_dsp::DigitalEcho& echo() { return echo_; }

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
        const audio_block_t* srcR = inR ? inR : inL;
        float x[2];
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            x[0] = inL  ? inL->data[i]  * (1.0f / 32768.0f) : 0.0f;
            x[1] = srcR ? srcR->data[i] * (1.0f / 32768.0f) : 0.0f;
            echo_.Process(x);
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
    std::unique_ptr<int16_t[]> memL_, memR_;
    mmb_dsp::DigitalEcho echo_;
};

class DigitalEchoModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_digital_echo";
    explicit DigitalEchoModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        auto* s = const_cast<DigitalEchoStream*>(&stream_);
        if (portId == "out_l" || portId == "out") return { s, 0, true };
        if (portId == "out_r") return { s, 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        auto* s = const_cast<DigitalEchoStream*>(&stream_);
        if (portId == "in_l" || portId == "in") return { s, 0, true };
        if (portId == "in_r") return { s, 1, true };
        return {};
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in_l" || portId == "in_r" || portId == "in") return PortKind::Audio;
        if (cvPortIs(portId, "time") || cvPortIs(portId, "fbk") || cvPortIs(portId, "mix") || cvPortIs(portId, "mod"))
            return PortKind::Cv;
        return PortKind::None;
    }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out_l" || portId == "out_r" || portId == "out") return PortKind::Audio;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        auto& e = stream_.echo();
        if      (cvPortIs(portId, "time")) e.set_time(value);
        else if (cvPortIs(portId, "fbk"))  e.set_feedback(value);
        else if (cvPortIs(portId, "mix"))  e.set_mix(value);
        else if (cvPortIs(portId, "mod"))  e.set_mod_depth(value);
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            if (auto* b = std::get_if<bool>        (&value)) return *b ? 1.0f : 0.0f;
            return fb;
        };
        auto& e = stream_.echo();
        if      (controlId == "time")      e.set_time(asFloat(0.3f));
        else if (controlId == "ratio")     e.set_ratio(asFloat(1.0f));
        else if (controlId == "feedback")  e.set_feedback(asFloat(0.4f));
        else if (controlId == "cross")     e.set_cross(asFloat(0.0f));
        else if (controlId == "mix")       e.set_mix(asFloat(0.4f));
        else if (controlId == "mod_rate")  e.set_mod_rate(asFloat(0.8f));
        else if (controlId == "mod_depth") e.set_mod_depth(asFloat(0.2f));
        else if (controlId == "bits")      e.set_bits(static_cast<int>(asFloat(12.0f) + 0.5f));
        else if (controlId == "band")      e.set_band(asFloat(8000.0f));
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<DigitalEchoModule>(id); });
    }

private:
    mutable DigitalEchoStream stream_;
};

}  // namespace mmb_link
