#pragma once
/**
 * @file EnsembleModule.h
 * @brief Ensemble: het driefasige chorus van de string machines (typeId `tp_mmb_ensemble`).
 *
 * mmb_dsp::Ensemble: één vertragingslijn met drie leeskoppen, gemoduleerd door
 * een trage en een snelle LFO die per kop een derde slag verschoven zijn.
 * Mono in (L+R), stereo uit. Dezelfde header als de browser
 * (`tools/mmb-wasm/ensemble_wasm.cc`).
 *
 * Poorten: in_l, in_r (audio), depth_cv (CV, telt op bij `depth`) → out_l,
 * out_r.
 * Controls: depth (0..1), slow (Hz), fast (Hz), tone (0..1), mix, level.
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/ensemble.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class EnsembleModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_ensemble";
    using Kernel = mmb_dsp::Ensemble;
    explicit EnsembleModule(std::string_view id) : AudioModule(kTypeId, id) {}

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
        if (portId == "out_l" || portId == "out_r") return PortKind::Audio;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in_l" || portId == "in_r") return PortKind::Audio;
        if (portId == "depth_cv") return PortKind::Cv;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "depth_cv") stream_.cv(Kernel::DepthCv, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else if (const auto* b = std::get_if<bool>(&value)) number = *b ? 1.0f : 0.0f;
        else return;
        if (controlId == "depth") stream_.control(Kernel::Depth, number);
        else if (controlId == "slow") stream_.control(Kernel::Slow, number);
        else if (controlId == "fast") stream_.control(Kernel::Fast, number);
        else if (controlId == "tone") stream_.control(Kernel::Tone, number);
        else if (controlId == "mix") stream_.control(Kernel::Mix, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<EnsembleModule>(id);
        });
    }

private:
    mutable KernelStream<Kernel, 2, 2> stream_;
};

}  // namespace mmb_link
