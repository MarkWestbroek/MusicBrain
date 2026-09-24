#pragma once
/**
 * @file comp_drive.h
 * @brief Feed-forward piekcompressor met een tanh-softclip erachter, float,
 *        header-only.
 * @details
 * Volgt de omhullende met een one-pole attack/release op |x|, rekent de
 * gain-reductie in dB boven een drempel, zet er make-up gain op en haalt het
 * resultaat door een tanh voor een zachte, buisachtige overdrive.
 *
 * Dit is de kernel die in `CompDriveModule.h` (`tp_mmb_comp`, FW-FX-2) als
 * `AudioEffectCompDrive` in een `AudioStream` zat, er letterlijk uit getild
 * zodat de firmware en de browser-simulator (`tools/mmb-wasm/comp_wasm.cc`)
 * dezelfde code draaien. Alleen de sample rate van de tijdconstanten komt nu
 * via `Init()`; bit-identiek geverifieerd met
 * `tools/mmb-wasm/bitcheck/comp_check.cc`.
 *
 * Gebruik: `Init(sr)`, dan `attack()`/`releaseTime()` (zonder die aanroep zijn
 * de coëfficiënten 0, net als vroeger vóór de module-constructor), en per
 * sample `Tick(x)` — geeft de geklemde uitgang ±1.
 */
#include <cmath>

namespace mmb_dsp {

class CompDrive {
public:
    void Init(float sr) { sr_ = sr > 1.0f ? sr : 44100.0f; }

    void threshold(float db)  { thresholdDb_ = db; }
    void ratio(float r)       { ratio_ = (r < 1.0f) ? 1.0f : r; }
    void attack(float ms)     { attackCoeff_  = coeff(ms); }
    void releaseTime(float ms){ releaseCoeff_ = coeff(ms); }
    void makeup(float db)     { makeupGain_ = dbToLin(db); }
    void drive(float d)       { drive_ = (d < 0.0f) ? 0.0f : (d > 1.0f ? 1.0f : d); }

    /** Eén sample: ingang ±1 → gecomprimeerd, gesoftclipt en geklemd. */
    inline float Tick(float x) {

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
        return y;
    }

private:
    static float dbToLin(float db) { return powf(10.0f, db / 20.0f); }
    /** @brief One-pole time-constant coefficient for a given ms at 44.1 kHz. */
    float coeff(float ms) const {
        if (ms <= 0.0f) return 1.0f;
        return 1.0f - expf(-1.0f / (ms * 0.001f * sr_));
    }

    float thresholdDb_  = -18.0f;
    float ratio_        = 4.0f;
    float attackCoeff_  = 0.0f;   ///< set in ctor via attack()
    float releaseCoeff_ = 0.0f;   ///< set in ctor via release()
    float makeupGain_   = 1.0f;
    float drive_        = 0.2f;
    float env_          = 0.0f;   ///< Current envelope estimate (linear).
    float sr_           = 44100.0f;
};

}  // namespace mmb_dsp
