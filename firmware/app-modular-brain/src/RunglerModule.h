#pragma once
/**
 * @file RunglerModule.h
 * @brief Chaotische stem naar de Benjolin van Rob Hordijk (typeId
 *        `tp_mmb_rungler`).
 *
 * mmb_dsp::Rungler: twee oscillatoren, een schuifregister van acht bits dat
 * door B geklokt wordt en A als data neemt, en een 3-bits DAC die beide
 * oscillatoren weer verstemt. Een comparator (driehoek A > driehoek B) door
 * een state-variable filter is het geluid; de rungler zelf is ook een
 * CV-uitgang. Dezelfde header als de browser
 * (`tools/mmb-wasm/rungler_wasm.cc`).
 *
 * Port map:
 * | Dir | portId      | Kind  | Betekenis                                |
 * |-----|-------------|-------|------------------------------------------|
 * | in  | `voct`      | Cv    | Toonhoogte van A, 1 V/oct maal `freq_a`  |
 * | in  | `rate_cv`   | Cv    | Snelheid van B, ±1 = ±4 octaven          |
 * | in  | `cutoff_cv` | Cv    | ±1 = ±4 octaven op de cutoff             |
 * | out | `out`       | Audio | Filteruitgang                            |
 * | out | `pwm`       | Audio | De kale comparator-pulsgolf              |
 * | out | `tri_a`     | Audio | Driehoek van A                           |
 * | out | `rungler`   | Cv    | Getrapte chaos, 0..1 (acht niveaus)      |
 * | out | `tri_b`     | Cv    | Driehoek van B, ±1                       |
 * | out | `pulse_b`   | Gate  | Puls van B (de klok van het register)    |
 *
 * Controls: freq_a (Hz), freq_b (Hz), run_a, run_b, cross_a, cross_b (0..1),
 * cutoff (Hz), res, sweep (0..1), loop (toggle), level.
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/rungler.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class RunglerModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_rungler";
    using Kernel = mmb_dsp::Rungler;
    explicit RunglerModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") return {&stream_, 0, true};
        if (portId == "pwm") return {&stream_, 1, true};
        if (portId == "tri_a") return {&stream_, 2, true};
        return {};
    }
    AudioPort inputPort(std::string_view) const override { return {}; }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out" || portId == "pwm" || portId == "tri_a") return PortKind::Audio;
        if (portId == "rungler" || portId == "tri_b") return PortKind::Cv;
        if (portId == "pulse_b") return PortKind::Gate;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "voct" || portId == "rate_cv" || portId == "cutoff_cv") return PortKind::Cv;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        if (portId == "rungler") return stream_.cvOut(Kernel::RunglerOut);
        if (portId == "tri_b") return stream_.cvOut(Kernel::TriB);
        if (portId == "pulse_b") return stream_.cvOut(Kernel::PulseB);
        return 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct") stream_.cv(Kernel::Voct, value);
        else if (portId == "rate_cv") stream_.cv(Kernel::RateCv, value);
        else if (portId == "cutoff_cv") stream_.cv(Kernel::CutoffCv, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else if (const auto* b = std::get_if<bool>(&value)) number = *b ? 1.0f : 0.0f;
        else return;
        if (controlId == "freq_a") stream_.control(Kernel::FreqA, number);
        else if (controlId == "freq_b") stream_.control(Kernel::FreqB, number);
        else if (controlId == "run_a") stream_.control(Kernel::RunA, number);
        else if (controlId == "run_b") stream_.control(Kernel::RunB, number);
        else if (controlId == "cross_a") stream_.control(Kernel::CrossA, number);
        else if (controlId == "cross_b") stream_.control(Kernel::CrossB, number);
        else if (controlId == "cutoff") stream_.control(Kernel::Cutoff, number);
        else if (controlId == "res") stream_.control(Kernel::Resonance, number);
        else if (controlId == "sweep") stream_.control(Kernel::Sweep, number);
        else if (controlId == "loop") stream_.control(Kernel::Loop, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<RunglerModule>(id);
        });
    }

private:
    mutable KernelStream<Kernel, 0, 3> stream_;
};

}  // namespace mmb_link
