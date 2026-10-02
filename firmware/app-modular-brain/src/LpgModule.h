#pragma once
/**
 * @file LpgModule.h
 * @brief Low-pass gate met vactrol-gedrag (typeId `tp_mmb_lpg`), mono.
 *
 * mmb_dsp::Lpg: een vactrol-toestand (vlug op, traag en steeds trager terug)
 * stuurt een tweepolig filter en/of een versterker. `trig` flitst het
 * lampje: een "ping" die zonder envelope al een natuurlijke tik geeft.
 * Dezelfde header als de browser (`tools/mmb-wasm/lpg_wasm.cc`).
 *
 * Poorten: in (audio), cv (CV 0..1, telt op bij `offset`), trig (gate) →
 * out (audio), env (CV: de vactrol-toestand 0..1).
 * Controls: offset (0..1), decay (0,02..4 s), mode (0 LP, 1 Both, 2 VCA),
 * res (0..1), level.
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/lpg.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class LpgModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_lpg";
    using Kernel = mmb_dsp::Lpg;
    explicit LpgModule(std::string_view id) : AudioModule(kTypeId, id) {}

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
        if (portId == "cv") return PortKind::Cv;
        if (portId == "trig") return PortKind::Gate;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        return portId == "env" ? stream_.cvOut(Kernel::Env) : 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "cv") stream_.cv(Kernel::LevelCv, value);
        else if (portId == "trig") stream_.cv(Kernel::Trig, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else return;
        if (controlId == "offset") stream_.control(Kernel::Offset, number);
        else if (controlId == "decay") stream_.control(Kernel::Decay, number);
        else if (controlId == "mode") stream_.control(Kernel::Mode, number);
        else if (controlId == "res") stream_.control(Kernel::Resonance, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<LpgModule>(id);
        });
    }

private:
    mutable KernelStream<Kernel, 1, 1> stream_;
};

}  // namespace mmb_link
