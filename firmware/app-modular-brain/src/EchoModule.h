#pragma once
/**
 * @file EchoModule.h
 * @brief Feedback delay / echo (typeId `tp_mmb_echo`, FW-AU-2): built from
 *        `AudioEffectDelay` + two `AudioMixer4`s + a feedback amp.
 *
 * @details
 * Classic single-tap feedback delay.  The signal path is:
 *
 *     in ─┬───────────────────────────────► outMix.0 (dry)
 *         │                                    │
 *         └─► inMix.0 ─► delay ─┬─► fbAmp ─► inMix.1
 *                               └────────────► outMix.1 (wet)
 *
 * `time`, `feedback` and `mix` are all available as CV inputs so an LFO or
 * envelope can sweep the delay (tape-style pitch wobble), pump the feedback,
 * or duck the wet level.
 *
 * Port map:
 * | Direction | portId | Domain | Stream / channel    |
 * |-----------|--------|--------|---------------------|
 * | input     | `in`   | Audio  | `in_`, channel 0    |
 * | input     | `time` | Cv     | delay time (s)      |
 * | input     | `fbk`  | Cv     | feedback (0 … 0.95) |
 * | input     | `mix`  | Cv     | dry/wet (0 … 1)     |
 * | output    | `out`  | Audio  | `outMix_`, channel 0|
 *
 * **Memory note.** `AudioEffectDelay` allocates audio blocks proportional to
 * the requested delay (≈ 2.9 ms each).  Delay time is clamped to
 * `kMaxDelayMs` so a single echo cannot exhaust the global `AudioMemory()`
 * pool.  `time` CV is interpreted in **seconds** (matching the editor knob).
 *
 * Controls (used as the base value when the matching CV port is unpatched):
 * | controlId  | type  | range     | default | effect            |
 * |------------|-------|-----------|---------|-------------------|
 * | `time`     | float | 0.01 … 0.5 s | 0.30 | Delay time        |
 * | `feedback` | float | 0 … 0.95  | 0.45    | Feedback amount   |
 * | `mix`      | float | 0 … 1     | 0.35    | Dry/wet balance   |
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <string_view>

namespace mmb_link {

/** @brief Single-tap feedback delay. */
class EchoModule final : public AudioModule {
public:
    static constexpr const char* kTypeId   = "tp_mmb_echo";
    static constexpr float       kMaxDelayMs = 500.0f;  ///< Memory-safe ceiling.

    explicit EchoModule(std::string_view id)
        : AudioModule(kTypeId, id)
    {
        in_.gain(1.0f);
        delay_.delay(0, timeMs_);
        fbAmp_.gain(feedback_);
        applyMix();
    }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out")
            return { const_cast<AudioMixer4*>(&outMix_), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in")
            return { const_cast<AudioAmplifier*>(&in_), 0, true };
        return {};
    }

    // --- Port-kind / CV-bridge -----------------------------------------

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out") ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in")                                  return PortKind::Audio;
        // cvPortIs: accepteert ook de editor-aliassen time_cv/fbk_cv/mix_cv.
        if (cvPortIs(portId, "time") || cvPortIs(portId, "fbk") ||
            cvPortIs(portId, "mix"))                         return PortKind::Cv;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if      (cvPortIs(portId, "time")) setTimeSeconds(value);
        else if (cvPortIs(portId, "fbk"))  setFeedback(value);
        else if (cvPortIs(portId, "mix"))  setMix(value);
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>   (&value)) return *f;
            if (auto* i = std::get_if<int32_t> (&value)) return static_cast<float>(*i);
            return fallback;
        };
        if      (controlId == "time")     setTimeSeconds(asFloat(0.30f));
        else if (controlId == "feedback") setFeedback(asFloat(0.45f));
        else if (controlId == "mix")      setMix(asFloat(0.35f));
    }

    /** @brief Register the echo factory.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<EchoModule>(id);
            });
    }

private:
    static float clampf(float v, float lo, float hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }
    void setTimeSeconds(float s) {
        timeMs_ = clampf(s * 1000.0f, 1.0f, kMaxDelayMs);
        delay_.delay(0, timeMs_);
    }
    void setFeedback(float f) {
        feedback_ = clampf(f, 0.0f, 0.95f);
        fbAmp_.gain(feedback_);
    }
    void setMix(float m) { mix_ = clampf(m, 0.0f, 1.0f); applyMix(); }
    void applyMix() {
        outMix_.gain(0, 1.0f - mix_);  // dry
        outMix_.gain(1, mix_);         // wet
    }

    mutable AudioAmplifier  in_;       ///< Input fan-out (dry + into delay).
    mutable AudioMixer4     inMix_;    ///< ch0 = in, ch1 = feedback.
    mutable AudioEffectDelay delay_;   ///< Single active tap (tap 0).
    mutable AudioAmplifier  fbAmp_;    ///< Feedback gain.
    mutable AudioMixer4     outMix_;   ///< ch0 = dry, ch1 = wet.

    AudioConnection cIn_   { in_,    0, inMix_,  0 };
    AudioConnection cDelay_{ inMix_, 0, delay_,  0 };
    AudioConnection cFbTap_{ delay_, 0, fbAmp_,  0 };
    AudioConnection cFbRet_{ fbAmp_, 0, inMix_,  1 };
    AudioConnection cDry_  { in_,    0, outMix_, 0 };
    AudioConnection cWet_  { delay_, 0, outMix_, 1 };

    float timeMs_   = 300.0f;
    float feedback_ = 0.45f;
    float mix_      = 0.35f;
};

}  // namespace mmb_link
