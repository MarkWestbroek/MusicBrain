#pragma once
/**
 * @file varimu_comp.h
 * @brief Variable-mu buizencompressor in de geest van de Fairchild 660/670:
 *        dik, warm, en een ratio die vanzelf oploopt.
 * @details
 * Wat het karakter maakt, en hoe het hier zit (zie doc/plans/vintage-compressors.md):
 *  - **Ratio loopt op met het ingrijpen.** In een variable-mu buis neemt de
 *    versterking geleidelijk af naarmate de stuurspanning stijgt; er is geen
 *    vaste ratio. Hier: GR = over² / (over + 8 dB) boven de drempel. Een
 *    paar dB erboven rond 2:1, 20 dB erboven ~12:1. Zacht in, stevig aan de top.
 *  - **Zes tijdstanden** zoals het apparaat: attack 0,2–0,8 ms, release 0,3 /
 *    0,8 / 2 / 5 s, en stand 5 en 6 passen zich aan het programma aan (een
 *    snelle en een trage envelope naast elkaar; de trage groeit alleen bij
 *    aanhoudend luid materiaal).
 *  - **Buisvervorming** (vooral even harmonischen) die meegroeit met het
 *    ingrijpen; **Color** schaalt die (0 = schoon, 1 = zoals het apparaat,
 *    2 = dik), dubbel bemonsterd.
 *  - **Lateral/vertical** zoals de 670: Mode LR regelt links en rechts samen,
 *    Mode M/S regelt midden (som) en zijkant (verschil) elk apart. Op de mixbus
 *    houdt M/S het midden stevig zonder dat de ruimte ingeklemd wordt.
 *  - **Input**, **Threshold**, **Output**, **Mix**, **Bypass** en de gain
 *    reduction als CV.
 *
 * Header-only, zonder heap.
 */
#include <cmath>

namespace mmb_dsp {

class VariMuComp {
public:
    static constexpr float kMaxGrDb = 30.0f;
    static constexpr float kKneeDb  = 8.0f;     ///< waar de ratio "halverwege" zit

    void Init(float sr) {
        sr_ = sr;
        for (int d = 0; d < 2; ++d) fast_[d] = slow_[d] = 0.0f;
        for (int c = 0; c < 4; ++c) prev_[c] = dc_[c] = 0.0f;
        dcCoef_ = 1.0f - std::exp(-2.0f * 3.14159265f * 8.0f / sr);
        updateTimes();
    }

    void set_input_db(float db)  { inGain_ = dbToLin(db); }
    /** Drempel in dBFS (na Input). */
    void set_threshold_db(float db) { thresh_ = clampf(db, -40.0f, 0.0f); opGain_ = dbToLin(-thresh_); }
    void set_output_db(float db) { outGain_ = dbToLin(db); }
    /** 1..6 zoals het apparaat; 5 en 6 passen zich aan het programma aan. */
    void set_time(int t) { timeSel_ = t < 1 ? 1 : (t > 6 ? 6 : t); updateTimes(); }
    /** 0 = LR gekoppeld, 1 = M/S (lateral/vertical). */
    void set_mode(int m) { ms_ = m >= 1; }
    void set_color(float c) { color_ = clampf(c, 0.0f, 2.0f); }
    void set_mix(float m)   { mix_ = clampf(m, 0.0f, 1.0f); }
    void set_bypass(bool on) { bypass_ = on; }

    float gr_db() const {
        const float a = grOf(0), b = ms_ ? grOf(1) : 0.0f;
        return a > b ? a : b;
    }
    float gr() const { return clampf(gr_db() * (1.0f / 20.0f), 0.0f, 1.0f); }

    /** Statische gain reduction (dB) bij een niveau in dBFS (na Input). */
    float staticGrDb(float levelDb) const {
        const float over = levelDb - thresh_;
        if (over <= 0.0f) return 0.0f;
        const float gr = over * over / (over + kKneeDb);
        return gr > kMaxGrDb ? kMaxGrDb : gr;
    }

    /** Eén sampleframe; kanaal 0/1 = L/R (M/S alleen met n ≥ 2). */
    inline void Process(float* x, int n) {
        if (n > 4) n = 4;
        float u[4];
        for (int c = 0; c < n; ++c) {
            if (!(x[c] == x[c])) x[c] = 0.0f;
            u[c] = x[c] * inGain_;
        }
        const bool ms = ms_ && n >= 2;
        if (ms) {                                     // naar midden/zijkant
            const float m = 0.5f * (u[0] + u[1]), s = 0.5f * (u[0] - u[1]);
            u[0] = m; u[1] = s;
        }
        // Detectoren: één gekoppeld (LR) of twee (M en S apart).
        const int nd = ms ? 2 : 1;
        for (int d = 0; d < nd; ++d) {
            float peak = 0.0f;
            if (ms) peak = std::fabs(u[d]);
            else for (int c = 0; c < n; ++c) { const float a = std::fabs(u[c]); if (a > peak) peak = a; }
            const float levelDb = peak > 1e-9f ? 20.0f * std::log10(peak) : -180.0f;
            const float target = staticGrDb(levelDb);
            fast_[d] += (target > fast_[d] ? att_ : relFast_) * (target - fast_[d]);
            if (program_) slow_[d] += (target > slow_[d] ? attSlow_ : relSlow_) * (target - slow_[d]);
            else          slow_[d] = 0.0f;
        }
        if (bypass_) return;

        float y[4];
        const float op = opGain_;
        for (int c = 0; c < n; ++c) {
            const int d = ms ? (c < 2 ? c : 0) : 0;
            const float grDb = grOf(d);
            const float g = dbToLin(-grDb);
            // Buis: vervorming groeit met de gain reduction; werkpunt op de drempel.
            const float k = color_ * (kBaseDrive + kGrDrive * clampf(grDb * (1.0f / 20.0f), 0.0f, 1.5f));
            const float v = u[c] * g * op;
            const float m = 0.5f * (prev_[c] + v);
            float t = v + 0.5f * ((shape(m, k) - m) + (shape(v, k) - v));
            prev_[c] = v;
            dc_[c] += dcCoef_ * (t - dc_[c]);
            y[c] = (t - dc_[c]) / op;
        }
        if (ms) {                                     // terug naar links/rechts
            const float m = y[0], s = y[1];
            y[0] = m + s; y[1] = m - s;
        }
        for (int c = 0; c < n; ++c) {
            const float o = softOut(y[c] * outGain_);
            x[c] = mix_ * o + (1.0f - mix_) * x[c];
        }
    }

private:
    static constexpr float kBaseDrive = 0.25f;
    static constexpr float kGrDrive   = 0.9f;
    static constexpr float kBias      = 0.15f;

    float grOf(int d) const { return fast_[d] > slow_[d] ? fast_[d] : slow_[d]; }

    void updateTimes() {
        //                        1      2      3      4      5      6
        static const float a[6] = { 0.2f,  0.2f,  0.4f,  0.8f,  0.2f,  0.4f };
        static const float r[6] = { 300.f, 800.f, 2000.f, 5000.f, 2000.f, 300.f };
        const int i = timeSel_ - 1;
        att_ = coef(a[i]);
        relFast_ = coef(r[i]);
        program_ = timeSel_ >= 5;
        // Programma-afhankelijk: de trage envelope groeit alleen bij
        // aanhoudend materiaal en laat in 10 (stand 5) of 25 s (stand 6) los.
        attSlow_ = coef(timeSel_ == 5 ? 1000.0f : 2000.0f);
        relSlow_ = coef(timeSel_ == 5 ? 10000.0f : 25000.0f);
    }
    float coef(float ms) const { return 1.0f - std::exp(-1.0f / (0.001f * ms * sr_)); }
    static inline float shape(float v, float k) {
        if (k < 1e-4f) return v;
        const float tb = std::tanh(k * kBias);
        return (std::tanh(k * (v + kBias)) - tb) / (k * (1.0f - tb * tb));
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
    float inGain_ = 1.0f, outGain_ = 1.0f, thresh_ = -18.0f, color_ = 1.0f, mix_ = 1.0f;
    float opGain_ = 7.943282f;   ///< werkpunt van de buis = de drempel (−18 dBFS)
    int   timeSel_ = 2;
    bool  ms_ = false, bypass_ = false, program_ = false;
    float att_ = 0.1f, relFast_ = 0.0001f, attSlow_ = 0.00002f, relSlow_ = 0.000002f;
    float fast_[2] = {}, slow_[2] = {};
    float prev_[4] = {}, dc_[4] = {}, dcCoef_ = 0.001f;
};

}  // namespace mmb_dsp
