#pragma once
/**
 * @file MartenotModule.h
 * @brief Ondes Martenot-stem (typeId `tp_mmb_martenot`): zuivere toon met de
 *        klankschakelaars van de tiroir, touche (druk = volume) en vibrato;
 *        mono uit.
 *
 * mmb_dsp::Martenot, dezelfde header als de browser
 * (`tools/mmb-wasm/martenot_wasm.cc`). De luidsprekers (Principal, Palme,
 * Métallique) zijn een eigen module erachter: DIFFUSEUR.
 *
 * | Richting | Poort    | Soort | Betekenis                                  |
 * |----------|----------|-------|--------------------------------------------|
 * | in       | `voct`   | Cv    | Toonhoogte (1 V/oct)                       |
 * | in       | `gate`   | Gate  | Toets                                      |
 * | in       | `vel`    | Cv    | Aanslag 0..1                               |
 * | in       | `press`  | Cv    | Druk 0..1: de touche (volume bij touche 1) |
 * | in       | `vib_cv` | Cv    | Meer vibrato (het modwiel), 0..1           |
 * | out      | `out`    | Audio | Stem                                       |
 * | out      | `amp`    | Cv    | Het volume (0..1)                          |
 *
 * Controls: coarse, fine, onde, creux, gambe, nasillard, octaviant, souffle
 * (0..1, te combineren), touche (0 klavier, 1 touche), attack (ms), release
 * (ms), glide (ms), vib (halve toon), vib_rate (Hz), bright, level.
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/martenot.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class MartenotModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_martenot";
    using Kernel = mmb_dsp::Martenot;
    explicit MartenotModule(std::string_view id) : AudioModule(kTypeId, id) {}

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
        if (portId == "voct" || portId == "vel" || portId == "press" || portId == "vib_cv") return PortKind::Cv;
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
        else if (portId == "vib_cv") stream_.cv(Kernel::VibCv, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else if (const auto* b = std::get_if<bool>(&value)) number = *b ? 1.0f : 0.0f;
        else return;
        if (controlId == "coarse") stream_.control(Kernel::Coarse, number);
        else if (controlId == "fine") stream_.control(Kernel::Fine, number);
        else if (controlId == "onde") stream_.control(Kernel::Onde, number);
        else if (controlId == "creux") stream_.control(Kernel::Creux, number);
        else if (controlId == "gambe") stream_.control(Kernel::Gambe, number);
        else if (controlId == "nasillard") stream_.control(Kernel::Nasillard, number);
        else if (controlId == "octaviant") stream_.control(Kernel::Octaviant, number);
        else if (controlId == "souffle") stream_.control(Kernel::Souffle, number);
        else if (controlId == "touche") stream_.control(Kernel::Touche, number);
        else if (controlId == "attack") stream_.control(Kernel::Attack, number);
        else if (controlId == "release") stream_.control(Kernel::Release, number);
        else if (controlId == "glide") stream_.control(Kernel::Glide, number);
        else if (controlId == "vib") stream_.control(Kernel::Vib, number);
        else if (controlId == "vib_rate") stream_.control(Kernel::VibRate, number);
        else if (controlId == "bright") stream_.control(Kernel::Bright, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<MartenotModule>(id);
        });
    }

private:
    mutable KernelStream<Kernel, 0, 1> stream_;
};

}  // namespace mmb_link
