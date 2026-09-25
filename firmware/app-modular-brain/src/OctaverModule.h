#pragma once
/**
 * @file OctaverModule.h
 * @brief Analoge octaver, OC-2-stijl (`tp_mmb_octaver`), mono.
 *
 * mmb_dsp::Octaver: flip-flop-delers op de nuldoorgangen (f/2, f/4) ×
 * envelope van de ingang, plus de gelijkricht-truc voor een octaaf omhoog.
 * Moduleerbaar: CV-ingangen voor de drie octaafniveaus.
 *
 * Poorten: in → out; CV oct1, oct2, up (ook `*_cv`).
 * Controls: dry, oct1, oct2, up (0..1), tone.
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cstdint>
#include <string_view>
#include "mmb_dsp/octaver.h"

namespace mmb_link {

class OctaverStream : public AudioStream {
public:
    OctaverStream() : AudioStream(1, inputQueue_) { oct_.Init(AUDIO_SAMPLE_RATE_EXACT); }
    mmb_dsp::Octaver& oct() { return oct_; }

    void update() override {
        audio_block_t* in  = receiveReadOnly(0);
        audio_block_t* out = allocate();
        if (!out) { if (in) release(in); return; }
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            const float x = in ? in->data[i] * (1.0f / 32768.0f) : 0.0f;
            out->data[i] = static_cast<int16_t>(clamp1(oct_.Process(x)) * 32767.0f);
        }
        transmit(out, 0); release(out);
        if (in) release(in);
    }

private:
    static float clamp1(float v) { return v != v ? 0.0f : (v > 1.0f ? 1.0f : (v < -1.0f ? -1.0f : v)); }
    audio_block_t* inputQueue_[1] = { nullptr };
    mmb_dsp::Octaver oct_;
};

class OctaverModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_octaver";
    explicit OctaverModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") return { const_cast<OctaverStream*>(&stream_), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in") return { const_cast<OctaverStream*>(&stream_), 0, true };
        return {};
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in") return PortKind::Audio;
        if (cvPortIs(portId, "oct1") || cvPortIs(portId, "oct2") || cvPortIs(portId, "up")) return PortKind::Cv;
        return PortKind::None;
    }
    PortKind outputPortKind(std::string_view portId) const override {
        return portId == "out" ? PortKind::Audio : PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        auto& o = stream_.oct();
        if      (cvPortIs(portId, "oct1")) o.set_oct1(value);
        else if (cvPortIs(portId, "oct2")) o.set_oct2(value);
        else if (cvPortIs(portId, "up"))   o.set_up(value);
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            if (auto* b = std::get_if<bool>        (&value)) return *b ? 1.0f : 0.0f;
            return fb;
        };
        auto& o = stream_.oct();
        if      (controlId == "dry")  o.set_dry(asFloat(1.0f));
        else if (controlId == "oct1") o.set_oct1(asFloat(0.7f));
        else if (controlId == "oct2") o.set_oct2(asFloat(0.0f));
        else if (controlId == "up")   o.set_up(asFloat(0.0f));
        else if (controlId == "tone") o.set_tone(asFloat(0.5f));
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<OctaverModule>(id); });
    }

private:
    mutable OctaverStream stream_;
};

}  // namespace mmb_link
