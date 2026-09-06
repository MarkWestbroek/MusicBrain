#pragma once
/**
 * @file env_follower.h
 * @brief Envelope follower — audio in, stuurspanning uit, plus een gate.
 * @details
 * Header-only, float, samplerate-onafhankelijk; geen Arduino/Teensy-
 * afhankelijkheden. Dezelfde code draait in `EnvFollowerModule.h` (Teensy,
 * 44,1 kHz) en in de browser-simulator (`tools/mmb-wasm/envfollower_wasm.cc`),
 * zodat sim en hardware per definitie hetzelfde doen.
 *
 * Per sample:
 *
 *                ┌─ peak: |x| ────────────────────────┐
 *     in ────────┤                                    ├─► one-pole (attack/
 *                └─ rms:  √(x² door 10 ms-middeling) ─┘    release) ─┬─► ×sens ─► env
 *                                                                    └─► drempel ─► gate
 *
 * De RMS-tak middelt eerst **symmetrisch** over een vast venster van 10 ms
 * en trekt daarna de wortel. Dat is niet optioneel: de attack/release-one-pole
 * is asymmetrisch, en een asymmetrische volger op x² klimt naar de *piek* van
 * de rimpel in plaats van naar het gemiddelde — dan meet "RMS" gewoon weer
 * piek (√0,25 = 0,5 voor een sinus van 0,5, in plaats van 0,354). Door eerst
 * te middelen loopt de attack/release in beide modi in het amplitude-domein
 * en betekenen de tijden in beide standen hetzelfde.
 *
 * De gate heeft een vaste hysterese van 25 % onder de drempel — genoeg om
 * geklepper op een langzaam uitstervende staart te voorkomen, zonder er nog
 * een knop bij te hoeven zetten.
 */

#include <cmath>

namespace mmb_dsp {

class EnvFollower {
public:
    enum Mode { kPeak = 0, kRms = 1 };

    /** Gate valt terug op deze fractie van `thresh`. */
    static constexpr float kHysteresis = 0.75f;
    /** Vast middelingsvenster van de RMS-tak, in seconden. */
    static constexpr float kRmsWindowS = 0.010f;

    void Init(float sr) {
        sr_ = (sr > 1.0f) ? sr : 44100.0f;
        ms_ = 0.0f;
        det_ = 0.0f;
        env_ = 0.0f;
        gate_ = false;
        recalc();
    }

    /** @param ms Attack-tijdconstante in milliseconden (0,05 … 500). */
    void set_attack_ms(float ms)  { attackMs_  = clampf(ms, 0.05f, 500.0f);  recalc(); }
    /** @param ms Release-tijdconstante in milliseconden (1 … 5000). */
    void set_release_ms(float ms) { releaseMs_ = clampf(ms, 1.0f,  5000.0f); recalc(); }
    /** @param db Gevoeligheid in dB (−24 … +48) op het gedetecteerde niveau. */
    void set_sens_db(float db)    { gain_ = powf(10.0f, clampf(db, -24.0f, 48.0f) / 20.0f); }
    /** @param mode kPeak (transiënt) of kRms (gemiddeld vermogen). */
    void set_mode(int mode)       { mode_ = (mode == kRms) ? kRms : kPeak; }
    /** @param t Gate-drempel op de uitgang (0 … 1). 0 houdt de gate laag. */
    void set_threshold(float t)   { thresh_ = clampf(t, 0.0f, 1.0f); }

    /** Eén blok audio erdoorheen. Werkt env() en gate() bij. */
    void ProcessBlock(const float* in, int n) {
        float det = det_;
        if (mode_ == kRms) {
            float ms = ms_;
            for (int k = 0; k < n; ++k) {
                ms += (in[k] * in[k] - ms) * rmsCoef_;
                const float d = sqrtf(ms);
                det += (d - det) * (d > det ? aCoef_ : rCoef_);
            }
            ms_ = flush(ms);
        } else {
            for (int k = 0; k < n; ++k) {
                const float d = fabsf(in[k]);
                det += (d - det) * (d > det ? aCoef_ : rCoef_);
            }
        }
        det_ = flush(det);

        env_ = clampf(det_ * gain_, 0.0f, 1.0f);
        gate_ = thresh_ > 0.0f
             && env_ >= (gate_ ? thresh_ * kHysteresis : thresh_);
    }

    /** Gevolgde envelope, 0 … 1. */
    float env() const { return env_; }
    /** Envelope boven de drempel (met hysterese). */
    bool  gate() const { return gate_; }

private:
    static float clampf(float v, float lo, float hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }
    /** Denormals kosten op de Teensy niets maar in wasm wél; onder −200 dB
     *  is het toch stilte. */
    static float flush(float v) { return (v > 1e-20f) ? v : 0.0f; }

    /** One-pole coëfficiënt voor tijdconstante `s` seconden op `sr_`. */
    float coefFor(float s) const { return 1.0f - expf(-1.0f / (s * sr_)); }

    void recalc() {
        aCoef_   = coefFor(attackMs_  * 0.001f);
        rCoef_   = coefFor(releaseMs_ * 0.001f);
        rmsCoef_ = coefFor(kRmsWindowS);
    }

    float sr_        = 44100.0f;
    float attackMs_  = 5.0f;
    float releaseMs_ = 120.0f;
    float gain_      = 1.0f;
    float thresh_    = 0.1f;
    int   mode_      = kRms;

    float aCoef_   = 0.0f;
    float rCoef_   = 0.0f;
    float rmsCoef_ = 0.0f;
    float ms_      = 0.0f;  ///< Lopend gemiddeld kwadraat (alleen RMS-modus).
    float det_     = 0.0f;  ///< Detector na attack/release, amplitude-domein.
    float env_     = 0.0f;
    bool  gate_    = false;
};

}  // namespace mmb_dsp
