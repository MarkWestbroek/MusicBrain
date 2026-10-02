#pragma once
/**
 * @file WahModule.h
 * @brief Wah en klinkerfilter met pedaal, auto-wah en LFO (typeId `tp_mmb_wah`).
 *
 * mmb_dsp::Wah: een resonantiepiek van 400 Hz tot 2,2 kHz (type Wah) of twee
 * formantpieken die van OE naar IE lopen (type Vowel). Het pedaal komt uit de
 * knop plus CV, uit een envelope-volger (auto-wah, op of neer) of uit een eigen
 * LFO. Dezelfde header als de browser (`tools/mmb-wasm/wah_wasm.cc`).
 *
 * Poorten: in (audio), pedal_cv (CV, telt op bij `pedal`) → out (audio), env
 * (CV: de envelope-volger).
 * Controls: pedal (0..1), mode (0 Pedal, 1 Auto op, 2 Auto neer, 3 LFO), type
 * (0 Wah, 1 Vowel), sens (0..1), rate (Hz), q (0..1), mix, level.
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/wah.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class WahModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_wah";
    using Kernel = mmb_dsp::Wah;
    explicit WahModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") return {&stream_, 0, true};
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in") return {&stream_, 0, true};
        return {};
    }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out") return PortKind::Audio;
        if (portId == "env") return PortKind::Cv;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in") return PortKind::Audio;
        if (portId == "pedal_cv") return PortKind::Cv;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        if (portId == "env") return stream_.cvOut(Kernel::Env);
        return 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "pedal_cv") stream_.cv(Kernel::PedalCv, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else if (const auto* b = std::get_if<bool>(&value)) number = *b ? 1.0f : 0.0f;
        else return;
        if (controlId == "pedal") stream_.control(Kernel::Pedal, number);
        else if (controlId == "mode") stream_.control(Kernel::Mode, number);
        else if (controlId == "type") stream_.control(Kernel::Type, number);
        else if (controlId == "sens") stream_.control(Kernel::Sens, number);
        else if (controlId == "rate") stream_.control(Kernel::Rate, number);
        else if (controlId == "q") stream_.control(Kernel::Q, number);
        else if (controlId == "mix") stream_.control(Kernel::Mix, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<WahModule>(id);
        });
    }

private:
    mutable KernelStream<Kernel, 1, 1> stream_;
};

}  // namespace mmb_link
