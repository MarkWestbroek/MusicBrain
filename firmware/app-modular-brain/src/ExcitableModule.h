#pragma once
/**
 * @file ExcitableModule.h
 * @brief Excitable-media synthesis (typeId `tp_mmb_excitable`): een raster
 *        van prikkelbare cellen met twee pacemakers en twee pickups.
 *
 * @details
 * De DSP is @ref mmb_dsp::ExcitableMedium, dezelfde header als de browser
 * (`tools/mmb-wasm/excitable_wasm.cc`). Pacemaker A (links) en B (rechts)
 * prikkelen hun cel op de toonhoogte van V/Oct (B met Detune en `voct_b`)
 * zolang hun gate hoog is. Golffronten lopen een cel per mediumstap, doven
 * aan de rand en vernietigen elkaar waar ze botsen. `Speed` is het aantal
 * audiosamples per mediumstap (1, 2 of 4); 1 is op de Teensy zwaar.
 *
 * Port map:
 * | Dir | portId     | Kind  | Betekenis                                   |
 * |-----|------------|-------|---------------------------------------------|
 * | in  | `voct`     | Cv    | 1 V/oct rond C4, beide bronnen              |
 * | in  | `gate`     | Gate  | Pacemaker A speelt zolang hoog              |
 * | in  | `voct_b`   | Cv    | Extra V/Oct voor B                          |
 * | in  | `gate_b`   | Gate  | Pacemaker B speelt zolang hoog              |
 * | in  | `reset`    | Gate  | Wist het medium                             |
 * | out | `out_l`    | Audio | Pickup links                                |
 * | out | `out_r`    | Audio | Pickup rechts                               |
 * | out | `activity` | Cv    | Aandeel actieve + refractaire cellen 0..1   |
 *
 * Controls: `pitch`, `detune`, `excite`, `refract`, `thresh`, `speed`,
 * `pickup`, `level`. CV en gates worden per audioblok overgenomen.
 */
#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/excitable.h"
#include <memory>

namespace mmb_link {

class ExcitableStream final : public AudioStream {
public:
    ExcitableStream() : AudioStream(0, nullptr) { medium_.Init(AUDIO_SAMPLE_RATE_EXACT); }

    void control(int index, float value) { controls_[index] = value; }
    void cv(int index, float value) { inputs_[index] = value; }
    float activity() const { return activity_; }
    void active(bool value) { active_ = value; }

    void update() override {
        if (!active_) { medium_.clear(); activity_ = 0; return; }
        for (int index = 0; index < 8; ++index) {
            const float value = controls_[index];
            if (value != applied_[index]) {
                medium_.setControl(index, value);
                applied_[index] = value;
            }
        }
        medium_.setVoct(inputs_[0]);
        medium_.setVoctB(inputs_[2]);
        const float gateA = inputs_[1], gateB = inputs_[3], reset = inputs_[4];
        audio_block_t* left = allocate();
        audio_block_t* right = allocate();
        for (int sample = 0; sample < AUDIO_BLOCK_SAMPLES; ++sample) {
            float outputLeft, outputRight;
            medium_.Tick(gateA, gateB, reset, outputLeft, outputRight);
            if (left) left->data[sample] = static_cast<int16_t>(outputLeft * 32767);
            if (right) right->data[sample] = static_cast<int16_t>(outputRight * 32767);
        }
        activity_ = medium_.activity();
        if (left) { transmit(left, 0); release(left); }
        if (right) { transmit(right, 1); release(right); }
    }

private:
    mmb_dsp::ExcitableMedium medium_;
    volatile float controls_[8] = {0, 7, 3, 12, 1, 2, 0.4f, 0.8f};
    float applied_[8] = {0, 7, 3, 12, 1, 2, 0.4f, 0.8f};
    volatile float inputs_[5] = {0, 0, 0, 0, 0};  // voct, gate, voct_b, gate_b, reset
    volatile float activity_ = 0;
    volatile bool active_ = true;
};

class ExcitableModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_excitable";
    explicit ExcitableModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out_l") return {&stream_, 0, true};
        if (portId == "out_r") return {&stream_, 1, true};
        return {};
    }
    AudioPort inputPort(std::string_view) const override { return {}; }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out_l" || portId == "out_r") return PortKind::Audio;
        if (portId == "activity") return PortKind::Cv;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "voct" || portId == "voct_b") return PortKind::Cv;
        if (portId == "gate" || portId == "gate_b" || portId == "reset") return PortKind::Gate;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        return portId == "activity" ? stream_.activity() : 0;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct") stream_.cv(0, value);
        else if (portId == "gate") stream_.cv(1, value);
        else if (portId == "voct_b") stream_.cv(2, value);
        else if (portId == "gate_b") stream_.cv(3, value);
        else if (portId == "reset") stream_.cv(4, value);
    }
    void onCvDisconnected(std::string_view portId) override { writeCvPort(portId, 0); }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* floatValue = std::get_if<float>(&value)) number = *floatValue;
        else if (const auto* intValue = std::get_if<int32_t>(&value)) number = static_cast<float>(*intValue);
        else return;
        using Kernel = mmb_dsp::ExcitableMedium;
        if (controlId == "pitch") stream_.control(Kernel::Pitch, number);
        else if (controlId == "detune") stream_.control(Kernel::Detune, number);
        else if (controlId == "excite") stream_.control(Kernel::Excite, number);
        else if (controlId == "refract") stream_.control(Kernel::Refract, number);
        else if (controlId == "thresh") stream_.control(Kernel::Thresh, number);
        else if (controlId == "speed") stream_.control(Kernel::Speed, number);
        else if (controlId == "pickup") stream_.control(Kernel::Pickup, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<ExcitableModule>(id);
        });
    }

private:
    mutable ExcitableStream stream_;
};

}
