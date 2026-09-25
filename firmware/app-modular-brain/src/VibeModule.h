#pragma once
/**
 * @file VibeModule.h
 * @brief Univibe-stijl vibe + lichte vibrato, stereo (`tp_mmb_vibe`).
 *
 * mmb_dsp::Vibe: vier fasedraai-trappen met de univibe-condensatoren, één
 * lamp met LDR-traagheid (`lamp_age`), modes Chorus / Vibrato / Light (zuivere
 * vertragingslijn-vibrato). Zonder rechterkabel krijgt R hetzelfde als L.
 *
 * Poorten: in_l/in_r (in = L) → out_l/out_r (out = L); CV speed, intensity
 * (ook `*_cv`). Controls: speed (Hz), intensity, mode (0..2), lamp_age, volume.
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <string_view>
#include "mmb_dsp/vibe.h"

namespace mmb_link {

class VibeStream : public AudioStream {
public:
    VibeStream() : AudioStream(2, inputQueue_) { vibe_.Init(AUDIO_SAMPLE_RATE_EXACT); }
    mmb_dsp::Vibe& vibe() { return vibe_; }

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
            vibe_.Process(x, inR != nullptr);
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
    mmb_dsp::Vibe vibe_;
};

class VibeModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_vibe";
    explicit VibeModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        auto* s = const_cast<VibeStream*>(&stream_);
        if (portId == "out_l" || portId == "out") return { s, 0, true };
        if (portId == "out_r") return { s, 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        auto* s = const_cast<VibeStream*>(&stream_);
        if (portId == "in_l" || portId == "in") return { s, 0, true };
        if (portId == "in_r") return { s, 1, true };
        return {};
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in_l" || portId == "in_r" || portId == "in") return PortKind::Audio;
        if (cvPortIs(portId, "speed") || cvPortIs(portId, "intensity")) return PortKind::Cv;
        return PortKind::None;
    }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out_l" || portId == "out_r" || portId == "out") return PortKind::Audio;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        auto& v = stream_.vibe();
        if      (cvPortIs(portId, "speed"))     v.set_speed(value);
        else if (cvPortIs(portId, "intensity")) v.set_intensity(value);
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            if (auto* b = std::get_if<bool>        (&value)) return *b ? 1.0f : 0.0f;
            return fb;
        };
        auto& v = stream_.vibe();
        if      (controlId == "speed")     v.set_speed(asFloat(2.0f));
        else if (controlId == "intensity") v.set_intensity(asFloat(0.6f));
        else if (controlId == "mode")      v.set_mode(static_cast<int>(asFloat(0.0f) + 0.5f));
        else if (controlId == "lamp_age")  v.set_lamp(asFloat(0.7f));
        else if (controlId == "volume")    v.set_volume(asFloat(1.0f));
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<VibeModule>(id); });
    }

private:
    mutable VibeStream stream_;
};

}  // namespace mmb_link
