#pragma once
/**
 * @file DiffuseurModule.h
 * @brief De luidsprekers van de Ondes Martenot (typeId `tp_mmb_diffuseur`):
 *        Principal, Palme (twaalf meetrillende snaren) en Métallique (gong als
 *        membraan). Mono in, mono uit.
 *
 * mmb_dsp::Diffuseur, dezelfde header als de browser
 * (`tools/mmb-wasm/diffuseur_wasm.cc`). Na de stemmen (één kast voor alle
 * stemmen), en ook achter iets anders. De snaren zijn ~36 KB in de module.
 *
 * | Richting | Poort    | Soort | Betekenis                     |
 * |----------|----------|-------|-------------------------------|
 * | in       | `in`     | Audio | Signaal                       |
 * | in       | `mix_cv` | Cv    | Telt op bij `mix`, −1..+1     |
 * | out      | `out`    | Audio | Door de luidspreker           |
 *
 * Controls: type (0 Principal, 1 Palme, 2 Métallique), mix, tune (halve
 * tonen, de snaren van de palme), ring (naklinken), gong (Hz), level.
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/diffuseur.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class DiffuseurModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_diffuseur";
    using Kernel = mmb_dsp::Diffuseur;
    explicit DiffuseurModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") return {&stream_, 0, true};
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in") return {&stream_, 0, true};
        return {};
    }
    PortKind outputPortKind(std::string_view portId) const override {
        return portId == "out" ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in") return PortKind::Audio;
        if (portId == "mix_cv") return PortKind::Cv;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "mix_cv") stream_.cv(Kernel::MixCv, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else return;
        if (controlId == "type") stream_.control(Kernel::Type, number);
        else if (controlId == "mix") stream_.control(Kernel::Mix, number);
        else if (controlId == "tune") stream_.control(Kernel::Tune, number);
        else if (controlId == "ring") stream_.control(Kernel::Ring, number);
        else if (controlId == "gong") stream_.control(Kernel::Gong, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<DiffuseurModule>(id);
        });
    }

private:
    mutable KernelStream<Kernel, 1, 1> stream_;
};

}  // namespace mmb_link
