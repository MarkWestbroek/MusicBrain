#pragma once
/**
 * @file PhaserModule.h
 * @brief Phaser (typeId `tp_mmb_phaser`, FW-AU-2): a custom `AudioStream`
 *        cascade of modulated all-pass filters.
 *
 * @details
 * The stock Teensy Audio library has no phaser, so this builds one from
 * scratch: @ref AudioEffectPhaser runs `kStages` first-order all-pass filters
 * in series, sweeping their coefficient with an internal LFO.  The all-pass
 * cascade creates moving notches in the spectrum (the classic phaser swoosh);
 * `feedback` resonates the notches and `mix` blends against the dry signal.
 *
 * Port map:
 * | Direction | portId  | Domain | Stream / channel    |
 * |-----------|---------|--------|---------------------|
 * | input     | `in`    | Audio  | `fx_`, channel 0    |
 * | input     | `rate`  | Cv     | LFO rate (Hz)       |
 * | input     | `depth` | Cv     | sweep depth (0 … 1) |
 * | output    | `out`   | Audio  | `fx_`, channel 0    |
 *
 * Controls (base value when the matching CV port is unpatched):
 * | controlId  | type  | range    | default | effect              |
 * |------------|-------|----------|---------|---------------------|
 * | `rate`     | float | 0.05 … 8 Hz | 0.5  | LFO sweep rate      |
 * | `depth`    | float | 0 … 1    | 0.7     | Sweep depth         |
 * | `feedback` | float | 0 … 0.95 | 0.3     | Notch resonance     |
 * | `mix`      | float | 0 … 1    | 0.5     | Dry/wet balance     |
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <string_view>

namespace mmb_link {

/** @brief Modulated all-pass cascade phaser. */
class AudioEffectPhaser : public AudioStream {
public:
    static constexpr int kStages = 6;

    AudioEffectPhaser() : AudioStream(1, inputQueueArray_) {}

    void rate(float hz)     { lfoInc_ = (hz < 0.0f ? 0.0f : hz) / AUDIO_SAMPLE_RATE_EXACT; }
    void depth(float d)     { depth_ = clampf(d, 0.0f, 1.0f); }
    void feedback(float f)  { feedback_ = clampf(f, 0.0f, 0.95f); }
    void mix(float m)       { mix_ = clampf(m, 0.0f, 1.0f); }

    void update() override {
        audio_block_t* block = receiveWritable(0);
        if (!block) return;

        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            // Triangle LFO 0..1 → all-pass coefficient g in [gMin, gMax].
            lfoPhase_ += lfoInc_;
            if (lfoPhase_ >= 1.0f) lfoPhase_ -= 1.0f;
            const float tri = (lfoPhase_ < 0.5f)
                ? (lfoPhase_ * 2.0f)
                : (2.0f - lfoPhase_ * 2.0f);
            const float sweep = tri * depth_;
            const float g = 0.1f + 0.85f * sweep;   // coefficient sweep

            float x = block->data[i] * (1.0f / 32768.0f);
            x += fbState_ * feedback_;              // feedback round the cascade

            float y = x;
            for (int s = 0; s < kStages; ++s) {
                const float in = y;
                y = -g * in + ap_[s];
                ap_[s] = in + g * y;
            }
            fbState_ = y;

            float out = x * (1.0f - mix_) + y * mix_;
            if (out >  1.0f) out =  1.0f;
            if (out < -1.0f) out = -1.0f;
            block->data[i] = static_cast<int16_t>(out * 32767.0f);
        }

        transmit(block, 0);
        release(block);
    }

private:
    static float clampf(float v, float lo, float hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }
    audio_block_t* inputQueueArray_[1] = { nullptr };

    float ap_[kStages] = { 0.0f };
    float fbState_  = 0.0f;
    float lfoPhase_ = 0.0f;
    float lfoInc_   = 0.5f / AUDIO_SAMPLE_RATE_EXACT;
    float depth_    = 0.7f;
    float feedback_ = 0.3f;
    float mix_      = 0.5f;
};

/** @brief Module wrapper around @ref AudioEffectPhaser. */
class PhaserModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_phaser";

    explicit PhaserModule(std::string_view id)
        : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out")
            return { const_cast<AudioEffectPhaser*>(&fx_), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in")
            return { const_cast<AudioEffectPhaser*>(&fx_), 0, true };
        return {};
    }

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out") ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in")                     return PortKind::Audio;
        // cvPortIs: accepteert ook de editor-aliassen rate_cv/depth_cv.
        if (cvPortIs(portId, "rate") || cvPortIs(portId, "depth")) return PortKind::Cv;
        return PortKind::None;
    }
    void writeCvPort(std::string_view portId, float value) override {
        if      (cvPortIs(portId, "rate"))  fx_.rate(value);
        else if (cvPortIs(portId, "depth")) fx_.depth(value);
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>   (&value)) return *f;
            if (auto* i = std::get_if<int32_t> (&value)) return static_cast<float>(*i);
            return fallback;
        };
        if      (controlId == "rate")     fx_.rate(asFloat(0.5f));
        else if (controlId == "depth")    fx_.depth(asFloat(0.7f));
        else if (controlId == "feedback") fx_.feedback(asFloat(0.3f));
        else if (controlId == "mix")      fx_.mix(asFloat(0.5f));
    }

    /** @brief Register the phaser factory.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<PhaserModule>(id);
            });
    }

private:
    mutable AudioEffectPhaser fx_;
};

}  // namespace mmb_link
