#pragma once
/**
 * @file phaser.h
 * @brief Phaser: cascade van zes eerste-orde all-passfilters met een
 *        driehoek-LFO op de coëfficiënt, float, header-only.
 * @details
 * De all-pass-cascade maakt bewegende notches in het spectrum (de klassieke
 * phaser-swoosh); `feedback` laat de notches resoneren en `mix` mengt tegen
 * het droge signaal.
 *
 * Dit is de kernel die in `PhaserModule.h` in een `AudioStream` zat
 * (`tp_mmb_phaser`, FW-AU-2), er letterlijk uit getild zodat de firmware en
 * de browser-simulator (`tools/mmb-wasm/phaser_wasm.cc`) dezelfde code
 * draaien. De rekenkunde is niet aangeraakt; alleen de sample rate komt nu
 * via `Init()` binnen in plaats van uit `AUDIO_SAMPLE_RATE_EXACT`.
 *
 * Gebruik: `Init(sr)`, dan per sample `Tick(x)` met x in ±1. De uitgang is
 * geklemd op ±1.
 */

namespace mmb_dsp {

class Phaser {
public:
    static constexpr int kStages = 6;

    void Init(float sr) {
        sr_ = sr > 1.0f ? sr : 44100.0f;
        lfoInc_ = 0.5f / sr_;
    }

    void rate(float hz)     { lfoInc_ = (hz < 0.0f ? 0.0f : hz) / sr_; }
    void depth(float d)     { depth_ = clampf(d, 0.0f, 1.0f); }
    void feedback(float f)  { feedback_ = clampf(f, 0.0f, 0.95f); }
    void mix(float m)       { mix_ = clampf(m, 0.0f, 1.0f); }

    inline float Tick(float x) {
        // Triangle LFO 0..1 → all-pass coefficient g in [gMin, gMax].
        lfoPhase_ += lfoInc_;
        if (lfoPhase_ >= 1.0f) lfoPhase_ -= 1.0f;
        const float tri = (lfoPhase_ < 0.5f)
            ? (lfoPhase_ * 2.0f)
            : (2.0f - lfoPhase_ * 2.0f);
        const float sweep = tri * depth_;
        const float g = 0.1f + 0.85f * sweep;   // coefficient sweep

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
        return out;
    }

private:
    static float clampf(float v, float lo, float hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }

    float sr_       = 44100.0f;
    float ap_[kStages] = { 0.0f };
    float fbState_  = 0.0f;
    float lfoPhase_ = 0.0f;
    float lfoInc_   = 0.5f / 44100.0f;
    float depth_    = 0.7f;
    float feedback_ = 0.3f;
    float mix_      = 0.5f;
};

}  // namespace mmb_dsp
