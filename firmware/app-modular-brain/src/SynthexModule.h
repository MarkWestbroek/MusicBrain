#pragma once
/**
 * @file SynthexModule.h
 * @brief Polyfone stem naar de Elka Synthex (typeId `tp_mmb_synthex`),
 *        acht stem-cellen, stereo uit.
 *
 * mmb_dsp::Synthex, naar het schema van de Synthex: twee digitale
 * oscillatoren per stem (ramp/square/pulse, voetmaat, transpose, detune,
 * sync, ring), ruis, 4-bit menger, het vierpolige OTA-multimodefilter
 * (LP/BP/HP), twee ADSR's, LFO met routing, glide en chorus. Dezelfde header
 * als de browser (`tools/mmb-wasm/synthex_wasm.cc`).
 *
 * Multi-module zoals het orgel: cellen `voct_k`/`gate_k` (k = 1..8) die
 * MIDI-in over een PolyGroup verdeelt; die staan in OVERRIDES van
 * tools/contract_dump.py. `bend` (V/Oct) en `joy` (−1..1) zijn de joystick.
 */

#include "AudioModule.h"
#include "KernelStream.h"
#include "mb/runtime/Registry.h"
#include "mmb_dsp/synthex.h"
#include <memory>
#include <string_view>

namespace mmb_link {

class SynthexModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_synthex";
    using Kernel = mmb_dsp::Synthex;
    explicit SynthexModule(std::string_view id) : AudioModule(kTypeId, id) {}

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
        if (portId == "bend" || portId == "joy" || cellOf(portId, "voct_") >= 0) return PortKind::Cv;
        if (cellOf(portId, "gate_") >= 0) return PortKind::Gate;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "bend") { stream_.cv(Kernel::kBend, value); return; }
        if (portId == "joy") { stream_.cv(Kernel::kJoyY, value); return; }
        int cell = cellOf(portId, "voct_");
        if (cell >= 0) { stream_.cv(cell, value); return; }
        cell = cellOf(portId, "gate_");
        if (cell >= 0) stream_.cv(Kernel::kGateBase + cell, value);
    }
    void setControl(std::string_view controlId, mb::runtime::ControlValue value) override {
        float number;
        if (const auto* fl = std::get_if<float>(&value)) number = *fl;
        else if (const auto* i = std::get_if<std::int32_t>(&value)) number = static_cast<float>(*i);
        else if (const auto* b = std::get_if<bool>(&value)) number = *b ? 1.0f : 0.0f;
        else return;
        if (controlId == "o1_oct") stream_.control(Kernel::O1Octave, number);
        else if (controlId == "o1_wave") stream_.control(Kernel::O1Wave, number);
        else if (controlId == "o1_level") stream_.control(Kernel::O1Level, number);
        else if (controlId == "o2_oct") stream_.control(Kernel::O2Octave, number);
        else if (controlId == "o2_transpose") stream_.control(Kernel::O2Transpose, number);
        else if (controlId == "o2_detune") stream_.control(Kernel::O2Detune, number);
        else if (controlId == "o2_wave") stream_.control(Kernel::O2Wave, number);
        else if (controlId == "o2_level") stream_.control(Kernel::O2Level, number);
        else if (controlId == "sync") stream_.control(Kernel::Sync, number);
        else if (controlId == "ring") stream_.control(Kernel::Ring, number);
        else if (controlId == "pw") stream_.control(Kernel::Pw, number);
        else if (controlId == "noise") stream_.control(Kernel::Noise, number);
        else if (controlId == "freq") stream_.control(Kernel::Freq, number);
        else if (controlId == "res") stream_.control(Kernel::Res, number);
        else if (controlId == "env_amt") stream_.control(Kernel::EnvAmt, number);
        else if (controlId == "kbd") stream_.control(Kernel::Kbd, number);
        else if (controlId == "mode") stream_.control(Kernel::Mode, number);
        else if (controlId == "fa") stream_.control(Kernel::FA, number);
        else if (controlId == "fd") stream_.control(Kernel::FD, number);
        else if (controlId == "fs") stream_.control(Kernel::FS, number);
        else if (controlId == "fr") stream_.control(Kernel::FR, number);
        else if (controlId == "aa") stream_.control(Kernel::AA, number);
        else if (controlId == "ad") stream_.control(Kernel::AD, number);
        else if (controlId == "as") stream_.control(Kernel::AS, number);
        else if (controlId == "ar") stream_.control(Kernel::AR, number);
        else if (controlId == "lfo_rate") stream_.control(Kernel::LfoRate, number);
        else if (controlId == "lfo_wave") stream_.control(Kernel::LfoWave, number);
        else if (controlId == "lfo_osc") stream_.control(Kernel::LfoOsc, number);
        else if (controlId == "lfo_pw") stream_.control(Kernel::LfoPw, number);
        else if (controlId == "lfo_vcf") stream_.control(Kernel::LfoVcf, number);
        else if (controlId == "lfo_vca") stream_.control(Kernel::LfoVca, number);
        else if (controlId == "glide") stream_.control(Kernel::Glide, number);
        else if (controlId == "tune") stream_.control(Kernel::Tune, number);
        else if (controlId == "chorus") stream_.control(Kernel::Chorus, number);
        else if (controlId == "level") stream_.control(Kernel::Level, number);
    }
    void onRetire() override { stream_.active(false); }
    void onReuse() override { stream_.active(true); }
    static void registerFactory() {
        auto& registry = mb::runtime::Registry::global();
        if (registry.has(kTypeId)) return;
        registry.register_(kTypeId, [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
            return std::make_unique<SynthexModule>(id);
        });
    }

private:
    /** `voct_7` met prefix `voct_` geeft 6; geen cel-poort geeft -1. */
    static int cellOf(std::string_view portId, std::string_view prefix) {
        if (portId.size() != prefix.size() + 1 || portId.substr(0, prefix.size()) != prefix) return -1;
        const int k = portId[prefix.size()] - '1';
        return k >= 0 && k < Kernel::kVoices ? k : -1;
    }

    mutable KernelStream<Kernel, 0, 2> stream_;
};

}  // namespace mmb_link
