#pragma once
/**
 * @file VcoModule.h
 * @brief VCO module (typeId `tp_mmb_vco`): wraps `AudioSynthWaveform`.
 *
 * @details
 * Port map:
 * | Direction | portId | AudioStream / channel   |
 * |-----------|--------|-------------------------|
 * | output    | `out`  | `osc_`, channel 0       |
 *
 * (Inputs `voct`, `fm`, `sync`, `tune` are CV-domain; not wired as AudioConnections.)
 *
 * Controls (via `setControl()`):
 * | controlId | type     | effect                                 |
 * |-----------|----------|----------------------------------------|
 * | `wave`    | int32_t  | 0=Sin, 1=Tri, 2=Saw (default), 3=Sqr  |
 * | `coarse`  | float    | Semitone offset (−36 … +36)            |
 * | `fine`    | float    | Cent offset (−100 … +100)              |
 * | `level`   | float    | Output amplitude (0 … 1)               |
 * | `fm_amt`  | float    | FM depth — stored, not yet applied     |
 *
 * **Pitch update:** call `updatePitch(volts)` from the CV bridge whenever
 * the upstream V/Oct source changes value.  The voltage is shifted by the
 * coarse/fine offsets before being converted to Hz.
 */

#include "AudioPortModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <cstdint>
#include <string_view>

namespace mmb_link {

/** @brief Voltage-controlled oscillator backed by `AudioSynthWaveform`. */
class VcoModule final : public AudioPortModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_vco";

    explicit VcoModule(std::string_view id)
        : AudioPortModule(kTypeId, id)
    {
        osc_.begin(WAVEFORM_SAWTOOTH);
        osc_.amplitude(0.9f);
        osc_.frequency(261.626f);
    }

    /**
     * @brief Update oscillator pitch from a V/Oct voltage.
     *
     * Convention: 0 V = C4 = 261.626 Hz; each additional +1 V doubles the
     * frequency (one octave up).  The coarse and fine offset controls are
     * applied here before the Hz conversion.
     *
     * Call from inside an `AudioNoInterrupts()` block (or from the same
     * context as other audio parameter updates) to avoid tearing.
     *
     * @param volts  V/Oct value from the upstream CV source.
     */
    void updatePitch(float volts) {
        voct_ = volts;
        recomputeHz();
    }

    /**
     * @brief Update the auxiliary tune voltage (pitch-bend / detune input).
     *
     * Summed with the main V/Oct value before the Hz conversion, so a
     * `cv_bend` (or any modulation source) patched to `tune` shifts the
     * pitch without overwriting the note's V/Oct. 0 V = no shift.
     */
    void updateTune(float volts) {
        tune_ = volts;
        recomputeHz();
    }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out")
            return { const_cast<AudioSynthWaveform*>(&osc_), 0, true };
        return {};
    }

    AudioPort inputPort(std::string_view /*portId*/) const override {
        return {};  // VCO has no audio inputs (voct/fm/sync are CV-domain)
    }

    // --- Port-kind / CV-bridge -----------------------------------------

    /** @brief `out` is the only audio port; `voct` / `fm` / `sync` are CV. */
    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out") ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "voct" || portId == "fm" || portId == "tune") return PortKind::Cv;
        if (portId == "sync")                     return PortKind::Gate;
        return PortKind::None;
    }
    /** @brief CV bridge entry point.  `voct` retunes the oscillator; `tune`
     *  adds an auxiliary V/Oct shift (pitch-bend / detune). */
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct")      updatePitch(value);
        else if (portId == "tune") updateTune(value);
        // fm / sync: not yet implemented
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
            if (w >= 0 && w < 4) osc_.begin(kWaves[w]);
        } else if (controlId == "coarse") {
            coarse_ = asFloat(0.0f);
        } else if (controlId == "fine") {
            fine_ = asFloat(0.0f);
        } else if (controlId == "level") {
            osc_.amplitude(asFloat(0.8f));
        }
        // fm_amt: stored for future FM routing — not yet applied
    }

    /** @brief Register the VCO factory with the global Registry.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<VcoModule>(id);
            });
    }

private:
    void recomputeHz() {
        const float hz = 261.6256f
            * powf(2.0f, voct_ + tune_ + coarse_ / 12.0f + fine_ / 1200.0f);
        osc_.frequency(hz);
    }

    mutable AudioSynthWaveform osc_;
    float voct_   = 0.0f;   ///< Main V/Oct value (note pitch)
    float tune_   = 0.0f;   ///< Auxiliary V/Oct shift (bend/detune), summed in
    float coarse_ = 0.0f;   ///< Semitone offset, applied in recomputeHz()
    float fine_   = 0.0f;   ///< Cent offset, applied in recomputeHz()
};

}  // namespace mmb_link
