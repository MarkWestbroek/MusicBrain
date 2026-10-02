#pragma once
/**
 * @file ComplexOscModule.h
 * @brief Complex-oscillator naar de Buchla 259 (typeId `tp_mmb_complex`).
 *
 * mmb_dsp::ComplexOsc: een modulatie-oscillator die de hoofdoscillator op drie
 * manieren bewerkt (FM door nul heen, AM, timbre), en een sinus door de vijf
 * vouwcellen van het 259-timbre-circuit. Dezelfde header als de browser
 * (`tools/mmb-wasm/complex_wasm.cc`).
 *
 * Poorten: voct (CV), timbre_cv + fm_cv (CV, tellen op bij de knop) → out
 * (hoofdoscillator), mod (modulatie-oscillator).
 * Controls: pitch (semitonen), ratio (modulator maal de grondtoon), mod_wave
 * (0 sinus, 1 driehoek, 2 zaag), fm, am, tmod (0..1), timbre (0..1), symmetry
 * (-1..1), level.
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/complex_osc.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class ComplexOscModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_complex";
    using Kernel = mmb_dsp::ComplexOsc;
    explicit ComplexOscModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") return {&stream_, 0, true};
        if (portId == "mod") return {&stream_, 1, true};
        return {};
    }
    AudioPort inputPort(std::string_view) const override { return {}; }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out" || portId == "mod") return PortKind::Audio;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "voct" || portId == "timbre_cv" || portId == "fm_cv") return PortKind::Cv;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct") stream_.cv(Kernel::Voct, value);
        else if (portId == "timbre_cv") stream_.cv(Kernel::TimbreCv, value);
        else if (portId == "fm_cv") stream_.cv(Kernel::FmCv, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else if (const auto* b = std::get_if<bool>(&value)) number = *b ? 1.0f : 0.0f;
        else return;
        if (controlId == "pitch") stream_.control(Kernel::Pitch, number);
        else if (controlId == "ratio") stream_.control(Kernel::Ratio, number);
        else if (controlId == "mod_wave") stream_.control(Kernel::ModWave, number);
        else if (controlId == "fm") stream_.control(Kernel::Fm, number);
        else if (controlId == "am") stream_.control(Kernel::Am, number);
        else if (controlId == "tmod") stream_.control(Kernel::TimbreMod, number);
        else if (controlId == "timbre") stream_.control(Kernel::Timbre, number);
        else if (controlId == "symmetry") stream_.control(Kernel::Symmetry, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<ComplexOscModule>(id);
        });
    }

private:
    mutable KernelStream<Kernel, 0, 2> stream_;
};

}  // namespace mmb_link
