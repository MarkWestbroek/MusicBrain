#pragma once
/**
 * @file SemModule.h
 * @brief SEM-filter: tweepolig state-variable met LP→notch→HP-morph (typeId `tp_mmb_sem`).
 *
 * mmb_dsp::Sem: 12 dB per octaaf, een milde resonantie die niet zelf zingt, en
 * een Mode-knop die traploos van laagdoorlaat via notch naar hoogdoorlaat
 * loopt; de bandpass heeft een eigen uitgang. Dezelfde header als de browser
 * (`tools/mmb-wasm/sem_wasm.cc`).
 *
 * Poorten: in (audio), cutoff_cv (CV, ±1 = ±`cv_amt` octaven), mode_cv (CV,
 * telt op bij `mode`) → out (LP/notch/HP), bp (bandpass).
 * Controls: cutoff (Hz), res (0..1), mode (0 LP .. 0,5 notch .. 1 HP), drive,
 * cv_amt (octaven), level.
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/sem.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class SemModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_sem";
    using Kernel = mmb_dsp::Sem;
    explicit SemModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") return {&stream_, 0, true};
        if (portId == "bp") return {&stream_, 1, true};
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in") return {&stream_, 0, true};
        return {};
    }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out" || portId == "bp") return PortKind::Audio;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in") return PortKind::Audio;
        if (portId == "cutoff_cv" || portId == "mode_cv") return PortKind::Cv;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "cutoff_cv") stream_.cv(Kernel::CutoffCv, value);
        else if (portId == "mode_cv") stream_.cv(Kernel::ModeCv, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else if (const auto* b = std::get_if<bool>(&value)) number = *b ? 1.0f : 0.0f;
        else return;
        if (controlId == "cutoff") stream_.control(Kernel::Cutoff, number);
        else if (controlId == "res") stream_.control(Kernel::Resonance, number);
        else if (controlId == "mode") stream_.control(Kernel::Mode, number);
        else if (controlId == "drive") stream_.control(Kernel::Drive, number);
        else if (controlId == "cv_amt") stream_.control(Kernel::CvAmount, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<SemModule>(id);
        });
    }

private:
    mutable KernelStream<Kernel, 1, 2> stream_;
};

}  // namespace mmb_link
