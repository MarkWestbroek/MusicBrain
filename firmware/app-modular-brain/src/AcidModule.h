#pragma once
/**
 * @file AcidModule.h
 * @brief Acid-basstem naar de TB-303 (typeId `tp_mmb_acid`), mono.
 *
 * mmb_dsp::Acid: oscillator (zaag/blok), vierpolig ladderfilter dat net niet
 * zelf zingt, filter-envelope met alleen Decay, en Accent en Slide als
 * gate-ingangen die bij het begin van de noot gelezen worden. Dezelfde header
 * als de browser (`tools/mmb-wasm/acid_wasm.cc`).
 *
 * Port map:
 * | Dir | portId      | Kind  | Betekenis                                   |
 * |-----|-------------|-------|---------------------------------------------|
 * | in  | `voct`      | Cv    | 1 V/oct rond C4                             |
 * | in  | `gate`      | Gate  | Noot aan/uit                                |
 * | in  | `accent`    | Gate  | Hoog bij de aanslag = noot met accent       |
 * | in  | `slide`     | Gate  | Hoog = glijden en gebonden doorspelen       |
 * | in  | `cutoff_cv` | Cv    | ±1 = ±4 octaven op de cutoff                |
 * | out | `out`       | Audio | De stem                                     |
 * | out | `env`       | Cv    | De filter-envelope (0..1)                   |
 *
 * Controls: wave (0 zaag, 1 blok), tune (semitonen), cutoff (0..1), res
 * (0..1), envmod (0..1), decay (0,1..3 s), accent (0..1), level.
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/acid.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class AcidModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_acid";
    using Kernel = mmb_dsp::Acid;
    explicit AcidModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") return {&stream_, 0, true};
        return {};
    }
    AudioPort inputPort(std::string_view) const override { return {}; }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out") return PortKind::Audio;
        if (portId == "env") return PortKind::Cv;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "voct" || portId == "cutoff_cv") return PortKind::Cv;
        if (portId == "gate" || portId == "accent" || portId == "slide") return PortKind::Gate;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        return portId == "env" ? stream_.cvOut(Kernel::Env) : 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct") stream_.cv(Kernel::Voct, value);
        else if (portId == "gate") stream_.cv(Kernel::Gate, value);
        else if (portId == "accent") stream_.cv(Kernel::AccentIn, value);
        else if (portId == "slide") stream_.cv(Kernel::SlideIn, value);
        else if (portId == "cutoff_cv") stream_.cv(Kernel::CutoffCv, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else return;
        if (controlId == "wave") stream_.control(Kernel::Wave, number);
        else if (controlId == "tune") stream_.control(Kernel::Tune, number);
        else if (controlId == "cutoff") stream_.control(Kernel::Cutoff, number);
        else if (controlId == "res") stream_.control(Kernel::Resonance, number);
        else if (controlId == "envmod") stream_.control(Kernel::EnvMod, number);
        else if (controlId == "decay") stream_.control(Kernel::Decay, number);
        else if (controlId == "accent") stream_.control(Kernel::Accent, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<AcidModule>(id);
        });
    }

private:
    mutable KernelStream<Kernel, 0, 1> stream_;
};

}  // namespace mmb_link
