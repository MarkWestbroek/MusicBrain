#pragma once
/**
 * @file EPianoModule.h
 * @brief Elektrische piano: tine of reed voor een pickup (typeId
 *        `tp_mmb_epiano`), twaalf stem-cellen, stereo uit.
 *
 * mmb_dsp::EPiano: per toets een grondtoon en een snel uitstervende
 * niet-harmonische "bel", gezien door een magnetische pickup (type Tine,
 * Rhodes-familie) of een condensatorplaat (type Reed, Wurlitzer-familie).
 * `timbre` is de plek van de tine voor de pickup. Stereo-tremolo zoals het
 * koffermodel. Dezelfde header als de browser
 * (`tools/mmb-wasm/epiano_wasm.cc`).
 *
 * Multi-module zoals de sampler: stem-cellen `voct_k`/`gate_k`/`vel_k`
 * (k = 1..12) die MIDI-in over een PolyGroup verdeelt. De cel-poorten worden
 * op hun nummer geparsed (cellOf) en staan daarom in OVERRIDES van
 * tools/contract_dump.py.
 *
 * Poorten: voct_1..12 (CV), gate_1..12 (gate), vel_1..12 (CV 0..1; los = een
 * gemiddelde aanslag), sustain (gate: het sustainpedaal) → out_l, out_r.
 * Controls: type (0 Tine, 1 Reed), timbre, bell, decay, drive, tremolo
 * (0..1), trem_rate (Hz), level, damper (0 = geen dempers .. 1 = snel).
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/epiano.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class EPianoModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_epiano";
    using Kernel = mmb_dsp::EPiano;
    explicit EPianoModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out_l") return {&stream_, 0, true};
        if (portId == "out_r") return {&stream_, 1, true};
        return {};
    }
    AudioPort inputPort(std::string_view) const override { return {}; }
    PortKind outputPortKind(std::string_view portId) const override {
        return portId == "out_l" || portId == "out_r" ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (cellOf(portId, "voct_") >= 0 || cellOf(portId, "vel_") >= 0) return PortKind::Cv;
        if (cellOf(portId, "gate_") >= 0 || portId == "sustain") return PortKind::Gate;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "sustain") { stream_.cv(Kernel::kSustain, value); return; }
        int cell = cellOf(portId, "voct_");
        if (cell >= 0) { stream_.cv(cell, value); return; }
        cell = cellOf(portId, "vel_");
        if (cell >= 0) { stream_.cv(Kernel::kVelBase + cell, value); return; }
        cell = cellOf(portId, "gate_");
        if (cell >= 0) stream_.cv(Kernel::kGateBase + cell, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else if (const auto* b = std::get_if<bool>(&value)) number = *b ? 1.0f : 0.0f;
        else return;
        if (controlId == "type") stream_.control(Kernel::Type, number);
        else if (controlId == "timbre") stream_.control(Kernel::Timbre, number);
        else if (controlId == "bell") stream_.control(Kernel::Bell, number);
        else if (controlId == "decay") stream_.control(Kernel::Decay, number);
        else if (controlId == "drive") stream_.control(Kernel::Drive, number);
        else if (controlId == "tremolo") stream_.control(Kernel::Tremolo, number);
        else if (controlId == "trem_rate") stream_.control(Kernel::TremRate, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
        else if (controlId == "damper") stream_.control(Kernel::Damper, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<EPianoModule>(id);
        });
    }

private:
    /** `voct_7` met prefix `voct_` geeft 6; geen cel-poort geeft -1. */
    static int cellOf(std::string_view portId, std::string_view prefix) {
        if (portId.size() <= prefix.size() || portId.substr(0, prefix.size()) != prefix) return -1;
        int number = 0;
        for (char c : portId.substr(prefix.size())) {
            if (c < '0' || c > '9') return -1;
            number = number * 10 + (c - '0');
        }
        return number >= 1 && number <= Kernel::kVoices ? number - 1 : -1;
    }

    mutable KernelStream<Kernel, 0, 2> stream_;
};

}  // namespace mmb_link
