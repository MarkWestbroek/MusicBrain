#pragma once
/**
 * @file FmVcoModule.h
 * @brief FM oscillator (typeId `tp_mmb_fm_vco`, FW-AU-4): wraps
 *        `AudioSynthWaveformModulated`.
 *
 * @details
 * A through-zero-ish frequency-modulated oscillator.  The carrier pitch comes
 * from a V/Oct CV (same convention as the plain VCO); a separate **audio**
 * input (`fm`) is the modulator and its depth in octaves is set by `fm_amt`.
 * Patch a second oscillator (or an LFO-rate VCO) into `fm` for classic
 * 2-operator FM / bell / metallic timbres.
 *
 * Port map:
 * | Direction | portId | Domain | Stream / channel               |
 * |-----------|--------|--------|--------------------------------|
 * | input     | `fm`   | Audio  | `osc_`, channel 0 (mod input)  |
 * | input     | `voct` | Cv     | carrier pitch (V/Oct)          |
 * | input     | `tune` | Cv     | auxiliary V/Oct shift (bend)   |
 * | output    | `out`  | Audio  | `osc_`, channel 0              |
 *
 * `AudioSynthWaveformModulated` has a single audio input (the modulation
 * signal).  In FM mode (`frequencyModulation(octaves)`) the input shifts the
 * carrier frequency by ±`octaves` octaves at full-scale input.
 *
 * Controls:
 * | controlId | type    | effect                                 |
 * |-----------|---------|----------------------------------------|
 * | `wave`    | int32_t | 0=Sin (default), 1=Tri, 2=Saw, 3=Sqr   |
 * | `coarse`  | float   | Semitone offset (−36 … +36)            |
 * | `fine`    | float   | Cent offset (−100 … +100)              |
 * | `level`   | float   | Output amplitude (0 … 1)               |
 * | `fm_amt`  | float   | FM depth in octaves (0 … 8)            |
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <cstdint>
#include <string_view>

namespace mmb_link {

/** @brief Frequency-modulated oscillator backed by `AudioSynthWaveformModulated`. */
class FmVcoModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_fm_vco";

    explicit FmVcoModule(std::string_view id)
        : AudioModule(kTypeId, id)
    {
        osc_.begin(WAVEFORM_SINE);
        osc_.amplitude(0.8f);
        osc_.frequencyModulation(fmOctaves_);
        recomputeHz();
    }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out")
            return { const_cast<AudioSynthWaveformModulated*>(&osc_), 0, true };
        return {};
    }
    /** @brief `fm` is the audio modulation input (channel 0). */
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "fm")
            return { const_cast<AudioSynthWaveformModulated*>(&osc_), 0, true };
        return {};
    }

    // --- Port-kind / CV-bridge -----------------------------------------

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out") ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "fm")                   return PortKind::Audio;
        if (portId == "voct" || portId == "tune") return PortKind::Cv;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if      (portId == "voct") { voct_ = value; recomputeHz(); }
        else if (portId == "tune") { tune_ = value; recomputeHz(); }
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
            const int32_t w = asInt(0);
            if (w >= 0 && w < 4) osc_.begin(kWaves[w]);
        } else if (controlId == "coarse") {
            coarse_ = asFloat(0.0f); recomputeHz();
        } else if (controlId == "fine") {
            fine_ = asFloat(0.0f); recomputeHz();
        } else if (controlId == "level") {
            osc_.amplitude(asFloat(0.8f));
        } else if (controlId == "fm_amt") {
            fmOctaves_ = asFloat(1.0f);
            osc_.frequencyModulation(fmOctaves_);
        }
    }

    /** @brief Register the FM-VCO factory.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<FmVcoModule>(id);
            });
    }

private:
    void recomputeHz() {
        const float hz = 261.6256f
            * powf(2.0f, voct_ + tune_ + coarse_ / 12.0f + fine_ / 1200.0f);
        osc_.frequency(hz);
    }

    mutable AudioSynthWaveformModulated osc_;
    float voct_      = 0.0f;
    float tune_      = 0.0f;
    float coarse_    = 0.0f;
    float fine_      = 0.0f;
    float fmOctaves_ = 1.0f;   ///< FM depth in octaves.
};

}  // namespace mmb_link
