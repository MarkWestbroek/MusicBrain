#pragma once
/**
 * @file limiter.h
 * @brief Uitgangslimiter voor een som van stemmen: gekoppelde piek-limiter
 *        met daarachter een zachte begrenzing.
 * @details
 * Waarom: tussen modules gaat audio op de Teensy als 16 bits, dus wat een
 * module aan zijn uitgang boven ±1 uitkomt wordt hard afgeknipt, en dat is
 * later niet meer te herstellen. Een zingende MS-20 houdt per stem rond de
 * ±1 (de tanh in de terugkoppeling), en drie, vier stemmen bij elkaar liggen
 * daar ruim boven: digitale overdrive. Level omlaag helpt niet, want dat is
 * het ingangsniveau van het filter en de resonantie zingt even hard door.
 *
 * Hoe:
 *  1. Piekdetector over alle kanalen tegelijk (gekoppeld, zodat het
 *     stereobeeld niet verschuift): snel omhoog (attack ~0,5 ms), langzaam
 *     terug (release ~150 ms).
 *  2. Versterking = drempel / piek zodra de piek boven de drempel (0,8) komt.
 *  3. Zachte begrenzing: lineair tot de knie (0,8), daarboven een tanh-bocht
 *     die naar 1 loopt. Die vangt wat de attack te laat ziet. De uitgang komt
 *     nooit boven ±1.
 *
 * Uit = het oude gedrag: hard afknippen op ±1 (het gruis van een overstuurde
 * som, als je dat wilt).
 *
 * Header-only, zonder heap; één per module (op de som, niet per stem).
 */
#include <cmath>

namespace mmb_dsp {

class OutputLimiter {
public:
    static constexpr float kThreshold = 0.8f;   ///< waar de limiter begint
    static constexpr float kKnee      = 0.8f;   ///< waar de zachte bocht begint

    void Init(float sr, float attackMs = 0.5f, float releaseMs = 150.0f) {
        att_ = coef(sr, attackMs);
        rel_ = coef(sr, releaseMs);
        env_ = 0.0f;
    }
    void set_enabled(bool on) { on_ = on; }
    bool enabled() const { return on_; }
    /** Huidige versterking (1 = niets ingegrepen), voor meters en tests. */
    float gain() const { return env_ > kThreshold ? kThreshold / env_ : 1.0f; }

    /** Eén sampleframe van `n` kanalen, in place. NaN wordt 0. */
    inline void Process(float* x, int n) {
        for (int c = 0; c < n; ++c) if (!(x[c] == x[c])) x[c] = 0.0f;
        if (!on_) {
            for (int c = 0; c < n; ++c) x[c] = x[c] > 1.0f ? 1.0f : (x[c] < -1.0f ? -1.0f : x[c]);
            return;
        }
        float peak = 0.0f;
        for (int c = 0; c < n; ++c) { const float a = std::fabs(x[c]); if (a > peak) peak = a; }
        env_ += (peak > env_ ? att_ : rel_) * (peak - env_);
        const float g = gain();
        for (int c = 0; c < n; ++c) x[c] = soft(x[c] * g);
    }

    /** Lineair tot de knie, daarboven een tanh-bocht naar ±1. */
    static inline float soft(float v) {
        const float a = std::fabs(v);
        if (a <= kKnee) return v;
        const float y = kKnee + (1.0f - kKnee) * std::tanh((a - kKnee) / (1.0f - kKnee));
        return v < 0.0f ? -y : y;
    }

private:
    static float coef(float sr, float ms) {
        return 1.0f - std::exp(-1.0f / (0.001f * ms * sr));
    }
    float att_ = 0.05f, rel_ = 0.0002f, env_ = 0.0f;
    bool  on_ = true;
};

}  // namespace mmb_dsp
