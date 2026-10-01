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
    void setPressure(float value) { voice_.setPressure(value); }
    void setSyllable(int index) { voice_.setSyllable(index); }
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
        if (portId == "gate" || portId == "next" || portId == "reset") return PortKind::Gate;
        if (portId == "voct" || portId == "vowel" || portId == "breath" || portId == "vibrato" || portId == "voice"
            || portId == "vel" || portId == "pressure" || portId == "syl_cv") return PortKind::Cv;
        return PortKind::None;
    }

    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct") {
            stream_.setFrequency(261.6256f * std::pow(2.0f, value));
        } else if (portId == "gate") {
            gate_ = value >= 0.5f;
            stream_.setGate(gate_);
        } else if (portId == "vel") {
            velCv_ = clamp01(value); apply();
        } else if (portId == "pressure") {
            pressCv_ = clamp01(value); apply();
        } else if (portId == "vowel") {
            vowelCv_ = value; apply();
        } else if (portId == "breath") {
            breathCv_ = value; apply();
        } else if (portId == "vibrato") {
            vibratoCv_ = value; apply();
        } else if (portId == "voice") {
            voiceCv_ = value; apply();
        } else if (portId == "syl_cv") {
            sylCv_ = value; apply();
        } else if (portId == "next") {
            // Rising edge: step to the next syllable (a sustain pedal via
            // MIDI-IN CC2 works); the knob/CV choice is the base.
            const bool high = value >= 0.5f;
            if (high && !nextWas_) { sylStep_ = (sylStep_ + 1) % mmb_dsp::FofVoice::kSyllableCount; apply(); }
            nextWas_ = high;
        } else if (portId == "reset") {
            const bool high = value >= 0.5f;
            if (high && !resetWas_) { sylStep_ = 0; apply(); }
            resetWas_ = high;
        }
    }

    /** Unplugging Vel or Pressure restores full strength (the wasm wrapper
     *  does the same for an unconnected input); other CV ports fall back to 0. */
    void onCvDisconnected(std::string_view portId) override {
        writeCvPort(portId, portId == "vel" || portId == "pressure" ? 1.0f : 0.0f);
    }

    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number = 0.0f;
        if (const auto* floatValue = std::get_if<float>(&value)) number = *floatValue;
        else if (const auto* intValue = std::get_if<int32_t>(&value)) number = static_cast<float>(*intValue);
        else if (const auto* boolValue = std::get_if<bool>(&value)) number = *boolValue ? 1.0f : 0.0f;
        if (controlId == "vowel") { vowel_ = clamp01(number); apply(); }
        else if (controlId == "tone") { stream_.setTone(clamp01(number)); }
        else if (controlId == "voice") { voice_ = clamp01(number); apply(); }
        else if (controlId == "breath") { breath_ = clamp01(number); apply(); }
        else if (controlId == "vibrato") { vibrato_ = clamp01(number); apply(); }
        else if (controlId == "level") { stream_.setLevel(clamp01(number)); }
        else if (controlId == "vowel_amt") { vowelAmt_ = clamp01(number); apply(); }
        else if (controlId == "breath_amt") { breathAmt_ = clamp01(number); apply(); }
        else if (controlId == "vibrato_amt") { vibratoAmt_ = clamp01(number); apply(); }
        else if (controlId == "voice_amt") { voiceAmt_ = clamp01(number); apply(); }
        else if (controlId == "vel_amt") { velAmt_ = clamp01(number); apply(); }
        else if (controlId == "press_amt") { pressAmt_ = clamp01(number); apply(); }
        else if (controlId == "syl") { syl_ = number; apply(); }
        else if (controlId == "syl_amt") { sylAmt_ = clamp01(number); apply(); }
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

    /** Knob + attenuated CV for the four modulation inputs; Vel and Press
     *  are scaled towards 1 (amt 0 = no effect), so every amt defaults to 1
     *  and an unpatched input leaves the voice untouched. Same formulas as
     *  tools/mmb-wasm/fof_wasm.cc. */
    void apply() {
        stream_.setVowel(clamp01(vowel_ + vowelAmt_ * vowelCv_) * 4.0f);
        stream_.setBreath(clamp01(breath_ + breathAmt_ * breathCv_));
        stream_.setVibrato(clamp01(vibrato_ + vibratoAmt_ * vibratoCv_));
        stream_.setVoice(clamp01(voice_ + voiceAmt_ * voiceCv_));
        stream_.setVelocity(1.0f - velAmt_ * (1.0f - velCv_));
        stream_.setPressure(1.0f - pressAmt_ * (1.0f - pressCv_));
        // Syllable: switch + CV over the table (0..1 = first..last), like ZANG's syl_cv.
        const int count = mmb_dsp::FofVoice::kSyllableCount;
        const float span = static_cast<float>(count - 1);
        const int base = static_cast<int>(std::lround(syl_ + sylAmt_ * clamp01(sylCv_) * span));
        stream_.setSyllable(((base < 0 ? 0 : base) + sylStep_) % count);
    }

    mutable FofAudioStream stream_;
    float vowel_ = 0.0f, vowelCv_ = 0.0f, vowelAmt_ = 1.0f;
    float breath_ = 0.08f, breathCv_ = 0.0f, breathAmt_ = 1.0f;
    float vibrato_ = 0.12f, vibratoCv_ = 0.0f, vibratoAmt_ = 1.0f;
    float voice_ = 0.35f, voiceCv_ = 0.0f, voiceAmt_ = 1.0f;
    float velCv_ = 1.0f, velAmt_ = 1.0f;
    float pressCv_ = 1.0f, pressAmt_ = 1.0f;
    float syl_ = 0.0f, sylCv_ = 0.0f, sylAmt_ = 1.0f;
    int sylStep_ = 0;
    bool nextWas_ = false, resetWas_ = false;
    bool gate_ = false;
};

}  // namespace mmb_link