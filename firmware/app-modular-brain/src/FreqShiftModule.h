#pragma once
/**
 * @file FreqShiftModule.h
 * @brief Frequency shifter naar Bode (typeId `tp_mmb_freqshift`), mono in.
 *
 * mmb_dsp::FreqShifter: enkelzijbandmodulatie met een Hilbert-paar van
 * all-passes. Elke frequentie schuift hetzelfde aantal hertz op, dus de
 * boventonen raken uit hun hele verhouding. `out` is de mix van droog en de
 * omhoog geschoven kant, `down` de andere zijband (alleen nat): samen links
 * en rechts geven ze een breed stereobeeld. Dezelfde header als de browser
 * (`tools/mmb-wasm/freqshift_wasm.cc`).
 *
 * Poorten: in (audio), shift_cv (CV, telt op bij `shift`) → out, down.
 * Controls: shift (-1..1 maal het bereik), range (0 ±5, 1 ±50, 2 ±500,
 * 3 ±5000 Hz), fbk (0..0,95), mix, level.
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/freq_shifter.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class FreqShiftModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_freqshift";
    using Kernel = mmb_dsp::FreqShifter;
    explicit FreqShiftModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") return {&stream_, 0, true};
        if (portId == "down") return {&stream_, 1, true};
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in") return {&stream_, 0, true};
        return {};
    }
    PortKind outputPortKind(std::string_view portId) const override {
        return portId == "out" || portId == "down" ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in") return PortKind::Audio;
        if (portId == "shift_cv") return PortKind::Cv;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "shift_cv") stream_.cv(Kernel::ShiftCv, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else return;
        if (controlId == "shift") stream_.control(Kernel::Shift, number);
        else if (controlId == "range") stream_.control(Kernel::Range, number);
        else if (controlId == "fbk") stream_.control(Kernel::Feedback, number);
        else if (controlId == "mix") stream_.control(Kernel::Mix, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<FreqShiftModule>(id);
        });
    }

private:
    mutable KernelStream<Kernel, 1, 2> stream_;
};

}  // namespace mmb_link
