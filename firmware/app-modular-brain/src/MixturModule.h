#pragma once
/**
 * @file MixturModule.h
 * @brief Trautonium-stem: glimlamp, vier ondertoondelers, vaste formanten
 *        (typeId `tp_mmb_mixtur`), mono uit.
 *
 * mmb_dsp::Mixtur, dezelfde header als de browser
 * (`tools/mmb-wasm/mixtur_wasm.cc`). Eén stem; de twee manualen van het
 * instrument zijn twee modules of een PolyGroup ×2.
 *
 * | Richting | Poort       | Soort | Betekenis                               |
 * |----------|-------------|-------|-----------------------------------------|
 * | in       | `voct`      | Cv    | Toonhoogte (1 V/oct)                    |
 * | in       | `gate`      | Gate  | Contact (toets of draad)                |
 * | in       | `vel`       | Cv    | Aanslagsterkte 0..1 (bij dyn = Vel)     |
 * | in       | `press`     | Cv    | Druk 0..1, continu (bij dyn = Press)    |
 * | in       | `sub_cv`    | Cv    | Ondertonen samen, −1..+1 (pedaal)       |
 * | in       | `form_cv`   | Cv    | Glijden door de klinkerrij, 0..1        |
 * | out      | `out`       | Audio | Stem                                    |
 * | out      | `amp`       | Cv    | De dynamiek (0..1)                      |
 *
 * Controls: coarse, fine, curve, unrest, main, div1..div4 (1..24), sub1..sub4,
 * formant (0 uit, 1 A, 2 E, 3 I, 4 O, 5 U), fshift (semi), freso, fmix,
 * noise, dyn (0 Vel, 1 Press), attack (ms), release (ms), glide (ms), level.
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/mixtur.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class MixturModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_mixtur";
    using Kernel = mmb_dsp::Mixtur;
    explicit MixturModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") return {&stream_, 0, true};
        return {};
    }
    AudioPort inputPort(std::string_view) const override { return {}; }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out") return PortKind::Audio;
        if (portId == "amp") return PortKind::Cv;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "voct" || portId == "vel" || portId == "press" || portId == "sub_cv" || portId == "form_cv")
            return PortKind::Cv;
        if (portId == "gate") return PortKind::Gate;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        return portId == "amp" ? stream_.cvOut(Kernel::Amp) : 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct") stream_.cv(Kernel::Voct, value);
        else if (portId == "gate") stream_.cv(Kernel::Gate, value);
        else if (portId == "vel") stream_.cv(Kernel::Vel, value);
        else if (portId == "press") stream_.cv(Kernel::Press, value);
        else if (portId == "sub_cv") stream_.cv(Kernel::SubCv, value);
        else if (portId == "form_cv") stream_.cv(Kernel::FormCv, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else if (const auto* b = std::get_if<bool>(&value)) number = *b ? 1.0f : 0.0f;
        else return;
        if (controlId == "coarse") stream_.control(Kernel::Coarse, number);
        else if (controlId == "fine") stream_.control(Kernel::Fine, number);
        else if (controlId == "curve") stream_.control(Kernel::Curve, number);
        else if (controlId == "unrest") stream_.control(Kernel::Unrest, number);
        else if (controlId == "main") stream_.control(Kernel::Main, number);
        else if (controlId == "div1") stream_.control(Kernel::Div1, number);
        else if (controlId == "div2") stream_.control(Kernel::Div2, number);
        else if (controlId == "div3") stream_.control(Kernel::Div3, number);
        else if (controlId == "div4") stream_.control(Kernel::Div4, number);
        else if (controlId == "sub1") stream_.control(Kernel::Sub1, number);
        else if (controlId == "sub2") stream_.control(Kernel::Sub2, number);
        else if (controlId == "sub3") stream_.control(Kernel::Sub3, number);
        else if (controlId == "sub4") stream_.control(Kernel::Sub4, number);
        else if (controlId == "formant") stream_.control(Kernel::Formant, number);
        else if (controlId == "fshift") stream_.control(Kernel::FShift, number);
        else if (controlId == "freso") stream_.control(Kernel::FReso, number);
        else if (controlId == "fmix") stream_.control(Kernel::FMix, number);
        else if (controlId == "noise") stream_.control(Kernel::Noise, number);
        else if (controlId == "dyn") stream_.control(Kernel::Dyn, number);
        else if (controlId == "attack") stream_.control(Kernel::Attack, number);
        else if (controlId == "release") stream_.control(Kernel::Release, number);
        else if (controlId == "glide") stream_.control(Kernel::Glide, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<MixturModule>(id);
        });
    }

private:
    mutable KernelStream<Kernel, 0, 1> stream_;
};

}  // namespace mmb_link
