#pragma once
/**
 * @file WavefolderModule.h
 * @brief West Coast-wavefolder (typeId `tp_mmb_folder`), mono.
 *
 * mmb_dsp::Wavefolder: de ingang wordt versterkt (`fold`) en de toppen
 * vouwen terug. Drie vouwvormen (`type`: 0 Sine, 1 Tri, 2 de vijf cellen van
 * de Buchla 259), `symmetry` voor even boventonen, vier keer overbemonsterd.
 * Dezelfde header als de browser (`tools/mmb-wasm/folder_wasm.cc`).
 *
 * Poorten: in (audio), fold_cv + sym_cv (CV, tellen op bij de knop) → out.
 * Controls: fold (0..1), symmetry (-1..1), type (0..2), mix, level.
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/wavefolder.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class WavefolderModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_folder";
    using Kernel = mmb_dsp::Wavefolder;
    explicit WavefolderModule(std::string_view id) : AudioModule(kTypeId, id) {}

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
        if (portId == "fold_cv" || portId == "sym_cv") return PortKind::Cv;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "fold_cv") stream_.cv(Kernel::FoldCv, value);
        else if (portId == "sym_cv") stream_.cv(Kernel::SymCv, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else return;
        if (controlId == "fold") stream_.control(Kernel::Fold, number);
        else if (controlId == "symmetry") stream_.control(Kernel::Symmetry, number);
        else if (controlId == "type") stream_.control(Kernel::Type, number);
        else if (controlId == "mix") stream_.control(Kernel::Mix, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<WavefolderModule>(id);
        });
    }

private:
    mutable KernelStream<Kernel, 1, 1> stream_;
};

}  // namespace mmb_link
