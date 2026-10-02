#pragma once
/**
 * @file PercuterModule.h
 * @brief Acht digitale drumkanalen naar de Dynacord Percuter (typeId
 *        `tp_mmb_percuter`).
 *
 * mmb_dsp::Percuter: kanaal k speelt slot k van de samplebank die de
 * `bank`-knop kiest (dezelfde `/mmb/banks/NN.mmbs` en dezelfde SampleBank
 * als de sampler en de tape strip; de firmware houdt één bank tegelijk, dus
 * een sampler met een ander banknummer wisselt ermee af). Zonder
 * interpolatie, op 8 bit, op de samplefrequentie van de cartridge.
 * Dezelfde kern als de browser (`tools/mmb-wasm/percuter_wasm.cc`).
 *
 * Poorten en controls zijn genummerd (`trig_k`, `vel_k`, `out_k`,
 * `level_k`, `pan_k`, `decay_k`, `tune_k`, k = 1..8) en worden op hun
 * nummer geparsed; ze staan daarom in OVERRIDES van tools/contract_dump.py.
 *
 * Poorten: trig_1..8 (gate), vel_1..8 (CV 0..1; los = volle aanslag),
 * pitch (CV, V/Oct: het pitchpedaal) → out_l, out_r (stereo-som),
 * out_1..8 (de kanalen apart, zonder volume en pan).
 * Controls: bank (0..15), tune (semitonen), filter (toggle), level, en per
 * kanaal level_k, pan_k, decay_k, tune_k.
 */

#include "AudioModule.h"
#include "SamplerModule.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/percuter.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class PercuterStream final : public AudioStream {
public:
    using Kernel = mmb_dsp::Percuter;
    static constexpr int kOuts = 2 + Kernel::kChannels;

    PercuterStream() : AudioStream(0, nullptr) {
        kernel_.Init(AUDIO_SAMPLE_RATE_EXACT);
        for (int i = 0; i < Kernel::kControls; ++i) { controls_[i] = Kernel::kDefaults[i]; applied_[i] = Kernel::kDefaults[i]; }
    }

    void setBank(int b) {
        b = b < 0 ? 0 : b > 15 ? 15 : b;
        if (b == bank_) return;
        bank_ = b;
        SampleBank::instance().load(bank_);
    }
    void control(int index, float value) { if (index >= 0 && index < Kernel::kControls) controls_[index] = value; }
    void cv(int index, float value) { if (index >= 0 && index < Kernel::kCvIns) cv_[index] = value; }
    void active(bool value) { active_ = value; }

    void update() override {
        if (!active_) return;
        SampleBank& bank = SampleBank::instance();
        if (boundVersion_ != bank.version()) { boundVersion_ = bank.version(); kernel_.bind(bank.slots(), bank.numSlots()); }
        for (int i = 0; i < Kernel::kControls; ++i) {
            const float value = controls_[i];
            if (value != applied_[i]) { kernel_.setControl(i, value); applied_[i] = value; }
        }
        for (int i = 0; i < Kernel::kCvIns; ++i) kernel_.setCv(i, cv_[i]);
        float* outputs[kOuts];
        for (int c = 0; c < kOuts; ++c) outputs[c] = out_[c];
        kernel_.Process(nullptr, outputs, AUDIO_BLOCK_SAMPLES);
        for (int c = 0; c < kOuts; ++c) {
            audio_block_t* block = allocate();
            if (!block) continue;
            for (int s = 0; s < AUDIO_BLOCK_SAMPLES; ++s) {
                float v = out_[c][s];
                if (!(v == v)) v = 0;
                v = v < -1 ? -1 : v > 1 ? 1 : v;
                block->data[s] = static_cast<int16_t>(v * 32767.0f);
            }
            transmit(block, c);
            release(block);
        }
    }

private:
    Kernel kernel_;
    float out_[kOuts][AUDIO_BLOCK_SAMPLES];
    volatile float controls_[Kernel::kControls];
    float applied_[Kernel::kControls];
    volatile float cv_[Kernel::kCvIns] = {};
    uint32_t boundVersion_ = 0xffffffffu;
    int bank_ = -1;
    volatile bool active_ = true;
};

class PercuterModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_percuter";
    using Kernel = mmb_dsp::Percuter;
    explicit PercuterModule(std::string_view id) : AudioModule(kTypeId, id) { stream_.setBank(0); }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out_l") return {&stream_, 0, true};
        if (portId == "out_r") return {&stream_, 1, true};
        const int k = numbered(portId, "out_");
        if (k >= 0) return {&stream_, static_cast<uint8_t>(2 + k), true};
        return {};
    }
    AudioPort inputPort(std::string_view) const override { return {}; }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out_l" || portId == "out_r" || numbered(portId, "out_") >= 0) return PortKind::Audio;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (numbered(portId, "trig_") >= 0) return PortKind::Gate;
        if (numbered(portId, "vel_") >= 0 || portId == "pitch") return PortKind::Cv;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "pitch") { stream_.cv(Kernel::kPitch, value); return; }
        int k = numbered(portId, "vel_");
        if (k >= 0) { stream_.cv(Kernel::kVelBase + k, value); return; }
        k = numbered(portId, "trig_");
        if (k >= 0) stream_.cv(Kernel::kTrigBase + k, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else if (const auto* b = std::get_if<bool>(&value)) number = *b ? 1.0f : 0.0f;
        else return;
        if (controlId == "bank") { stream_.setBank(static_cast<int>(number + 0.5f)); return; }
        if (controlId == "tune") { stream_.control(Kernel::Tune, number); return; }
        if (controlId == "filter") { stream_.control(Kernel::Filter, number); return; }
        if (controlId == "level") { stream_.control(Kernel::Level, number); return; }
        int k = numbered(controlId, "level_");
        if (k >= 0) { stream_.control(Kernel::kLevelBase + k, number); return; }
        k = numbered(controlId, "pan_");
        if (k >= 0) { stream_.control(Kernel::kPanBase + k, number); return; }
        k = numbered(controlId, "decay_");
        if (k >= 0) { stream_.control(Kernel::kDecayBase + k, number); return; }
        k = numbered(controlId, "tune_");
        if (k >= 0) stream_.control(Kernel::kTuneBase + k, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<PercuterModule>(id);
        });
    }

private:
    /** `trig_3` met prefix `trig_` geeft 2; anders -1. */
    static int numbered(std::string_view id, std::string_view prefix) {
        if (id.size() != prefix.size() + 1 || id.substr(0, prefix.size()) != prefix) return -1;
        const int k = id[prefix.size()] - '1';
        return k >= 0 && k < Kernel::kChannels ? k : -1;
    }

    mutable PercuterStream stream_;
};

}  // namespace mmb_link
