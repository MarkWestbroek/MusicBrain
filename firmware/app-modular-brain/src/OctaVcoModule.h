#pragma once
/**
 * @file OctaVcoModule.h
 * @brief Octa-oscillator VCO module (typeId `tp_mmb_octa_vco`): eight
 *        `AudioSynthWaveform` cells sharing one control set (FW-PM-1).
 *
 * @details
 * The firmware counterpart of the editor's shared-controls multi-module
 * (`mmbQuadVcoShared`, but with eight cells).  One module instance owns eight
 * independent oscillators; the patch-expand layer wires one V/Oct CV in and
 * one audio out per cell, while a single set of controls (wave/coarse/fine/
 * level/detune) applies to all eight at once — mirroring the planned hardware
 * dCV-module with per-voice jacks but one set of global knobs.
 *
 * This is the lever for the "how many voices can the Teensy sustain" test:
 * one octa-osc drives a full 8-voice patch from a single module.
 *
 * Port map (N = 1 … 8):
 * | Direction | portId    | Domain | Stream / channel        |
 * |-----------|-----------|--------|-------------------------|
 * | input     | `voct_N`  | Cv     | retunes cell N          |
 * | input     | `tune`    | Cv     | shared bend/detune (all)|
 * | output    | `out_N`   | Audio  | `osc_[N-1]`, channel 0  |
 *
 * Controls (shared across all eight cells):
 * | controlId | type    | effect                                       |
 * |-----------|---------|----------------------------------------------|
 * | `wave`    | int32_t | 0=Sin, 1=Tri, 2=Saw (default), 3=Sqr        |
 * | `coarse`  | float   | Semitone offset (−36 … +36)                  |
 * | `fine`    | float   | Cent offset (−100 … +100)                    |
 * | `level`   | float   | Output amplitude (0 … 1) per cell            |
 * | `detune`  | float   | Symmetric detune spread across the 8 (cents) |
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <array>
#include <cmath>
#include <cstdint>
#include <string_view>

namespace mmb_link {

/** @brief Eight-voice oscillator bank with one shared control set. */
class OctaVcoModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_octa_vco";
    static constexpr int          kCells  = 8;

    explicit OctaVcoModule(std::string_view id)
        : AudioModule(kTypeId, id)
    {
        for (int i = 0; i < kCells; ++i) {
            osc_[i].begin(WAVEFORM_SAWTOOTH);
            osc_[i].amplitude(0.8f);
            voct_[i] = 0.0f;
            recomputeHz(i);
        }
    }

    // --- Audio ports ----------------------------------------------------

    AudioPort outputPort(std::string_view portId) const override {
        const int idx = cellIndex(portId, "out");
        if (idx >= 0)
            return { const_cast<AudioSynthWaveform*>(&osc_[idx]), 0, true };
        return {};
    }

    AudioPort inputPort(std::string_view /*portId*/) const override {
        return {};  // voct_N / tune are CV-domain, never wired as audio
    }

    // --- Port-kind / CV-bridge -----------------------------------------

    PortKind outputPortKind(std::string_view portId) const override {
        return (cellIndex(portId, "out") >= 0) ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "tune")                return PortKind::Cv;
        if (cellIndex(portId, "voct") >= 0)  return PortKind::Cv;
        return PortKind::None;
    }
    /** @brief CV bridge entry: `voct_N` retunes cell N, `tune` shifts all. */
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "tune") {
            tune_ = value;
            for (int i = 0; i < kCells; ++i) recomputeHz(i);
            return;
        }
        const int idx = cellIndex(portId, "voct");
        if (idx >= 0) {
            voct_[idx] = value;
            recomputeHz(idx);
        }
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>   (&value)) return *f;
            if (auto* i = std::get_if<int32_t> (&value)) return static_cast<float>(*i);
            return fallback;
        };
        auto asInt = [&](int32_t fallback) -> int32_t {
            if (auto* i = std::get_if<int32_t>(&value)) return *i;
            if (auto* f = std::get_if<float>  (&value)) return static_cast<int32_t>(*f);
            return fallback;
        };

        if (controlId == "wave") {
            static constexpr short kWaves[] = {
                WAVEFORM_SINE, WAVEFORM_TRIANGLE, WAVEFORM_SAWTOOTH, WAVEFORM_SQUARE
            };
            const int32_t w = asInt(2);
            if (w >= 0 && w < 4)
                for (int i = 0; i < kCells; ++i) osc_[i].begin(kWaves[w]);
        } else if (controlId == "coarse") {
            coarse_ = asFloat(0.0f);
            for (int i = 0; i < kCells; ++i) recomputeHz(i);
        } else if (controlId == "fine") {
            fine_ = asFloat(0.0f);
            for (int i = 0; i < kCells; ++i) recomputeHz(i);
        } else if (controlId == "level") {
            const float a = asFloat(0.8f);
            for (int i = 0; i < kCells; ++i) osc_[i].amplitude(a);
        } else if (controlId == "detune") {
            detuneCents_ = asFloat(0.0f);
            for (int i = 0; i < kCells; ++i) recomputeHz(i);
        }
    }

    /** @brief Register the octa-osc factory.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<OctaVcoModule>(id);
            });
    }

private:
    /** @brief Parse a `<base>_N` port id (N = 1..8) → 0-based cell index, or −1. */
    static int cellIndex(std::string_view portId, std::string_view base) {
        if (portId.size() != base.size() + 2) return -1;   // "<base>_N"
        if (portId.compare(0, base.size(), base) != 0) return -1;
        if (portId[base.size()] != '_') return -1;
        const char c = portId[base.size() + 1];
        if (c < '1' || c > '8') return -1;
        return static_cast<int>(c - '1');
    }

    /** @brief Symmetric per-cell detune offset in cents.
     *  Cells fan out across [−0.5, +0.5] × detuneCents_ so cell 0 is flattest
     *  and cell 7 sharpest; the centre stays in tune.  Harmless in poly use
     *  (a few cents), fat when the cells share one note (unison). */
    float detuneOffsetCents(int i) const {
        const float pos = (static_cast<float>(i) / (kCells - 1)) - 0.5f;
        return pos * detuneCents_;
    }

    void recomputeHz(int i) {
        const float cents = fine_ + detuneOffsetCents(i);
        const float hz = 261.6256f
            * powf(2.0f, voct_[i] + tune_ + coarse_ / 12.0f + cents / 1200.0f);
        osc_[i].frequency(hz);
    }

    mutable std::array<AudioSynthWaveform, kCells> osc_;
    std::array<float, kCells> voct_{};   ///< Per-cell V/Oct value.
    float tune_        = 0.0f;           ///< Shared auxiliary V/Oct shift.
    float coarse_      = 0.0f;           ///< Shared semitone offset.
    float fine_        = 0.0f;           ///< Shared cent offset.
    float detuneCents_ = 0.0f;           ///< Symmetric detune spread (cents).
};

}  // namespace mmb_link
