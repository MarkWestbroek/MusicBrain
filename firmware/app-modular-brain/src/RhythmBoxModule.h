#pragma once
/**
 * @file RhythmBoxModule.h
 * @brief Ritmebox met de presets van de CR-78 (typeId `tp_mmb_rhythm`),
 *        stereo uit.
 *
 * mmb_dsp::RhythmBox: elf berekende CR-78-stemmen en een patroontabel met
 * per ritme een A- en een B-maat (overgenomen uit de CR-78 Service Notes).
 * Variatie A, B of A+B om en om; start/stop met de Run-knop of een puls op
 * Start; klok intern (Tempo) of extern, een puls per tel. Dezelfde header als
 * de browser (`tools/mmb-wasm/rhythm_wasm.cc`).
 *
 * Port map:
 * | Dir | portId  | Kind  | Betekenis                                    |
 * |-----|---------|-------|----------------------------------------------|
 * | in  | `start` | Gate  | Elke puls: start of stop                     |
 * | in  | `clock` | Gate  | Externe tel (met `extclock`)                 |
 * | in  | `reset` | Gate  | Terug naar het begin van maat A              |
 * | out | `out_l`, `out_r` | Audio | De ritmebox                         |
 * | out | `step`  | Gate  | 10 ms bij elke stap                          |
 * | out | `bar`   | Gate  | 10 ms op de één                              |
 * | out | `acc`   | Gate  | 10 ms op een stap met accent                 |
 *
 * Controls: rhythm (patroonnummer), variation (0 A, 1 B, 2 A+B), tempo (bpm),
 * run, extclock (toggles), accent, bass, snare, metal, perc, level (0..1).
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/rhythm_box.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class RhythmBoxModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_rhythm";
    using Kernel = mmb_dsp::RhythmBox;
    explicit RhythmBoxModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out_l") return {&stream_, 0, true};
        if (portId == "out_r") return {&stream_, 1, true};
        return {};
    }
    AudioPort inputPort(std::string_view) const override { return {}; }
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "out_l" || portId == "out_r") return PortKind::Audio;
        if (portId == "step" || portId == "bar" || portId == "acc") return PortKind::Gate;
        return PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "start" || portId == "clock" || portId == "reset") return PortKind::Gate;
        return PortKind::None;
    }
    float readCvPort(std::string_view portId) const override {
        if (portId == "step") return stream_.cvOut(Kernel::StepOut);
        if (portId == "bar") return stream_.cvOut(Kernel::BarOut);
        if (portId == "acc") return stream_.cvOut(Kernel::AccentOut);
        return 0.0f;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "start") stream_.cv(Kernel::StartIn, value);
        else if (portId == "clock") stream_.cv(Kernel::ClockIn, value);
        else if (portId == "reset") stream_.cv(Kernel::ResetIn, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else if (const auto* b = std::get_if<bool>(&value)) number = *b ? 1.0f : 0.0f;
        else return;
        if (controlId == "rhythm") stream_.control(Kernel::Rhythm, number);
        else if (controlId == "variation") stream_.control(Kernel::Variation, number);
        else if (controlId == "tempo") stream_.control(Kernel::Tempo, number);
        else if (controlId == "run") stream_.control(Kernel::Run, number);
        else if (controlId == "extclock") stream_.control(Kernel::ExtClock, number);
        else if (controlId == "accent") stream_.control(Kernel::Accent, number);
        else if (controlId == "bass") stream_.control(Kernel::Bass, number);
        else if (controlId == "snare") stream_.control(Kernel::Snare, number);
        else if (controlId == "metal") stream_.control(Kernel::Metal, number);
        else if (controlId == "perc") stream_.control(Kernel::Perc, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<RhythmBoxModule>(id);
        });
    }

private:
    mutable KernelStream<Kernel, 0, 2> stream_;
};

}  // namespace mmb_link
