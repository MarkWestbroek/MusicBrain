#pragma once
/**
 * @file ScannedModule.h
 * @brief Scanned synthesis (typeId `tp_mmb_scanned`): een traag bewegende
 *        massa-veerring die op audiotempo als golftabel wordt uitgelezen.
 *
 * @details
 * De DSP is @ref mmb_dsp::ScannedString, dezelfde header als de
 * browser-simulator (`tools/mmb-wasm/scanned_wasm.cc`). De fysica stapt op
 * ~5,5 kHz; `Speed` vertraagt het materiaal verder. `Hit` (gate) slaat de
 * ring aan met velocity, `Press` (CV 0..1) drukt een vinger in de ring op
 * `Position`, `In` duwt met audio. `Energy` geeft de uitwijking als CV.
 *
 * Port map:
 * | Dir | portId   | Kind  | Betekenis                                   |
 * |-----|----------|-------|---------------------------------------------|
 * | in  | `in`     | Audio | Kracht op de ring rond Position             |
 * | in  | `voct`   | Cv    | 1 V/oct rond C4 (uitleessnelheid)           |
 * | in  | `gate`   | Gate  | Aanslag op stijgende flank                   |
 * | in  | `vel`    | Cv    | Velocity 0..1 (zonder kabel 1)              |
 * | in  | `press`  | Cv    | Doorlopende druk 0..1 (zonder kabel 0)      |
 * | in  | `pos_cv` | Cv    | Telt op bij Position, begrensd 0..1         |
 * | in  | `reset`  | Gate  | Wist posities en snelheden                  |
 * | out | `out`    | Audio | Uitgelezen golfvorm                         |
 * | out | `energy` | Cv    | RMS-uitwijking van de ring 0..1             |
 *
 * Controls: `pitch`, `tension`, `damping`, `restore`, `speed`, `position`,
 * `width`, `level`. CV en gates worden eenmaal per audioblok (128 samples)
 * overgenomen; gebruik gates van minstens 5 ms.
 */
#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/scanned_string.h"
#include <memory>

namespace mmb_link {

class ScannedStream final : public AudioStream {
public:
    ScannedStream() : AudioStream(1, inputQueue_) { string_.Init(AUDIO_SAMPLE_RATE_EXACT); }

    void control(int index, float value) { controls_[index] = value; }
    void cv(int index, float value) { inputs_[index] = value; }
    float energy() const { return energy_; }
    void active(bool value) { active_ = value; }

    void update() override {
        audio_block_t* input = receiveReadOnly(0);
        if (!active_) {
            string_.clear();
            energy_ = 0;
            if (input) release(input);
            return;
        }
        for (int index = 0; index < 8; ++index) {
            const float value = controls_[index];
            if (value != applied_[index]) {
                string_.setControl(index, value);
                applied_[index] = value;
            }
        }
        string_.setVoct(inputs_[0]);
        string_.setPositionCv(inputs_[4]);
        const float gate = inputs_[1], velocity = inputs_[2], press = inputs_[3], reset = inputs_[5];
        audio_block_t* out = allocate();
        for (int sample = 0; sample < AUDIO_BLOCK_SAMPLES; ++sample) {
            float value;
            string_.Tick(input ? input->data[sample] / 32768.0f : 0, gate, velocity, press, reset, value);
            if (out) out->data[sample] = static_cast<int16_t>(value * 32767);
        }
        energy_ = string_.energy();
        if (out) { transmit(out, 0); release(out); }
        if (input) release(input);
    }

private:
    audio_block_t* inputQueue_[1] = {nullptr};
    mmb_dsp::ScannedString string_;
    volatile float controls_[8] = {0, 0.6f, 0.3f, 0.3f, 0.15f, 0.5f, 0.3f, 0.8f};
    float applied_[8] = {0, 0.6f, 0.3f, 0.3f, 0.15f, 0.5f, 0.3f, 0.8f};
    volatile float inputs_[6] = {0, 0, 1, 0, 0, 0};  // voct, gate, vel, press, pos_cv, reset
    volatile float energy_ = 0;
    volatile bool active_ = true;
};

class ScannedModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_scanned";
    explicit ScannedModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") return {&stream_, 0, true};
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in") return {&stream_, 0, true};
        return {};
    }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out") return PortKind::Audio;
        if (portId == "energy") return PortKind::Cv;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in") return PortKind::Audio;
        if (portId == "voct" || portId == "vel" || portId == "press" || portId == "pos_cv") return PortKind::Cv;
        if (portId == "gate" || portId == "reset") return PortKind::Gate;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        return portId == "energy" ? stream_.energy() : 0;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct") stream_.cv(0, value);
        else if (portId == "gate") stream_.cv(1, value);
        else if (portId == "vel") stream_.cv(2, value);
        else if (portId == "press") stream_.cv(3, value);
        else if (portId == "pos_cv") stream_.cv(4, value);
        else if (portId == "reset") stream_.cv(5, value);
    }
    void onCvDisconnected(std::string_view portId) override {
        writeCvPort(portId, portId == "vel" ? 1 : 0);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* floatValue = std::get_if<float>(&value)) number = *floatValue;
        else if (const auto* intValue = std::get_if<int32_t>(&value)) number = static_cast<float>(*intValue);
        else return;
        using Kernel = mmb_dsp::ScannedString;
        if (controlId == "pitch") stream_.control(Kernel::Pitch, number);
        else if (controlId == "tension") stream_.control(Kernel::Tension, number);
        else if (controlId == "damping") stream_.control(Kernel::Damping, number);
        else if (controlId == "restore") stream_.control(Kernel::Restore, number);
        else if (controlId == "speed") stream_.control(Kernel::Speed, number);
        else if (controlId == "position") stream_.control(Kernel::Position, number);
        else if (controlId == "width") stream_.control(Kernel::Width, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<ScannedModule>(id);
        });
    }

private:
    mutable ScannedStream stream_;
};

}
