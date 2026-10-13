#pragma once
/**
 * @file HallModule.h
 * @brief HALL, grote galm in Lexicon-stijl (typeId `tp_mmb_hall`), stereo, fw 0.5.113.
 *
 * mmb_dsp::Hall (doc/plans/hall-reverb.md): vroege reflecties, vier
 * all-passes, een FDN van 8 gemoduleerde lijnen met demping in drie banden.
 * Dezelfde header als de browser (`tools/mmb-wasm/hall_wasm.cc`). De
 * buffers (~180 KB) haalt de kern van de heap; geparkeerd geeft hij ze terug.
 *
 * Poorten: in_l/in_r (in = L) → out_l/out_r (out = L); CV size, decay, mix
 * (ook `*_cv`, telt op bij de knop), gate freeze.
 * Controls: algo (0 Hall, 1 Room, 2 Chamber, 3 Random), size, decay (s),
 * predelay (ms), early, diffusion, hidamp, lomult, mod, width, mix, freeze_btn.
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/hall.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class HallModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_hall";
    using Kernel = mmb_dsp::Hall;
    explicit HallModule(std::string_view id) : AudioModule(kTypeId, id) {
        if (!stream_.kernel().hasMemory()) Serial.println("[hall] alloc FAILED — module blijft droog");
    }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out_l" || portId == "out") return {&stream_, 0, true};
        if (portId == "out_r") return {&stream_, 1, true};
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in_l" || portId == "in") return {&stream_, 0, true};
        if (portId == "in_r") return {&stream_, 1, true};
        return {};
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in_l" || portId == "in_r" || portId == "in") return PortKind::Audio;
        if (cvPortIs(portId, "size") || cvPortIs(portId, "decay") || cvPortIs(portId, "mix")) return PortKind::Cv;
        if (portId == "freeze") return PortKind::Gate;
        return PortKind::None;
    }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out_l" || portId == "out_r" || portId == "out") return PortKind::Audio;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if      (cvPortIs(portId, "size"))  stream_.cv(Kernel::SizeCv, value);
        else if (cvPortIs(portId, "decay")) stream_.cv(Kernel::DecayCv, value);
        else if (cvPortIs(portId, "mix"))   stream_.cv(Kernel::MixCv, value);
        else if (portId == "freeze")        stream_.cv(Kernel::FreezeGate, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else if (const auto* b = std::get_if<bool>(&value)) number = *b ? 1.0f : 0.0f;
        else return;
        if      (controlId == "algo")       stream_.control(Kernel::Algo, number);
        else if (controlId == "size")       stream_.control(Kernel::Size, number);
        else if (controlId == "decay")      stream_.control(Kernel::Decay, number);
        else if (controlId == "predelay")   stream_.control(Kernel::Predelay, number);
        else if (controlId == "early")      stream_.control(Kernel::Early, number);
        else if (controlId == "diffusion")  stream_.control(Kernel::Diffusion, number);
        else if (controlId == "hidamp")     stream_.control(Kernel::HiDamp, number);
        else if (controlId == "lomult")     stream_.control(Kernel::LoMult, number);
        else if (controlId == "mod")        stream_.control(Kernel::Mod, number);
        else if (controlId == "width")      stream_.control(Kernel::Width, number);
        else if (controlId == "mix")        stream_.control(Kernel::Mix, number);
        else if (controlId == "freeze_btn") stream_.control(Kernel::Freeze, number);
    }
    // FW-13: geparkeerd de ~180 KB teruggeven. De hoofdlus onderbreekt de
    // audio-interrupt niet; na active(false) roept update() Process niet meer
    // aan, dus vrijgeven en terughalen botsen niet met het audioblok.
    void onRetire() override { stream_.active(false); stream_.kernel().release(); }
    void onReuse() override {
        if (!stream_.kernel().acquire()) Serial.println("[hall] alloc FAILED bij hergebruik");
        stream_.active(true);
    }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<HallModule>(id);
        });
    }

private:
    mutable KernelStream<Kernel, 2, 2> stream_;
};

}  // namespace mmb_link
