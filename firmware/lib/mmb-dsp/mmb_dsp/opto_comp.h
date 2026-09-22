#pragma once
/**
 * @file opto_comp.h
 * @brief Opto-compressor in de geest van de Teletronix LA-2A: traag,
 *        vloeiend, en met een cel die onthoudt hoe hard hij heeft gewerkt.
 * @details
 * Wat het karakter maakt, en hoe het hier zit (zie doc/plans/vintage-compressors.md):
 *  - **De lichtcel.** In het apparaat schijnt een lampje op een
 *    lichtgevoelige weerstand. Die reageert traag en, belangrijker, in twee
 *    fasen: na een piek is de eerste helft van het ingrijpen in ~60 ms weg,
 *    de rest sijpelt er in seconden uit. Hier zijn dat twee envelopes (snel en
 *    traag) die elk de helft van de gain reduction leveren.
 *  - **Geheugen.** Hoe langer en harder de cel heeft gewerkt, hoe trager ze
 *    loslaat: de trage tijd loopt van ~0,8 s naar ~12 s, gestuurd door een
 *    lopend gemiddelde van de gain reduction. Daarom "ademt" een LA-2A mee met
 *    de muziek in plaats van te pompen.
 *  - **Twee knoppen.** *Peak Reduction* zakt de drempel (0 = niets, 100 =
 *    −45 dBFS) en *Gain* is de uitgangsversterking. Geen attack, geen release:
 *    die liggen vast, net als op het apparaat.
 *  - **Compress / Limit.** Compress ≈ 3:1 met een brede zachte knie, Limit
 *    knijpt vrijwel alles boven de drempel weg.
 *  - **Buisverzadiging**, met **Color** te regelen (0 = schoon, 1 = zoals het
 *    apparaat, 2 = dik). Vooral even harmonischen, dubbel bemonsterd zodat de
 *    boventonen niet terugvouwen.
 *  - **Mix** voor parallelle compressie, **Bypass** om met en zonder naast
 *    elkaar te horen (de cel loopt door, zodat terugschakelen niet knalt).
 *
 * Stereo gekoppeld: één cel over alle kanalen. Header-only, zonder heap.
 */
#include <cmath>

namespace mmb_dsp {

class OptoComp {
public:
    static constexpr float kMaxGrDb = 40.0f;

    void Init(float sr) {
        sr_ = sr;
        att_   = coef(sr, 10.0f);     // vast, zoals het apparaat
        relFast_ = coef(sr, 60.0f);
        memCoef_ = coef(sr, 3000.0f); // geheugen van de cel
        fast_ = slow_ = mem_ = 0.0f;
        relSlow_ = coef(sr, 800.0f); relCount_ = 0; opGain_ = dbToLin(-threshDb());
        dc_[0] = dc_[1] = dc_[2] = dc_[3] = 0.0f;
        prev_[0] = prev_[1] = prev_[2] = prev_[3] = 0.0f;
        dcCoef_ = 1.0f - std::exp(-2.0f * 3.14159265f * 8.0f / sr);
    }

    /** 0..100, zoals Peak Reduction: zakt de drempel van 0 naar −45 dBFS. */
    void set_peak_reduction(float p) { peak_ = clampf(p, 0.0f, 100.0f); opGain_ = dbToLin(-threshDb()); }
    /** Uitgangsversterking in dB. */
    void set_gain_db(float db) { outGain_ = dbToLin(db); }
    /** 0 = Compress (~3:1), 1 = Limit. */
    void set_mode(int m) { limit_ = m >= 1; }
    void set_color(float c) { color_ = clampf(c, 0.0f, 2.0f); }
    void set_mix(float m)   { mix_ = clampf(m, 0.0f, 1.0f); }
    void set_bypass(bool on) { bypass_ = on; }

    float gr_db() const { return fast_ + slow_; }
    /** Gain reduction als CV: 0 = niets, 1 = 20 dB of meer. */
    float gr() const { return clampf(gr_db() * (1.0f / 20.0f), 0.0f, 1.0f); }
    /** Drempel in dBFS bij de huidige Peak Reduction. */
    float threshDb() const { return -0.45f * peak_; }

    /** Statische gain reduction (dB) bij een ingangsniveau in dBFS. */
    float staticGrDb(float levelDb) const {
        const float slope = limit_ ? 0.95f : (1.0f - 1.0f / 3.0f);
        const float w = limit_ ? 4.0f : 10.0f;          // Compress heeft een brede knie
        const float over = levelDb - threshDb();
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
        const float target = 0.5f * staticGrDb(levelDb);   // elke helft levert de helft

        // Geheugen: hoe langer en harder de cel werkte, hoe trager ze loslaat.
        // De trage tijdconstante beweegt in seconden, dus die hoeft niet per
        // sample opnieuw (een exp() per sample kostte merkbaar CPU).
        mem_ += memCoef_ * (clampf(gr_db() * (1.0f / 20.0f), 0.0f, 1.0f) - mem_);
        if (--relCount_ <= 0) { relCount_ = 32; relSlow_ = coef(sr_, 800.0f + 11200.0f * mem_); }

        fast_ += (target > fast_ ? att_ : relFast_) * (target - fast_);
        slow_ += (target > slow_ ? att_ : relSlow_) * (target - slow_);

        if (bypass_) return;

        const float g = dbToLin(-(fast_ + slow_));
        // Buis: de verzadiging hangt aan het niveau in de trap, niet aan de
        // digitale schaal; op de drempel zit hij op zijn werkpunt.
        const float op = opGain_;
        const float k = color_ * kDrive;
        for (int c = 0; c < n; ++c) {
            const float v = x[c] * g * op;
            float y = 0.5f * (shape(0.5f * (prev_[c] + v), k) + shape(v, k));
            prev_[c] = v;
            dc_[c] += dcCoef_ * (y - dc_[c]);
            y = (y - dc_[c]) / op;
            y = softOut(y * outGain_);
            x[c] = mix_ * y + (1.0f - mix_) * x[c];
        }
    }

private:
    static constexpr float kDrive = 0.55f;   ///< buisverzadiging bij Color 1
    static constexpr float kBias  = 0.12f;   ///< asymmetrie → even harmonischen

    /** Asymmetrische tanh met helling 1 in de oorsprong; k = 0 is schoon. */
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
    static float coef(float sr, float ms) { return 1.0f - std::exp(-1.0f / (0.001f * ms * sr)); }
    /** 10^(db/20), maar met exp: scheelt op de Teensy een hoop per sample. */
    static float dbToLin(float db) { return std::exp(db * 0.11512925f); }
    static float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

    float sr_ = 44100.0f;
    float peak_ = 0.0f, outGain_ = 1.0f, color_ = 1.0f, mix_ = 1.0f;
    bool  limit_ = false, bypass_ = false;
    float att_ = 0.01f, relFast_ = 0.001f, memCoef_ = 1e-5f;
    float fast_ = 0.0f, slow_ = 0.0f, mem_ = 0.0f;
    float relSlow_ = 0.0f, opGain_ = 1.0f;
    int   relCount_ = 0;
    float dc_[4] = {}, prev_[4] = {}, dcCoef_ = 0.001f;
};

}  // namespace mmb_dsp
