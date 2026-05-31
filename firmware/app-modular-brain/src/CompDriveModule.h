#pragma once
/**
 * @file CompDriveModule.h
 * @brief Compressor + light overdrive (typeId `tp_mmb_comp`): a custom
 *        `AudioStream` dynamics processor (FW-FX-2).
 *
 * @details
 * The stock Teensy Audio library has **no** compressor object, so this builds
 * one from scratch — a deliberate "outside the audio-lib" experiment.  The
 * embedded @ref AudioEffectCompDrive is a peak-sensing feed-forward
 * compressor: it follows the signal envelope with an attack/release one-pole,
 * computes gain reduction in the dB domain above a threshold, applies make-up
 * gain, then runs the result through a `tanh` soft-clip for a gentle
 * tube-style overdrive.
 *
 * Signal path is entirely inside the single `AudioEffectCompDrive` object:
 * `in -> [envelope follow → gain → soft-clip] -> out`.
 *
 * Port map:
 * | Direction | portId | Domain | Stream / channel        |
 * |-----------|--------|--------|-------------------------|
 * | input     | `in`   | Audio  | `comp_`, channel 0      |
 * | output    | `out`  | Audio  | `comp_`, channel 0      |
 *
 * Controls:
 * | controlId   | type  | range      | default | effect                     |
 * |-------------|-------|------------|---------|----------------------------|
 * | `threshold` | float | -60 … 0 dB | -18     | Compression threshold      |
 * | `ratio`     | float | 1 … 20     | 4       | Compression ratio (n:1)    |
 * | `attack`    | float | 1 … 200 ms | 10      | Envelope attack time       |
 * | `release`   | float | 10 … 1000  | 120     | Envelope release time (ms) |
 * | `makeup`    | float | 0 … 24 dB  | 0       | Output make-up gain        |
 * | `drive`     | float | 0 … 1      | 0.2     | Overdrive / saturation     |
 */

#include "AudioPortModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <string_view>

namespace mmb_link {

/**
 * @brief Feed-forward peak compressor with a soft-clip overdrive stage.
 *
 * Runs at audio rate in its own `update()`.  All parameters are plain members
 * updated from the control thread; reads/writes of `float` are atomic enough
 * on the M7 for this non-critical use (a torn parameter just means one block
 * uses a slightly stale coefficient).
 */
class AudioEffectCompDrive : public AudioStream {
public:
    AudioEffectCompDrive() : AudioStream(1, inputQueueArray_) {}

    void threshold(float db)  { thresholdDb_ = db; }
    void ratio(float r)       { ratio_ = (r < 1.0f) ? 1.0f : r; }
    void attack(float ms)     { attackCoeff_  = coeff(ms); }
    void releaseTime(float ms){ releaseCoeff_ = coeff(ms); }
    void makeup(float db)     { makeupGain_ = dbToLin(db); }
    void drive(float d)       { drive_ = (d < 0.0f) ? 0.0f : (d > 1.0f ? 1.0f : d); }

    void update() override {
        audio_block_t* block = receiveWritable(0);
        if (!block) return;

        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            const float x = block->data[i] * (1.0f / 32768.0f);

            // Peak envelope follower (one-pole attack/release on |x|).
            const float mag = std::fabs(x);
            const float coeff = (mag > env_) ? attackCoeff_ : releaseCoeff_;
            env_ += (mag - env_) * coeff;

            // Gain reduction in dB above the threshold.
            float gain = 1.0f;
            if (env_ > 1e-6f) {
                const float envDb = 20.0f * log10f(env_);
                if (envDb > thresholdDb_) {
                    const float reductionDb =
                        (envDb - thresholdDb_) * (1.0f - 1.0f / ratio_);
                    gain = dbToLin(-reductionDb);
                }
            }

            float y = x * gain * makeupGain_;

            // Tube-style soft clip; drive raises pre-gain into the tanh knee.
            if (drive_ > 0.0f) {
                const float k = 1.0f + drive_ * 8.0f;
                y = std::tanh(y * k) / std::tanh(k);
            }

            // Clamp and write back.
            if (y >  1.0f) y =  1.0f;
            if (y < -1.0f) y = -1.0f;
            block->data[i] = static_cast<int16_t>(y * 32767.0f);
        }

        transmit(block, 0);
        release(block);
    }

private:
    static float dbToLin(float db) { return powf(10.0f, db / 20.0f); }
    /** @brief One-pole time-constant coefficient for a given ms at 44.1 kHz. */
    static float coeff(float ms) {
        if (ms <= 0.0f) return 1.0f;
        return 1.0f - expf(-1.0f / (ms * 0.001f * AUDIO_SAMPLE_RATE_EXACT));
    }

    audio_block_t* inputQueueArray_[1] = { nullptr };

    float thresholdDb_  = -18.0f;
    float ratio_        = 4.0f;
    float attackCoeff_  = 0.0f;   ///< set in ctor via attack()
    float releaseCoeff_ = 0.0f;   ///< set in ctor via release()
    float makeupGain_   = 1.0f;
    float drive_        = 0.2f;
    float env_          = 0.0f;   ///< Current envelope estimate (linear).
};

/** @brief Module wrapper around @ref AudioEffectCompDrive. */
class CompDriveModule final : public AudioPortModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_comp";

    explicit CompDriveModule(std::string_view id)
        : AudioPortModule(kTypeId, id)
    {
        comp_.attack(10.0f);
        comp_.releaseTime(120.0f);
    }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out")
            return { const_cast<AudioEffectCompDrive*>(&comp_), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in")
            return { const_cast<AudioEffectCompDrive*>(&comp_), 0, true };
        return {};
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>   (&value)) return *f;
            if (auto* i = std::get_if<int32_t> (&value)) return static_cast<float>(*i);
            return fallback;
        };
        if      (controlId == "threshold") comp_.threshold(asFloat(-18.0f));
        else if (controlId == "ratio")     comp_.ratio(asFloat(4.0f));
        else if (controlId == "attack")    comp_.attack(asFloat(10.0f));
        else if (controlId == "release")   comp_.releaseTime(asFloat(120.0f));
        else if (controlId == "makeup")    comp_.makeup(asFloat(0.0f));
        else if (controlId == "drive")     comp_.drive(asFloat(0.2f));
    }

    /** @brief Register the compressor factory.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<CompDriveModule>(id);
            });
    }

private:
    mutable AudioEffectCompDrive comp_;
};

}  // namespace mmb_link
