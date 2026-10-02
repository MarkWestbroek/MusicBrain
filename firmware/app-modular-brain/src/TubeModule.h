#pragma once
/**
 * @file TubeModule.h
 * @brief Buizenoverdrive (typeId `tp_mmb_tube`): gitaarversterker of
 *        studio-buisvoorversterker, stereo.
 *
 * mmb_dsp::Tube: triodetrappen met roosterstroom en bias-verschuiving,
 * vier keer overbemonsterd. Amp-stand: twee trappen, toonstack (Fender /
 * Marshall / Vox), eindtrap met sag en presence, kastsimulatie. Studio-stand:
 * één trap en een uitgangstrafo. Dezelfde header als de browser
 * (`tools/mmb-wasm/tube_wasm.cc`).
 *
 * Poorten: in_l, in_r (audio; R los = mono naar beide), drive_cv (CV, telt
 * op bij Drive) → out_l, out_r.
 * Controls: mode (0 Studio, 1 Amp), drive, bias, bass, mid, treble, stack
 * (0 Fender, 1 Marshall, 2 Vox), presence, sag, cab (toggle), mix, level.
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/tube.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class TubeModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_tube";
    using Kernel = mmb_dsp::Tube;
    explicit TubeModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out_l") return {&stream_, 0, true};
        if (portId == "out_r") return {&stream_, 1, true};
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in_l") return {&stream_, 0, true};
        if (portId == "in_r") return {&stream_, 1, true};
        return {};
    }
    PortKind outputPortKind(std::string_view portId) const override {
        return portId == "out_l" || portId == "out_r" ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in_l" || portId == "in_r") return PortKind::Audio;
        if (portId == "drive_cv") return PortKind::Cv;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "drive_cv") stream_.cv(Kernel::DriveCv, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else if (const auto* b = std::get_if<bool>(&value)) number = *b ? 1.0f : 0.0f;
        else return;
        if (controlId == "mode") stream_.control(Kernel::Mode, number);
        else if (controlId == "drive") stream_.control(Kernel::Drive, number);
        else if (controlId == "bias") stream_.control(Kernel::Bias, number);
        else if (controlId == "bass") stream_.control(Kernel::Bass, number);
        else if (controlId == "mid") stream_.control(Kernel::Mid, number);
        else if (controlId == "treble") stream_.control(Kernel::Treble, number);
        else if (controlId == "stack") stream_.control(Kernel::Stack, number);
        else if (controlId == "presence") stream_.control(Kernel::Presence, number);
        else if (controlId == "sag") stream_.control(Kernel::Sag, number);
        else if (controlId == "cab") stream_.control(Kernel::Cab, number);
        else if (controlId == "mix") stream_.control(Kernel::Mix, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<TubeModule>(id);
        });
    }

private:
    mutable KernelStream<Kernel, 2, 2> stream_;
};

}  // namespace mmb_link
