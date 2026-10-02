#pragma once
/**
 * @file OrganModule.h
 * @brief Tonewheel-orgel met trekstangen (typeId `tp_mmb_organ`), twaalf
 *        stem-cellen, mono uit.
 *
 * mmb_dsp::Tonewheel: 91 doorlopende toonwielen; een toets tapt er negen af
 * en de trekstangen bepalen hoeveel van elk. Foldback bovenin, key click,
 * percussie met één envelope voor het hele klavier, lek tussen wielen en
 * scanner-vibrato/chorus. De draaiende luidspreker hoort erachter:
 * `tp_mmb_rotary`. Dezelfde header als de browser
 * (`tools/mmb-wasm/organ_wasm.cc`).
 *
 * Multi-module zoals de SID: stem-cellen `voct_k`/`gate_k` (k = 1..12) die
 * MIDI-in over een PolyGroup verdeelt. De cel-poorten worden op hun nummer
 * geparsed (cellOf) en staan daarom in OVERRIDES van tools/contract_dump.py.
 *
 * Poorten: voct_1..12 (CV), gate_1..12 (gate), swell (CV, telt op bij
 * `level`: zwelpedaal) → out (audio).
 * Controls: d16, d513, d8, d4, d223, d2, d135, d113, d1 (trekstangen 0..8),
 * perc (0 uit, 1 = 2e, 2 = 3e harmonische), perc_fast, perc_soft (toggles),
 * vib (0 uit, 1..3 = V1..V3, 4..6 = C1..C3), click, leak, level.
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/tonewheel.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class OrganModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_organ";
    using Kernel = mmb_dsp::Tonewheel;
    explicit OrganModule(std::string_view id) : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out") return {&stream_, 0, true};
        return {};
    }
    AudioPort inputPort(std::string_view) const override { return {}; }
    PortKind outputPortKind(std::string_view portId) const override {
        return portId == "out" ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "swell") return PortKind::Cv;
        if (cellOf(portId, "voct_") >= 0) return PortKind::Cv;
        if (cellOf(portId, "gate_") >= 0) return PortKind::Gate;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "swell") { stream_.cv(Kernel::kSwell, value); return; }
        int cell = cellOf(portId, "voct_");
        if (cell >= 0) { stream_.cv(cell, value); return; }
        cell = cellOf(portId, "gate_");
        if (cell >= 0) stream_.cv(Kernel::kGateBase + cell, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* f = std::get_if<float>(&value)) number = *f;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else if (const auto* b = std::get_if<bool>(&value)) number = *b ? 1.0f : 0.0f;
        else return;
        if (controlId == "d16") stream_.control(Kernel::Bar16, number);
        else if (controlId == "d513") stream_.control(Kernel::Bar513, number);
        else if (controlId == "d8") stream_.control(Kernel::Bar8, number);
        else if (controlId == "d4") stream_.control(Kernel::Bar4, number);
        else if (controlId == "d223") stream_.control(Kernel::Bar223, number);
        else if (controlId == "d2") stream_.control(Kernel::Bar2, number);
        else if (controlId == "d135") stream_.control(Kernel::Bar135, number);
        else if (controlId == "d113") stream_.control(Kernel::Bar113, number);
        else if (controlId == "d1") stream_.control(Kernel::Bar1, number);
        else if (controlId == "perc") stream_.control(Kernel::Percussion, number);
        else if (controlId == "perc_fast") stream_.control(Kernel::PercFast, number);
        else if (controlId == "perc_soft") stream_.control(Kernel::PercSoft, number);
        else if (controlId == "vib") stream_.control(Kernel::Vibrato, number);
        else if (controlId == "click") stream_.control(Kernel::Click, number);
        else if (controlId == "leak") stream_.control(Kernel::Leak, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<OrganModule>(id);
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

    mutable KernelStream<Kernel, 0, 1> stream_;
};

}  // namespace mmb_link
