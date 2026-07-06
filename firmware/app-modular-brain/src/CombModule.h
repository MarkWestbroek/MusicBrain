#pragma once
/**
 * @file CombModule.h
 * @brief Tuned comb-filter / resonator (typeId `tp_mmb_comb`, FW-AU-3):
 *        a short feedback delay tuned to a pitch.
 *
 * @details
 * A comb filter is just a very short feedback delay: the delay length sets a
 * resonant pitch (`f = 1 / delay`) and the feedback sets how sharp/long the
 * resonance rings.  Sweeping the feedback toward 1 turns it into a pitched
 * resonator (Karplus-Strong-without-the-pluck); driving it with noise or a
 * percussive transient gives metallic, bowed or flute-like tones.
 *
 *     in ─┬───────────────────────────► outMix.0 (dry)
 *         │                                │
 *         └─► inMix.0 ─► delay ─┬─► fbAmp ─► inMix.1
 *                               └────────────► outMix.1 (wet)
 *
 * The delay tap is retuned from a **V/Oct** CV (`freq`, 0 V = C4 = 261.626 Hz),
 * so the resonator tracks a keyboard exactly like a VCO.
 *
 * Port map:
 * | Direction | portId | Domain | Stream / channel    |
 * |-----------|--------|--------|---------------------|
 * | input     | `in`   | Audio  | `in_`, channel 0    |
 * | input     | `freq` | Cv     | resonant pitch V/Oct|
 * | input     | `fbk`  | Cv     | feedback / resonance|
 * | input     | `mix`  | Cv     | dry/wet (0 … 1)     |
 * | output    | `out`  | Audio  | `outMix_`, channel 0|
 *
 * Controls (base value when the matching CV port is unpatched):
 * | controlId  | type  | range     | default | effect                  |
 * |------------|-------|-----------|---------|-------------------------|
 * | `coarse`   | float | −36 … +36 | 0       | Semitone offset on freq |
 * | `feedback` | float | 0 … 0.99  | 0.9     | Resonance / decay       |
 * | `mix`      | float | 0 … 1     | 0.5     | Dry/wet balance         |
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <string_view>

namespace mmb_link {

/** @brief Pitch-tracking feedback-comb resonator. */
class CombModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_comb";
    // Delay clamps: 0.2 ms (≈5 kHz) … 50 ms (20 Hz) — keeps memory bounded.
    static constexpr float kMinDelayMs = 0.2f;
    static constexpr float kMaxDelayMs = 50.0f;

    explicit CombModule(std::string_view id)
        : AudioModule(kTypeId, id)
    {
        in_.gain(1.0f);
        fbAmp_.gain(feedback_);
        retune();
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
        if (portId == "in")                                   return PortKind::Audio;
        // cvPortIs: accepteert ook de editor-aliassen freq_cv/fbk_cv/mix_cv.
        if (cvPortIs(portId, "freq") || cvPortIs(portId, "fbk") ||
            cvPortIs(portId, "mix"))                          return PortKind::Cv;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if      (cvPortIs(portId, "freq")) { voct_ = value; retune(); }
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
        if      (controlId == "coarse")   { coarse_ = asFloat(0.0f); retune(); }
        else if (controlId == "feedback") setFeedback(asFloat(0.9f));
        else if (controlId == "mix")      setMix(asFloat(0.5f));
    }

    /** @brief Register the comb factory.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<CombModule>(id);
            });
    }

private:
    static float clampf(float v, float lo, float hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }
    /** @brief Set the delay length from the V/Oct value + coarse offset. */
    void retune() {
        const float hz = 261.6256f * powf(2.0f, voct_ + coarse_ / 12.0f);
        float ms = (hz > 0.0f) ? (1000.0f / hz) : kMaxDelayMs;
        ms = clampf(ms, kMinDelayMs, kMaxDelayMs);
        delay_.delay(0, ms);
    }
    void setFeedback(float f) {
        feedback_ = clampf(f, 0.0f, 0.99f);
        fbAmp_.gain(feedback_);
    }
    void setMix(float m) { mix_ = clampf(m, 0.0f, 1.0f); applyMix(); }
    void applyMix() {
        outMix_.gain(0, 1.0f - mix_);  // dry
        outMix_.gain(1, mix_);         // wet
    }

    mutable AudioAmplifier   in_;
    mutable AudioMixer4      inMix_;
    mutable AudioEffectDelay delay_;
    mutable AudioAmplifier   fbAmp_;
    mutable AudioMixer4      outMix_;

    AudioConnection cIn_   { in_,    0, inMix_,  0 };
    AudioConnection cDelay_{ inMix_, 0, delay_,  0 };
    AudioConnection cFbTap_{ delay_, 0, fbAmp_,  0 };
    AudioConnection cFbRet_{ fbAmp_, 0, inMix_,  1 };
    AudioConnection cDry_  { in_,    0, outMix_, 0 };
    AudioConnection cWet_  { delay_, 0, outMix_, 1 };

    float voct_     = 0.0f;
    float coarse_   = 0.0f;
    float feedback_ = 0.9f;
    float mix_      = 0.5f;
};

}  // namespace mmb_link
