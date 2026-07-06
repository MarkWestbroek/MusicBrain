#pragma once
/**
 * @file StringModule.h
 * @brief Plucked-string VCO (typeId `tp_mmb_string`): wraps the Teensy Audio
 *        library's `AudioSynthKarplusStrong` (FW-AU-8).
 *
 * @details
 * Karplus-Strong is the classic short-delay-line physical model of a plucked
 * string: an impulse (the "pluck") is fed into a delay line whose length sets
 * the pitch, with a low-pass feedback path that makes the harmonics decay at
 * different rates — giving a natural plucked/struck timbre.  It is triggered
 * by a `noteOn(frequency, velocity)`, so unlike the continuous `VcoModule`
 * this one needs a **gate**: each rising gate edge re-plucks the string at the
 * current pitch.
 *
 * Signal path: `ks_ -> level_ (AudioAmplifier) -> out`.  The amplifier gives a
 * post-pluck level/trim that the bare Karplus-Strong object lacks.
 *
 * Port map:
 * | Direction | portId | Domain | Stream / channel        |
 * |-----------|--------|--------|-------------------------|
 * | input     | `voct` | Cv     | sets pluck frequency    |
 * | input     | `gate` | Gate   | rising edge → re-pluck  |
 * | output    | `out`  | Audio  | `level_`, channel 0     |
 *
 * Controls:
 * | controlId | type  | effect                                 |
 * |-----------|-------|----------------------------------------|
 * | `level`   | float | Output trim (0 … 1, default 0.8)       |
 * | `pluck`   | float | Pluck velocity / brightness (0 … 1)    |
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <string_view>

namespace mmb_link {

/** @brief Karplus-Strong plucked-string voice. */
class StringModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_string";

    explicit StringModule(std::string_view id)
        : AudioModule(kTypeId, id)
    {
        level_.gain(0.8f);
    }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out")
            return { const_cast<AudioAmplifier*>(&level_), 0, true };
        return {};
    }

    AudioPort inputPort(std::string_view /*portId*/) const override {
        return {};  // voct / gate are CV-domain
    }

    // --- Port-kind / CV-bridge -----------------------------------------

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out") ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "voct") return PortKind::Cv;
        if (portId == "gate") return PortKind::Gate;
        // cvPortIs: accepteert ook de editor-aliassen pluck_cv/level_cv.
        if (cvPortIs(portId, "pluck") || cvPortIs(portId, "level")) return PortKind::Cv;
        return PortKind::None;
    }
    /** @brief CV bridge entry: `voct` sets the pluck pitch, `gate` re-plucks
     *  the string on a rising edge (0 → 1), `pluck`/`level` modulate the
     *  brightness and output gain. */
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct") {
            voct_ = value;
        } else if (portId == "gate") {
            const bool high = value >= 0.5f;
            if (high && !lastGateHigh_) {
                const float hz = 261.6256f * powf(2.0f, voct_);
                ks_.noteOn(hz, pluck_);
            }
            lastGateHigh_ = high;
        } else if (cvPortIs(portId, "pluck")) {
            float p = value;
            if (p < 0.01f) p = 0.01f;
            if (p > 1.0f)  p = 1.0f;
            pluck_ = p;
        } else if (cvPortIs(portId, "level")) {
            float g = value;
            if (g < 0.0f) g = 0.0f;
            if (g > 1.0f) g = 1.0f;
            level_.gain(g);
        }
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>   (&value)) return *f;
            if (auto* i = std::get_if<int32_t> (&value)) return static_cast<float>(*i);
            return fallback;
        };
        if (controlId == "level") {
            level_.gain(asFloat(0.8f));
        } else if (controlId == "pluck") {
            // Karplus-Strong velocity also sets the initial brightness; clamp
            // to the (0, 1] range the object expects (≤0 is treated as off).
            float p = asFloat(0.8f);
            if (p < 0.01f) p = 0.01f;
            if (p > 1.0f)  p = 1.0f;
            pluck_ = p;
        }
    }

    /** @brief Register the string factory.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<StringModule>(id);
            });
    }

private:
    mutable AudioSynthKarplusStrong ks_;
    mutable AudioAmplifier          level_;
    AudioConnection patch_{ ks_, 0, level_, 0 };

    float voct_         = 0.0f;   ///< Current pluck pitch (V/Oct).
    float pluck_        = 0.8f;   ///< Pluck velocity / brightness (0..1).
    bool  lastGateHigh_ = false;  ///< Edge detector for the gate input.
};

}  // namespace mmb_link
