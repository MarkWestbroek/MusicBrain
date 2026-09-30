#pragma once
#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/material_bridge.h"
#include <memory>

namespace mmb_link {

class MaterialBridgeStream final : public AudioStream {
public:
    MaterialBridgeStream() : AudioStream(1, inputQueue_) { bridge_.Init(AUDIO_SAMPLE_RATE_EXACT); }

    void control(int index, float value) { controls_[index] = value; }
    void cv(int index, float value) { inputs_[index] = value; }
    float stress() const { return stress_; }
    void active(bool value) { active_ = value; }

    void update() override {
        audio_block_t* input = receiveReadOnly(0);
        if (!active_) {
            bridge_.clear();
            stress_ = 0;
            if (input) release(input);
            return;
        }
        for (int index = 0; index < 8; ++index) {
            const float value = controls_[index];
            if (value != applied_[index]) {
                bridge_.setControl(index, value);
                applied_[index] = value;
            }
        }
        bridge_.setVoct(inputs_[0]);
        bridge_.setModulation(inputs_[5], inputs_[6]);
        const float gateA = inputs_[1], gateB = inputs_[2], velocity = inputs_[3], reset = inputs_[4];
        audio_block_t* left = allocate();
        audio_block_t* right = allocate();
        for (int sample = 0; sample < AUDIO_BLOCK_SAMPLES; ++sample) {
            float outputLeft, outputRight;
            bridge_.Tick(input ? input->data[sample] / 32768.0f : 0,
                         gateA, gateB, velocity, reset, outputLeft, outputRight);
            if (left) left->data[sample] = static_cast<int16_t>(outputLeft * 32767);
            if (right) right->data[sample] = static_cast<int16_t>(outputRight * 32767);
        }
        stress_ = bridge_.stress();
        if (left) { transmit(left, 0); release(left); }
        if (right) { transmit(right, 1); release(right); }
        if (input) release(input);
    }

private:
    audio_block_t* inputQueue_[1] = {nullptr};
    mmb_dsp::MaterialBridge bridge_;
    volatile float controls_[8] = {0, 0.35f, 0.5f, 2, 0.7f, 2, 0.25f, 0.8f};
    float applied_[8] = {0, 0.35f, 0.5f, 2, 0.7f, 2, 0.25f, 0.8f};
    volatile float inputs_[7] = {0, 0, 0, 1, 0, 0, 0};
    volatile float stress_ = 0;
    volatile bool active_ = true;
};

class MaterialBridgeModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_material_bridge";
    explicit MaterialBridgeModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out_l") return {&stream_, 0, true};
        if (portId == "out_r") return {&stream_, 1, true};
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in") return {&stream_, 0, true};
        return {};
    }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out_l" || portId == "out_r") return PortKind::Audio;
        if (portId == "stress") return PortKind::Cv;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in") return PortKind::Audio;
        if (portId == "voct" || portId == "vel" || portId == "coupling_cv" || portId == "pickup_cv") return PortKind::Cv;
        if (portId == "gate" || portId == "gate_b" || portId == "reset") return PortKind::Gate;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        return portId == "stress" ? stream_.stress() : 0;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct") stream_.cv(0, value);
        else if (portId == "gate") stream_.cv(1, value);
        else if (portId == "gate_b") stream_.cv(2, value);
        else if (portId == "vel") stream_.cv(3, value);
        else if (portId == "reset") stream_.cv(4, value);
        else if (portId == "coupling_cv") stream_.cv(5, value);
        else if (portId == "pickup_cv") stream_.cv(6, value);
    }
    void onCvDisconnected(std::string_view portId) override {
        writeCvPort(portId, portId == "vel" ? 1 : 0);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* floatValue = std::get_if<float>(&value)) number = *floatValue;
        else if (const auto* intValue = std::get_if<int32_t>(&value)) number = static_cast<float>(*intValue);
        else return;
        using Kernel = mmb_dsp::MaterialBridge;
        if (controlId == "pitch") stream_.control(Kernel::Pitch, number);
        else if (controlId == "spread") stream_.control(Kernel::Spread, number);
        else if (controlId == "coupling") stream_.control(Kernel::Coupling, number);
        else if (controlId == "decay") stream_.control(Kernel::Decay, number);
        else if (controlId == "memory") stream_.control(Kernel::Memory, number);
        else if (controlId == "recovery") stream_.control(Kernel::Recovery, number);
        else if (controlId == "pickup") stream_.control(Kernel::Pickup, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<MaterialBridgeModule>(id);
        });
    }

private:
    mutable MaterialBridgeStream stream_;
};

}