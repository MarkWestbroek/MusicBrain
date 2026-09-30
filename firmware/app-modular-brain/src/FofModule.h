#pragma once

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/fof_voice.h"
#include <Audio.h>
#include <cmath>
#include <cstdint>
#include <memory>
#include <string_view>

namespace mmb_link {

class FofAudioStream final : public AudioStream {
public:
    FofAudioStream() : AudioStream(0, nullptr) { voice_.init(AUDIO_SAMPLE_RATE_EXACT); }

    void setFrequency(float hz) { voice_.setFrequency(hz); }
    void setGate(bool high) { voice_.setGate(high && active_); }
    void setVelocity(float value) { voice_.setVelocity(value); }
    void setVowel(float value) { voice_.setVowel(value); }
    void setVoice(float value) { voice_.setVoice(value); }
    void setTone(float value) { voice_.setTone(value); }
    void setBreath(float value) { voice_.setBreath(value); }
    void setVibrato(float value) { voice_.setVibrato(value); }
    void setLevel(float value) { voice_.setLevel(value); }
    void setActive(bool active) { active_ = active; if (!active) voice_.setGate(false); }

    void update() override {
        audio_block_t* block = allocate();
        if (!block) return;
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            float sample = active_ ? voice_.process() : 0.0f;
            if (!(sample == sample)) sample = 0.0f;
            block->data[i] = static_cast<int16_t>(sample * 32767.0f);
        }
        transmit(block);
        release(block);
    }

private:
    mmb_dsp::FofVoice voice_;
    bool active_ = true;
};

class FofModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_fof";
    explicit FofModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") return { const_cast<FofAudioStream*>(&stream_), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view) const override { return {}; }
    PortKind outputPortKind(std::string_view portId) const override {
        return portId == "out" ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "gate") return PortKind::Gate;
        if (portId == "voct" || portId == "vowel" || portId == "breath" || portId == "vel") return PortKind::Cv;
        return PortKind::None;
    }

    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct") {
            stream_.setFrequency(261.6256f * std::pow(2.0f, value));
        } else if (portId == "gate") {
            gate_ = value >= 0.5f;
            stream_.setGate(gate_);
        } else if (portId == "vel") {
            stream_.setVelocity(clamp01(value));
        } else if (portId == "vowel") {
            vowelCv_ = value;
            stream_.setVowel(clamp01(vowel_ + vowelCv_) * 4.0f);
        } else if (portId == "breath") {
            breathCv_ = value;
            stream_.setBreath(clamp01(breath_ + breathCv_));
        }
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number = 0.0f;
        if (const auto* floatValue = std::get_if<float>(&value)) number = *floatValue;
        else if (const auto* intValue = std::get_if<int32_t>(&value)) number = static_cast<float>(*intValue);
        else if (const auto* boolValue = std::get_if<bool>(&value)) number = *boolValue ? 1.0f : 0.0f;
        if (controlId == "vowel") {
            vowel_ = clamp01(number);
            stream_.setVowel(clamp01(vowel_ + vowelCv_) * 4.0f);
        } else if (controlId == "tone") {
            stream_.setTone(clamp01(number));
        } else if (controlId == "voice") {
            stream_.setVoice(clamp01(number));
        } else if (controlId == "breath") {
            breath_ = clamp01(number);
            stream_.setBreath(clamp01(breath_ + breathCv_));
        } else if (controlId == "vibrato") {
            stream_.setVibrato(clamp01(number));
        } else if (controlId == "level") {
            stream_.setLevel(clamp01(number));
        }
    }

    void onRetire() override { stream_.setActive(false); }
    void onReuse() override { stream_.setActive(true); stream_.setGate(gate_); }

    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<FofModule>(id);
        });
    }

private:
    static float clamp01(float value) {
        return value < 0.0f ? 0.0f : (value > 1.0f ? 1.0f : value);
    }

    mutable FofAudioStream stream_;
    float vowel_ = 0.0f;
    float vowelCv_ = 0.0f;
    float breath_ = 0.08f;
    float breathCv_ = 0.0f;
    bool gate_ = false;
};

}  // namespace mmb_link