#pragma once
/**
 * @file StereoTapeEchoModule.h
 * @brief Stereo bandecho met cross-feedback (`tp_mmb_stereo_tape_echo`).
 *
 * Twee TapeEcho-sporen (mmb_dsp::StereoTapeEcho): L en R met eigen tijd
 * (`ratio` = R/L), gedeelde feedback, en `cross` = hoeveel van het natte
 * signaal van het ene spoor de schrijfkop van het andere in gaat. Cross 1 +
 * feedback 0 = ping-pong. Zonder rechterkabel krijgt R hetzelfde als L.
 *
 * Poorten: in_l/in_r (in = L), out_l/out_r (out = L); CV time, fbk, cross,
 * mix (ook `*_cv`). Controls: time (s), ratio, feedback, cross, mix, tone,
 * wow, flutter, drive. Zelfde DSP als wasm (stereotapeecho_wasm.cc).
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <memory>
#include <new>
#include <string_view>
#include "mmb_dsp/stereo_tape_echo.h"
#include "FxMem.h"

namespace mmb_link {

class StereoTapeEchoStream : public AudioStream {
public:
    StereoTapeEchoStream() : AudioStream(2, inputQueue_) {
        const int len = mmb_dsp::StereoTapeEcho::bufferLength(AUDIO_SAMPLE_RATE_EXACT);
        tapeL_ = fxAlloc<int16_t>(len);
        tapeR_ = fxAlloc<int16_t>(len);
        if (tapeL_ && tapeR_) echo_.Init(AUDIO_SAMPLE_RATE_EXACT, tapeL_.get(), tapeR_.get(), len);
        else Serial.println("[stereo_tape_echo] band alloc FAILED — module blijft stil");
    }
    mmb_dsp::StereoTapeEcho& echo() { return echo_; }
    // FW-13: band loslaten zolang de module geparkeerd is, en vers terug bij
    // hergebruik. De wissel gebeurt met de audio-interrupt uit, zodat
    // update() nooit een half vrijgegeven buffer ziet; vrijgeven daarna.
    void park() {
        AudioNoInterrupts();
        echo_.Init(AUDIO_SAMPLE_RATE_EXACT, nullptr, nullptr, 0);
        FxBuf<int16_t> oldL = std::move(tapeL_), oldR = std::move(tapeR_);
        AudioInterrupts();
    }
    void unpark() {
        if (tapeL_ && tapeR_) return;
        const int len = mmb_dsp::StereoTapeEcho::bufferLength(AUDIO_SAMPLE_RATE_EXACT);
        FxBuf<int16_t> l = fxAlloc<int16_t>(len), r = fxAlloc<int16_t>(len);
        if (!l || !r) { Serial.println("[stereo_tape_echo] band alloc FAILED bij hergebruik"); return; }
        AudioNoInterrupts();
        tapeL_ = std::move(l); tapeR_ = std::move(r);
        echo_.Init(AUDIO_SAMPLE_RATE_EXACT, tapeL_.get(), tapeR_.get(), len);
        AudioInterrupts();
    }

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
            if (echo_.ready()) echo_.Process(x);
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
    FxBuf<int16_t> tapeL_, tapeR_;    ///< PSRAM als die er is (FxMem.h)
    mmb_dsp::StereoTapeEcho echo_;
};

class StereoTapeEchoModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_stereo_tape_echo";
    explicit StereoTapeEchoModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        auto* s = const_cast<StereoTapeEchoStream*>(&stream_);
        if (portId == "out_l" || portId == "out") return { s, 0, true };
        if (portId == "out_r") return { s, 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        auto* s = const_cast<StereoTapeEchoStream*>(&stream_);
        if (portId == "in_l" || portId == "in") return { s, 0, true };
        if (portId == "in_r") return { s, 1, true };
        return {};
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in_l" || portId == "in_r" || portId == "in") return PortKind::Audio;
        if (cvPortIs(portId, "time") || cvPortIs(portId, "fbk") || cvPortIs(portId, "cross") || cvPortIs(portId, "mix"))
            return PortKind::Cv;
        return PortKind::None;
    }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out_l" || portId == "out_r" || portId == "out") return PortKind::Audio;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        auto& e = stream_.echo();
        if      (cvPortIs(portId, "time"))  e.set_time(value);
        else if (cvPortIs(portId, "fbk"))   e.set_feedback(value);
        else if (cvPortIs(portId, "cross")) e.set_cross(value);
        else if (cvPortIs(portId, "mix"))   e.set_mix(value);
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            if (auto* b = std::get_if<bool>        (&value)) return *b ? 1.0f : 0.0f;
            return fb;
        };
        auto& e = stream_.echo();
        if      (controlId == "time")     e.set_time(asFloat(0.35f));
        else if (controlId == "ratio")    e.set_ratio(asFloat(1.0f));
        else if (controlId == "feedback") e.set_feedback(asFloat(0.4f));
        else if (controlId == "cross")    e.set_cross(asFloat(0.3f));
        else if (controlId == "mix")      e.set_mix(asFloat(0.4f));
        else if (controlId == "tone")     e.set_tone(asFloat(0.6f));
        else if (controlId == "wow")      e.set_wow(asFloat(0.3f));
        else if (controlId == "flutter")  e.set_flutter(asFloat(0.2f));
        else if (controlId == "drive")    e.set_drive(asFloat(0.3f));
    }

    void onRetire() override { stream_.park(); }
    void onReuse()  override { stream_.unpark(); }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<StereoTapeEchoModule>(id); });
    }

private:
    mutable StereoTapeEchoStream stream_;
};

}  // namespace mmb_link
