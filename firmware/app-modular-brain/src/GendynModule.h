#pragma once
/**
 * @file GendynModule.h
 * @brief Dynamische stochastische synthese (typeId `tp_mmb_gendyn`, Xenakis):
 *        breekpunten die per cyclus een begrensde random walk maken.
 *
 * @details
 * De DSP is @ref mmb_dsp::Gendyn, dezelfde header als de browser
 * (`tools/mmb-wasm/gendyn_wasm.cc`). De nominale periode volgt V/Oct en
 * Pitch; `points` breekpunten wandelen in amplitude (`amp_step`) en duur
 * (`dur_step`) binnen spiegelende grenzen. `gate` zaait de ruis opnieuw met
 * `seed` en herstelt de beginvorm, zodat iedere noot reproduceerbaar start;
 * zonder gate loopt de wandeling vrij door.
 *
 * Port map:
 * | Dir | portId     | Kind  | Betekenis                                   |
 * |-----|------------|-------|---------------------------------------------|
 * | in  | `voct`     | Cv    | 1 V/oct rond C4                             |
 * | in  | `gate`     | Gate  | Stijgende flank: herzaai en beginvorm       |
 * | in  | `chaos_cv` | Cv    | Telt op bij amp_step, begrensd 0..1         |
 * | in  | `reset`    | Gate  | Zelfde als gate                             |
 * | out | `out`      | Audio | Golfvorm                                    |
 * | out | `cycle`    | Gate  | Hoog tijdens het eerste segment van elke cyclus |
 *
 * Controls: `pitch`, `points` (3..24), `amp_step`, `dur_step`, `dist`,
 * `smooth`, `settle`, `seed` (0..99), `level`.
 */
#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/gendyn.h"
#include <memory>

namespace mmb_link {

class GendynStream final : public AudioStream {
public:
    GendynStream() : AudioStream(0, nullptr) { gendyn_.Init(AUDIO_SAMPLE_RATE_EXACT); }

    void control(int index, float value) { controls_[index] = value; }
    void cv(int index, float value) { inputs_[index] = value; }
    float cycle() const { return cycle_; }
    void active(bool value) { active_ = value; }

    void update() override {
        if (!active_) return;
        for (int index = 0; index < 9; ++index) {
            const float value = controls_[index];
            if (value != applied_[index]) {
                gendyn_.setControl(index, value);
                applied_[index] = value;
            }
        }
        gendyn_.setVoct(inputs_[0]);
        gendyn_.setChaosCv(inputs_[2]);
        const float gate = inputs_[1], reset = inputs_[3];
        audio_block_t* out = allocate();
        float cycle = 0;
        for (int sample = 0; sample < AUDIO_BLOCK_SAMPLES; ++sample) {
            float value, cycleSample;
            gendyn_.Tick(gate, reset, value, cycleSample);
            if (cycleSample > cycle) cycle = cycleSample;
            if (out) out->data[sample] = static_cast<int16_t>(value * 32767);
        }
        cycle_ = cycle;
        if (out) { transmit(out, 0); release(out); }
    }

private:
    mmb_dsp::Gendyn gendyn_;
    volatile float controls_[9] = {0, 12, 0.3f, 0.3f, 0.3f, 0.5f, 0.1f, 1, 0.8f};
    float applied_[9] = {0, 12, 0.3f, 0.3f, 0.3f, 0.5f, 0.1f, 1, 0.8f};
    volatile float inputs_[4] = {0, 0, 0, 0};  // voct, gate, chaos_cv, reset
    volatile float cycle_ = 0;
    volatile bool active_ = true;
};

class GendynModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_gendyn";
    explicit GendynModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") return {&stream_, 0, true};
        return {};
    }
    AudioPort inputPort(std::string_view) const override { return {}; }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out") return PortKind::Audio;
        if (portId == "cycle") return PortKind::Gate;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "voct" || portId == "chaos_cv") return PortKind::Cv;
        if (portId == "gate" || portId == "reset") return PortKind::Gate;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        return portId == "cycle" ? stream_.cycle() : 0;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct") stream_.cv(0, value);
        else if (portId == "gate") stream_.cv(1, value);
        else if (portId == "chaos_cv") stream_.cv(2, value);
        else if (portId == "reset") stream_.cv(3, value);
    }
    void onCvDisconnected(std::string_view portId) override { writeCvPort(portId, 0); }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* floatValue = std::get_if<float>(&value)) number = *floatValue;
        else if (const auto* intValue = std::get_if<int32_t>(&value)) number = static_cast<float>(*intValue);
        else return;
        using Kernel = mmb_dsp::Gendyn;
        if (controlId == "pitch") stream_.control(Kernel::Pitch, number);
        else if (controlId == "points") stream_.control(Kernel::Points, number);
        else if (controlId == "amp_step") stream_.control(Kernel::AmpStep, number);
        else if (controlId == "dur_step") stream_.control(Kernel::DurStep, number);
        else if (controlId == "dist") stream_.control(Kernel::Dist, number);
        else if (controlId == "smooth") stream_.control(Kernel::Smooth, number);
        else if (controlId == "settle") stream_.control(Kernel::Settle, number);
        else if (controlId == "seed") stream_.control(Kernel::Seed, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<GendynModule>(id);
        });
    }

private:
    mutable GendynStream stream_;
};

}
