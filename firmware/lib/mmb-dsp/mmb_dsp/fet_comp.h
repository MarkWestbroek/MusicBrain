#pragma once
/**
 * @file fet_comp.h
 * @brief FET-compressor in de geest van de UREI/UA 1176: snel, pittig, en
 *        met vervorming die meegroeit met het ingrijpen.
 * @details
 * Wat het karakter maakt, en hoe het hier zit (zie doc/plans/vintage-compressors.md):
 *  - **Vaste drempel, sturen met Input.** Net als op het apparaat is er geen
 *    threshold-knop: meer Input = meer compressie, Output haalt het niveau
 *    terug.
 *  - **Heel snelle detector** (aanval 800 → 20 µs, loslaten 1100 → 50 ms,
 *    knoppen 1..7 met 7 = snelst). De gain reduction volgt de piek per
 *    sample; op de snelste standen beweegt de versterking dan mee binnen een
 *    lage golf, en dat vervormt de bas, net als bij het echte apparaat.
 *  - **Ratio 4 / 8 / 12 / 20**, elk met een eigen zachte knie (breder bij 4).
 *  - **Alle knoppen** ("British mode"): drempel lager, ratio voorbij 20 (boven
 *    een punt wordt de uitgang zachter naarmate de ingang harder wordt), een
 *    tragere aanval zodat de transiënt erdoor knalt, en veel meer vervorming.
 *  - **FET-vervorming:** een asymmetrische tanh-kromme op het geregelde
 *    signaal (even én oneven harmonischen) waarvan de sterkte meeloopt met de
 *    gain reduction, met een DC-filter erachter. Daarna Output en een zachte
 *    uitgangsbegrenzing (de transformator), zodat de uitgang binnen ±1 blijft.
 *  - **Mix** voor parallelle compressie.
 *
 * Feed-forward, geen feedback: de 1176 is een feedback-compressor, maar een
 * digitale feedbacklus met 20 µs aanval en ratio 20 oscilleert (stabiel alleen
 * als de stap per sample < 2/R). Het hoorbare karakter zit in de detector, de
 * knie en de vervorming, en die zitten er wel in.
 *
 * Stereo gekoppeld: één detector over alle kanalen. Header-only, zonder heap.
 */
#include <cmath>

namespace mmb_dsp {

class FetComp {
public:
    static constexpr int   kRatioAll   = 4;       ///< set_ratio(4) = alle knoppen
    static constexpr float kThreshDb   = -18.0f;  ///< vaste drempel (dBFS, na Input)
    static constexpr float kMaxGrDb    = 40.0f;

    void Init(float sr) {
        sr_ = sr;
        grDb_ = 0.0f;
        dc_[0] = dc_[1] = dc_[2] = dc_[3] = 0.0f;
        dcCoef_ = 1.0f - std::exp(-2.0f * 3.14159265f * 8.0f / sr);   // ~8 Hz
        updateTimes();
    }

    void set_input_db(float db)  { inGain_  = dbToLin(db); }
    void set_output_db(float db) { outGain_ = dbToLin(db); }
    /** 1..7, 7 = snelst (800 → 20 µs). */
    void set_attack(float knob)  { attackKnob_  = clampf(knob, 1.0f, 7.0f); updateTimes(); }
    /** 1..7, 7 = snelst (1100 → 50 ms). */
    void set_release(float knob) { releaseKnob_ = clampf(knob, 1.0f, 7.0f); updateTimes(); }
    /** 0..3 = 4:1, 8:1, 12:1, 20:1; 4 = alle knoppen. */
    void set_ratio(int r) {
        ratioSel_ = r < 0 ? 0 : (r > kRatioAll ? kRatioAll : r);
        updateTimes();
    }
    void set_mix(float m) { mix_ = clampf(m, 0.0f, 1.0f); }

    /** Huidige gain reduction in dB (≥ 0). */
    float gr_db() const { return grDb_; }
    /** Gain reduction als CV: 0 = niets, 1 = 20 dB of meer. */
    float gr() const { return clampf(grDb_ * (1.0f / 20.0f), 0.0f, 1.0f); }

    /** Statische gain reduction (dB) bij een ingangsniveau in dBFS, na Input. */
    float staticGrDb(float levelDb) const {
        const float over = levelDb - threshDb();
        const float w = knee();
        float gr;
        if (over <= -0.5f * w)      gr = 0.0f;
        else if (over >= 0.5f * w)  gr = over * slope();
        else { const float t = over + 0.5f * w; gr = slope() * t * t / (2.0f * w); }
        if (ratioSel_ == kRatioAll && over > kAllBendDb) gr += (over - kAllBendDb) * kAllExtra;
        return gr > kMaxGrDb ? kMaxGrDb : gr;
    }

    /** Eén sampleframe van `n` kanalen (≤ 4), in place. */
    inline void Process(float* x, int n) {
        if (n > 4) n = 4;
        float peak = 0.0f;
        float u[4];
        for (int c = 0; c < n; ++c) {
            if (!(x[c] == x[c])) x[c] = 0.0f;
            u[c] = x[c] * inGain_;
            const float a = std::fabs(u[c]);
            if (a > peak) peak = a;
        }
        const float levelDb = peak > 1e-9f ? 20.0f * std::log10(peak) : -180.0f;
        const float target = staticGrDb(levelDb);
        grDb_ += (target > grDb_ ? att_ : rel_) * (target - grDb_);

        const float g = dbToLin(-grDb_);
        // Vervorming groeit met het ingrijpen; alle knoppen: veel meer.
        const float grN = clampf(grDb_ * (1.0f / 20.0f), 0.0f, 1.5f);
        const float k = kBaseDrive + grN * (ratioSel_ == kRatioAll ? kAllDrive : kGrDrive);
        const float b = kBias;
        const float tb = std::tanh(k * b);
        const float norm = 1.0f / (k * (1.0f - tb * tb));

        for (int c = 0; c < n; ++c) {
            const float v = u[c] * g;
            float y = (std::tanh(k * (v + b)) - tb) * norm;     // helling 1 in de oorsprong
            // DC-filter: de asymmetrie laat een kleine DC achter.
            dc_[c] += dcCoef_ * (y - dc_[c]);
            y -= dc_[c];
            y = softOut(y * outGain_);
            x[c] = mix_ * y + (1.0f - mix_) * x[c];
        }
    }

private:
    static constexpr float kAllBendDb = 6.0f;    ///< alle knoppen: vanaf hier meer dan 20:1
    static constexpr float kAllExtra  = 0.25f;   ///< extra dB GR per dB erboven
    static constexpr float kBaseDrive = 0.35f;   ///< vervorming zonder ingrijpen (klasse A)
    static constexpr float kGrDrive   = 1.6f;
    static constexpr float kAllDrive  = 4.5f;
    static constexpr float kBias      = 0.18f;   ///< asymmetrie → even harmonischen

    float threshDb() const { return ratioSel_ == kRatioAll ? kThreshDb - 3.0f : kThreshDb; }
    float ratio() const {
        static const float r[5] = { 4.0f, 8.0f, 12.0f, 20.0f, 20.0f };
        return r[ratioSel_];
    }
    float slope() const { return 1.0f - 1.0f / ratio(); }
    float knee() const {
        static const float w[5] = { 8.0f, 6.0f, 4.0f, 3.0f, 2.0f };
        return w[ratioSel_];
    }

    void updateTimes() {
        // 1..7 → logaritmisch; 7 = snelst.
        const float ta = (attackKnob_  - 1.0f) / 6.0f;
        const float tr = (releaseKnob_ - 1.0f) / 6.0f;
        float attackMs  = 0.8f  * std::pow(0.02f / 0.8f, ta);
        const float releaseMs = 1100.0f * std::pow(50.0f / 1100.0f, tr);
        if (ratioSel_ == kRatioAll) attackMs *= 2.5f;          // transiënt knalt erdoor
        att_ = coef(attackMs);
        rel_ = coef(releaseMs);
    }
    float coef(float ms) const { return 1.0f - std::exp(-1.0f / (0.001f * ms * sr_)); }

    static inline float softOut(float v) {
        // Lineair tot 0,8, dan een tanh-bocht naar ±1 (zoals mmb_dsp::OutputLimiter::soft).
        const float a = std::fabs(v);
        if (a <= 0.8f) return v;
        const float y = 0.8f + 0.2f * std::tanh((a - 0.8f) * 5.0f);
        return v < 0.0f ? -y : y;
    }
    static float dbToLin(float db) { return std::pow(10.0f, db * 0.05f); }
    static float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

    float sr_ = 44100.0f;
    float inGain_ = 1.0f, outGain_ = 1.0f, mix_ = 1.0f;
    float attackKnob_ = 4.0f, releaseKnob_ = 4.0f;
    int   ratioSel_ = 0;
    float att_ = 0.5f, rel_ = 0.001f;
    float grDb_ = 0.0f;
    float dc_[4] = {}, dcCoef_ = 0.001f;
};

}  // namespace mmb_dsp
