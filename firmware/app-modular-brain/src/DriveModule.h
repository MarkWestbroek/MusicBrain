#pragma once
/**
 * @file DriveModule.h
 * @brief Overdrive / distortion / fuzz (typeId `tp_mmb_drive`), mono.
 *
 * mmb_dsp::Drive: drie pedaalfamilies die verschillen in wat er vóór en ná
 * de clipper gefilterd wordt en hoe hard die knipt (`mode`: 0 overdrive met
 * mid-hump en schoon erbij, 1 distortion met harde dioden, 2 fuzz met twee
 * trappen en een scooped toonregeling). Vier keer overbemonsterd. Dezelfde
 * header als de browser (`tools/mmb-wasm/drive_wasm.cc`).
 *
 * Poorten: in (audio), drive_cv (CV, telt op bij `drive`) → out.
 * Controls: drive (0..1), tone (0..1), level (0..1), mode (0..2), mix.
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/drive.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class DriveModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_drive";
    using Kernel = mmb_dsp::Drive;
    explicit DriveModule(std::string_view id) : AudioModule(kTypeId, id) {}

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
        if (portId == "drive_cv") return PortKind::Cv;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "drive_cv") stream_.cv(Kernel::AmountCv, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else return;
        if (controlId == "drive") stream_.control(Kernel::Amount, number);
        else if (controlId == "tone") stream_.control(Kernel::Tone, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
        else if (controlId == "mode") stream_.control(Kernel::Mode, number);
        else if (controlId == "mix") stream_.control(Kernel::Mix, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<DriveModule>(id);
        });
    }

private:
    mutable KernelStream<Kernel, 1, 1> stream_;
};

}  // namespace mmb_link
