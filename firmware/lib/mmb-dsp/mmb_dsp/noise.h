#pragma once
/**
 * @file noise.h
 * @brief Ruisgenerator: wit, roze en bruin, float, header-only.
 * @details
 * Gedeeld door de firmware (`NoiseModule.h`, `tp_mmb_noise`) en de
 * browser-simulator (`tools/mmb-wasm/noise_wasm.cc`), zodat beide exact
 * dezelfde reeks geven.
 *
 * - **Wit**: xorshift32, bovenste 24 bits naar [−1, 1).
 * - **Roze**: Paul Kellets "economy"-filter op wit (drie polen, ±0,05 dB
 *   van −3 dB/oct boven ~40 Hz).
 * - **Bruin**: lekkende integrator op wit (−6 dB/oct, geen DC-drift).
 *
 * Roze en bruin worden bijgeschaald tot ongeveer dezelfde piek als wit. De
 * uitgang is `level` × ruis, geklemd op ±1.
 *
 * Gebruik: `Init(seed)`, dan per sample `Tick()`.
 */
#include <cstdint>

namespace mmb_dsp {

class Noise {
public:
    enum Color : int { kWhite = 0, kPink = 1, kBrown = 2 };

    void Init(uint32_t seed = 22222) { rng_ = seed ? seed : 1; }
    void color(int c)   { color_ = c < kWhite ? kWhite : (c > kBrown ? kBrown : c); }
    void level(float l) { level_ = l < 0.0f ? 0.0f : (l > 1.0f ? 1.0f : l); }

    inline float Tick() {
        const float w = white();
        float y = w;
        if (color_ == kPink) {
            p0_ = 0.99765f * p0_ + w * 0.0990460f;
            p1_ = 0.96300f * p1_ + w * 0.2965164f;
            p2_ = 0.57000f * p2_ + w * 1.0526913f;
            y = (p0_ + p1_ + p2_ + w * 0.1848f) * 0.25f;
        } else if (color_ == kBrown) {
            br_ = (br_ + 0.02f * w) * (1.0f / 1.02f);
            y = br_ * 3.5f;
        }
        y *= level_;
        return y > 1.0f ? 1.0f : (y < -1.0f ? -1.0f : y);
    }

private:
    inline float white() {
        uint32_t x = rng_;
        x ^= x << 13; x ^= x >> 17; x ^= x << 5;
        rng_ = x;
        return static_cast<float>(static_cast<int32_t>(x >> 8) - (1 << 23)) * (1.0f / (1 << 23));
    }

    uint32_t rng_ = 22222;
    int   color_ = kWhite;
    float level_ = 0.6f;
    float p0_ = 0.0f, p1_ = 0.0f, p2_ = 0.0f, br_ = 0.0f;
};

}  // namespace mmb_dsp
