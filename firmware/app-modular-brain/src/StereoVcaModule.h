#pragma once
/**
 * @file StereoVcaModule.h
 * @brief Stereo VCA / panner (typeId `tp_mmb_stereo_vca`, FW-AU-1).
 *
 * @details
 * One audio input fans out to a left and a right output.  Two CV inputs set
 * the overall **volume** and the **pan** position via an equal-power pan law.
 *
 * Port map:
 * | Direction | portId | Domain | Stream / channel        |
 * |-----------|--------|--------|-------------------------|
 * | input     | `in`   | Audio  | `in_`, channel 0        |
 * | input     | `vol`  | Cv     | volume scalar (0 … 1)   |
 * | input     | `pan`  | Cv     | pan position (−1 … +1)  |
 * | output    | `l`    | Audio  | `ampL_`, channel 0      |
 * | output    | `r`    | Audio  | `ampR_`, channel 0      |
 *
 * **Pan CV convention (the "what is the centre" question).**
 * Pan is bipolar: **0 = centre**, −1 = hard left, +1 = hard right.  The CV
 * value is used directly as that −1 … +1 position (clamped), so a CV source
 * sitting at 0 V leaves the signal dead-centre — exactly what you want when
 * nothing is patched.  An LFO swinging ±1 sweeps the full stereo field; a
 * unipolar 0 … 1 source pans from centre to hard right.
 *
 * **Equal-power law.**  At centre both channels get a gain of 1/√2 (≈ 0.707)
 * so the perceived loudness stays constant while panning — no dip in the
 * middle.  `gainL = cos(θ)`, `gainR = sin(θ)` with `θ = (pan+1)·π/4`.
 *
 * Controls (used as the base value when the matching CV port is unpatched):
 * | controlId | type  | range    | default | effect                 |
 * |-----------|-------|----------|---------|------------------------|
 * | `vol`     | float | 0 … 1    | 0.8     | Base volume            |
 * | `pan`     | float | −1 … +1  | 0       | Base pan (0 = centre)  |
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <string_view>

namespace mmb_link {

/** @brief Stereo VCA with equal-power panning. */
class StereoVcaModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_stereo_vca";

    explicit StereoVcaModule(std::string_view id)
        : AudioModule(kTypeId, id)
    {
        in_.gain(1.0f);
        recompute();
    }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "l") return { const_cast<AudioAmplifier*>(&ampL_), 0, true };
        if (portId == "r") return { const_cast<AudioAmplifier*>(&ampR_), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in") return { const_cast<AudioAmplifier*>(&in_), 0, true };
        return {};
    }

    // --- Port-kind / CV-bridge -----------------------------------------

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "l" || portId == "r") ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in")                  return PortKind::Audio;
        if (portId == "vol" || portId == "pan") return PortKind::Cv;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if      (portId == "vol") { vol_ = clampf(value, 0.0f, 1.0f); recompute(); }
        else if (portId == "pan") { pan_ = clampf(value, -1.0f, 1.0f); recompute(); }
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>   (&value)) return *f;
            if (auto* i = std::get_if<int32_t> (&value)) return static_cast<float>(*i);
            return fallback;
        };
        if      (controlId == "vol") { vol_ = clampf(asFloat(0.8f), 0.0f, 1.0f); recompute(); }
        else if (controlId == "pan") { pan_ = clampf(asFloat(0.0f), -1.0f, 1.0f); recompute(); }
    }

    /** @brief Register the stereo-VCA factory.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<StereoVcaModule>(id);
            });
    }

private:
    static float clampf(float v, float lo, float hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }
    /** @brief Recompute the two channel gains from `vol_` and `pan_`. */
    void recompute() {
        const float theta = (pan_ + 1.0f) * (static_cast<float>(M_PI) * 0.25f);
        ampL_.gain(vol_ * cosf(theta));
        ampR_.gain(vol_ * sinf(theta));
    }

    mutable AudioAmplifier in_;     ///< Input fan-out stage (gain 1).
    mutable AudioAmplifier ampL_;   ///< Left channel VCA.
    mutable AudioAmplifier ampR_;   ///< Right channel VCA.
    AudioConnection patchL_{ in_, 0, ampL_, 0 };
    AudioConnection patchR_{ in_, 0, ampR_, 0 };

    float vol_ = 0.8f;  ///< Volume scalar (0 … 1).
    float pan_ = 0.0f;  ///< Pan position (−1 left … 0 centre … +1 right).
};

}  // namespace mmb_link
