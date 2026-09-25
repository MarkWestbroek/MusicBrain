#pragma once
/**
 * @file ShimmerModule.h
 * @brief Shimmer reverb, stereo (`tp_mmb_shimmer`).
 *
 * mmb_dsp::Shimmer: de plaatgalm met een korrel-shifter in de lus; de natte
 * galm gaat een interval omhoog (standaard een octaaf) terug de galm in. De
 * galmpool (~175 KB) komt van de heap, zoals bij de gewone galm, en wordt
 * losgelaten zolang de module geparkeerd is (FW-13).
 *
 * Poorten: in_l/in_r (in = L) → out_l/out_r (out = L); CV shimmer, size,
 * mix (ook `*_cv`). Controls: size, damp, shimmer, interval (0 +12 / 1 +7 /
 * 2 +19 / 3 +24 / 4 -12), tone, predelay (ms), mod, mix.
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <memory>
#include <new>
#include <string_view>
#include "mmb_dsp/shimmer.h"

namespace mmb_link {

class ShimmerStream : public AudioStream {
public:
    ShimmerStream() : AudioStream(2, inputQueue_) {
        const int len = mmb_dsp::Shimmer::poolLength(AUDIO_SAMPLE_RATE_EXACT);
        pool_.reset(new (std::nothrow) float[len]);
        sh_.Init(AUDIO_SAMPLE_RATE_EXACT, pool_.get(), pool_ ? len : 0);
        if (!pool_) Serial.println("[shimmer] pool alloc FAILED — module blijft droog");
    }
    mmb_dsp::Shimmer& sh() { return sh_; }
    // FW-13: galmpool los zolang geparkeerd, vers terug bij hergebruik.
    void park() {
        AudioNoInterrupts();
        sh_.Init(AUDIO_SAMPLE_RATE_EXACT, nullptr, 0);
        std::unique_ptr<float[]> old = std::move(pool_);
        AudioInterrupts();
    }
    void unpark() {
        if (pool_) return;
        const int len = mmb_dsp::Shimmer::poolLength(AUDIO_SAMPLE_RATE_EXACT);
        std::unique_ptr<float[]> fresh(new (std::nothrow) float[len]);
        if (!fresh) { Serial.println("[shimmer] pool alloc FAILED bij hergebruik"); return; }
        AudioNoInterrupts();
        pool_ = std::move(fresh);
        sh_.Init(AUDIO_SAMPLE_RATE_EXACT, pool_.get(), len);
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
            sh_.Process(x);
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
    std::unique_ptr<float[]> pool_;
    mmb_dsp::Shimmer sh_;
};

class ShimmerModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_shimmer";
    explicit ShimmerModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        auto* s = const_cast<ShimmerStream*>(&stream_);
        if (portId == "out_l" || portId == "out") return { s, 0, true };
        if (portId == "out_r") return { s, 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        auto* s = const_cast<ShimmerStream*>(&stream_);
        if (portId == "in_l" || portId == "in") return { s, 0, true };
        if (portId == "in_r") return { s, 1, true };
        return {};
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in_l" || portId == "in_r" || portId == "in") return PortKind::Audio;
        if (cvPortIs(portId, "shimmer") || cvPortIs(portId, "size") || cvPortIs(portId, "mix")) return PortKind::Cv;
        return PortKind::None;
    }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out_l" || portId == "out_r" || portId == "out") return PortKind::Audio;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        auto& s = stream_.sh();
        if      (cvPortIs(portId, "shimmer")) s.set_shimmer(value);
        else if (cvPortIs(portId, "size"))    s.set_size(value);
        else if (cvPortIs(portId, "mix"))     s.set_mix(value);
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            if (auto* b = std::get_if<bool>        (&value)) return *b ? 1.0f : 0.0f;
            return fb;
        };
        static constexpr float kIntervals[5] = { 12.0f, 7.0f, 19.0f, 24.0f, -12.0f };
        auto& s = stream_.sh();
        if      (controlId == "size")     s.set_size(asFloat(0.75f));
        else if (controlId == "damp")     s.set_damp(asFloat(0.35f));
        else if (controlId == "shimmer")  s.set_shimmer(asFloat(0.5f));
        else if (controlId == "interval") {
            int i = static_cast<int>(asFloat(0.0f) + 0.5f);
            if (i < 0) i = 0; if (i > 4) i = 4;
            s.set_interval(kIntervals[i]);
        }
        else if (controlId == "tone")     s.set_tone(asFloat(0.6f));
        else if (controlId == "predelay") s.set_predelay(asFloat(20.0f));
        else if (controlId == "mod")      s.set_mod(asFloat(0.4f));
        else if (controlId == "mix")      s.set_mix(asFloat(0.4f));
    }

    void onRetire() override { stream_.park(); }
    void onReuse()  override { stream_.unpark(); }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<ShimmerModule>(id); });
    }

private:
    mutable ShimmerStream stream_;
};

}  // namespace mmb_link
