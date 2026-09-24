// Bit-identiteit: de oude AudioEffectCompDrive-rekenkunde, automatisch gelicht
// uit git HEAD (CompDriveModule.h van voor de verhuizing), tegen mmb_dsp::CompDrive.
#include <cstdio>
#include <cstring>
#include <cmath>
#include <cstdint>
#include "mmb_dsp/comp_drive.h"
#define AUDIO_SAMPLE_RATE_EXACT 44100.0f

struct Oud {
    void threshold(float db)  { thresholdDb_ = db; }
    void ratio(float r)       { ratio_ = (r < 1.0f) ? 1.0f : r; }
    void attack(float ms)     { attackCoeff_  = coeff(ms); }
    void releaseTime(float ms){ releaseCoeff_ = coeff(ms); }
    void makeup(float db)     { makeupGain_ = dbToLin(db); }
    void drive(float d)       { drive_ = (d < 0.0f) ? 0.0f : (d > 1.0f ? 1.0f : d); }

    float tick(float xin) {
            const float x = xin;

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
    static float dbToLin(float db) { return powf(10.0f, db / 20.0f); }
    /** @brief One-pole time-constant coefficient for a given ms at 44.1 kHz. */
    static float coeff(float ms) {
        if (ms <= 0.0f) return 1.0f;
        return 1.0f - expf(-1.0f / (ms * 0.001f * AUDIO_SAMPLE_RATE_EXACT));
    }

    float thresholdDb_  = -18.0f;
    float ratio_        = 4.0f;
    float attackCoeff_  = 0.0f;   ///< set in ctor via attack()
    float releaseCoeff_ = 0.0f;   ///< set in ctor via release()
    float makeupGain_   = 1.0f;
    float drive_        = 0.2f;
    float env_          = 0.0f;   ///< Current envelope estimate (linear).
};

int main() {
    long n = 0, mism = 0; float maxdiff = 0;
    const float thr[] = {-40.0f, -18.0f, -3.0f}, rat[] = {1.0f, 4.0f, 20.0f}, drv[] = {0.0f, 0.2f, 1.0f};
    uint32_t rng = 777;
    for (float t : thr) for (float r : rat) for (float d : drv) {
        Oud a; mmb_dsp::CompDrive b; b.Init(44100.0f);
        a.attack(10.0f); b.attack(10.0f); a.releaseTime(120.0f); b.releaseTime(120.0f);
        a.threshold(t); b.threshold(t); a.ratio(r); b.ratio(r); a.drive(d); b.drive(d);
        a.makeup(6.0f); b.makeup(6.0f);
        for (int i = 0; i < 22050; ++i, ++n) {
            rng = rng * 1664525u + 1013904223u;
            const float env = (i / 2205) % 2 ? 0.9f : 0.05f;             // hard/zacht
            const float x = env * std::sin(0.0627f * i) + 0.02f * ((rng >> 8) / 16777216.0f - 0.5f);
            if (i == 11025) { a.attack(1.0f); b.attack(1.0f); a.releaseTime(400.0f); b.releaseTime(400.0f); }
            const float ya = a.tick(x), yb = b.Tick(x);
            if (std::memcmp(&ya, &yb, sizeof(float)) != 0) { ++mism; const float df = std::fabs(ya - yb); if (df > maxdiff) maxdiff = df; }
        }
    }
    std::printf("%ld samples, %ld verschillend (max %.3g)", n, mism, maxdiff); std::puts("");
    std::puts(mism == 0 ? "BIT-IDENTIEK" : "AFWIJKING");
    return mism == 0 ? 0 : 1;
}
