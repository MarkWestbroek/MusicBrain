#pragma once
/**
 * @file diode_comp.h
 * @brief Diodebrug-compressor in de geest van de Neve 33609 / 2254: dik,
 *        gekleurd, en een vervorming die met het ingrijpen meegroeit.
 * @details
 * Wat het karakter maakt, en hoe het hier zit (zie doc/plans/vintage-compressors.md):
 *  - **De diodebrug** als regelbare verzwakker. Diodes zijn symmetrisch, dus
 *    vooral **oneven** harmonischen (3e, 5e) — anders dan de buis (even) en
 *    de FET (gemengd). De vervorming groeit hard mee met de gain reduction:
 *    rustig ingrijpen is bijna schoon, flink ingrijpen wordt dik en "Brits".
 *    **Color** schaalt dat (0 = schoon, 1 = zoals het apparaat, 2 = dik),
 *    dubbel bemonsterd op alleen het vervormingsdeel.
 *  - **Ratio 1,5 / 2 / 3 / 4 / 6** met een zachte knie; de 33609 is geen
 *    limiter maar een lijmer.
 *  - **Attack Fast / Slow** (2 of 10 ms) en **Release** 100 / 400 / 800 ms /
 *    1,5 s, plus **A1** en **A2**: programma-afhankelijk, een snelle envelope
 *    (40 of 150 ms) naast een trage die alleen bij aanhoudend materiaal groeit
 *    en in 5 s loslaat.
 *  - **Threshold**, **Makeup**, **Mix**, **Bypass** en de gain reduction als
 *    CV.
 *
 * Feed-forward (het apparaat is feedback; zie de FET voor waarom hier niet).
 * Stereo gekoppeld. Header-only, zonder heap.
 */
#include <cmath>

namespace mmb_dsp {

class DiodeComp {
public:
    static constexpr float kMaxGrDb = 30.0f;

    void Init(float sr) {
        sr_ = sr;
        grFast_ = grSlow_ = 0.0f;
        for (int c = 0; c < 4; ++c) prev_[c] = 0.0f;
        attSlow_ = coef(1000.0f);
        relSlow_ = coef(5000.0f);
        updateTimes();
    }

    void set_threshold_db(float db) { thresh_ = clampf(db, -50.0f, 0.0f); opGain_ = dbToLin(-thresh_); }
    /** 0..4 = 1,5 / 2 / 3 / 4 / 6 :1. */
    void set_ratio(int r) { ratioSel_ = r < 0 ? 0 : (r > 4 ? 4 : r); }
    /** 0 = Fast (2 ms), 1 = Slow (10 ms). */
    void set_attack(int a) { attackSel_ = a >= 1 ? 1 : 0; updateTimes(); }
    /** 0..5 = 100 / 400 / 800 ms / 1,5 s / A1 / A2. */
    void set_release(int r) { releaseSel_ = r < 0 ? 0 : (r > 5 ? 5 : r); updateTimes(); }
    void set_makeup_db(float db) { makeup_ = dbToLin(db); }
    void set_color(float c) { color_ = clampf(c, 0.0f, 2.0f); }
    void set_mix(float m)   { mix_ = clampf(m, 0.0f, 1.0f); }
    void set_bypass(bool on) { bypass_ = on; }

    float gr_db() const { return grFast_ > grSlow_ ? grFast_ : grSlow_; }
    float gr() const { return clampf(gr_db() * (1.0f / 20.0f), 0.0f, 1.0f); }

    /** Statische gain reduction (dB) bij een niveau in dBFS. */
    float staticGrDb(float levelDb) const {
        static const float r[5] = { 1.5f, 2.0f, 3.0f, 4.0f, 6.0f };
        const float slope = 1.0f - 1.0f / r[ratioSel_];
        const float w = 6.0f;                       // zachte knie
        const float over = levelDb - thresh_;
        float gr;
        if (over <= -0.5f * w)     gr = 0.0f;
        else if (over >= 0.5f * w) gr = over * slope;
        else { const float t = over + 0.5f * w; gr = slope * t * t / (2.0f * w); }
        return gr > kMaxGrDb ? kMaxGrDb : gr;
    }

    /** Eén sampleframe van `n` kanalen (≤ 4), in place. */
    inline void Process(float* x, int n) {
        if (n > 4) n = 4;
        float peak = 0.0f;
        for (int c = 0; c < n; ++c) {
            if (!(x[c] == x[c])) x[c] = 0.0f;
            const float a = std::fabs(x[c]);
            if (a > peak) peak = a;
        }
        const float levelDb = peak > 1e-9f ? 20.0f * std::log10(peak) : -180.0f;
        const float target = staticGrDb(levelDb);
        grFast_ += (target > grFast_ ? att_ : rel_) * (target - grFast_);
        if (program_) grSlow_ += (target > grSlow_ ? attSlow_ : relSlow_) * (target - grSlow_);
        else          grSlow_ = 0.0f;
        if (bypass_) return;

        const float grDb = gr_db();
        const float g = dbToLin(-grDb);
        // Diodes: symmetrisch (oneven harmonischen), sterk meegroeiend met de GR.
        // Lineair meegroeiend: bij 3–6 dB ingrijpen al hoorbaar (kwadratisch was
        // te braaf: Color 0 tegen 2 scheelde op de Teensy maar 1 dB in het hoog).
        const float grN = clampf(grDb * (1.0f / 15.0f), 0.0f, 1.5f);
        const float k = color_ * (kBaseDrive + kGrDrive * grN);
        const float op = opGain_;                      // werkpunt = de drempel
        for (int c = 0; c < n; ++c) {
            const float v = x[c] * g * op;
            const float m = 0.5f * (prev_[c] + v);
            // Dubbel bemonsterd, alleen het vervormingsdeel gemiddeld.
            const float y = v + 0.5f * ((shape(m, k) - m) + (shape(v, k) - v));
            prev_[c] = v;
            const float o = softOut(y / op * makeup_);
            x[c] = mix_ * o + (1.0f - mix_) * x[c];
        }
    }

private:
    static constexpr float kBaseDrive = 0.15f;
    static constexpr float kGrDrive   = 1.6f;

    void updateTimes() {
        static const float rel[6] = { 100.0f, 400.0f, 800.0f, 1500.0f, 40.0f, 150.0f };
        att_ = coef(attackSel_ == 0 ? 2.0f : 10.0f);
        rel_ = coef(rel[releaseSel_]);
        program_ = releaseSel_ >= 4;
    }
    float coef(float ms) const { return 1.0f - std::exp(-1.0f / (0.001f * ms * sr_)); }
    /** Symmetrische tanh met helling 1 in de oorsprong; k = 0 is schoon. */
    static inline float shape(float v, float k) {
        if (k < 1e-4f) return v;
        return std::tanh(k * v) / k;
    }
    static inline float softOut(float v) {
        const float a = std::fabs(v);
        if (a <= 0.8f) return v;
        const float y = 0.8f + 0.2f * std::tanh((a - 0.8f) * 5.0f);
        return v < 0.0f ? -y : y;
    }
    static float dbToLin(float db) { return std::exp(db * 0.11512925f); }
    static float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

    float sr_ = 44100.0f;
    float thresh_ = -20.0f, opGain_ = 10.0f, makeup_ = 1.0f, color_ = 1.0f, mix_ = 1.0f;
    int   ratioSel_ = 1, attackSel_ = 1, releaseSel_ = 4;
    bool  bypass_ = false, program_ = true;
    float att_ = 0.01f, rel_ = 0.001f, attSlow_ = 0.00002f, relSlow_ = 0.000005f;
    float grFast_ = 0.0f, grSlow_ = 0.0f;
    float prev_[4] = {};
};

}  // namespace mmb_dsp
