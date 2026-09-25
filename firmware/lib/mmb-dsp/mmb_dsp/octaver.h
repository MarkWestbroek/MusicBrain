#pragma once
// Octaver in de stijl van de klassieke analoge octaafpedalen (OC-2-familie):
// geen pitch-shifting maar een flip-flop. De ingang gaat door een tracking-
// laagdoorlaat, een comparator maakt er een blokgolf van, en twee delers
// geven f/2 en f/4. Die blokgolven worden vermenigvuldigd met de envelope
// van de ingang (zodat ze mee-ademen), afgerond door een laagdoorlaat (`tone`)
// en bij het droge signaal opgeteld. "Up" is de Octavia-truc: dubbelfasig
// gelijkrichten (|x|) en hoogdoorlaten geeft een octaaf omhoog.
//
// Werkt het best op monofoon, redelijk zuiver materiaal (bas, lead), net als
// het origineel; op akkoorden gaat het net zo mooi mis.
#include <cmath>

namespace mmb_dsp {

class Octaver {
public:
    void Init(float sr) {
        sr_ = sr;
        trackCoef_ = 1.0f - std::exp(-6.2831853f * 900.0f / sr);
        envA_ = 1.0f - std::exp(-1.0f / (0.002f * sr));
        envR_ = 1.0f - std::exp(-1.0f / (0.060f * sr));
        hpCoef_ = std::exp(-6.2831853f * 40.0f / sr);
        set_tone(0.5f);
        track_ = 0.0f; env_ = 0.0f; ff1_ = 1.0f; ff2_ = 1.0f; above_ = false;
        lp1_[0] = lp1_[1] = lp2_[0] = lp2_[1] = 0.0f; hpX_ = 0.0f; hpY_ = 0.0f;
    }

    void set_dry(float v)  { dry_  = clamp01(v); }
    void set_oct1(float v) { oct1_ = clamp01(v); }
    void set_oct2(float v) { oct2_ = clamp01(v); }
    void set_up(float v)   { up_   = clamp01(v); }
    /** Afronding van de sub-blokgolven: 0 = dof (bijna sinus), 1 = hoekig. */
    void set_tone(float t) {
        tone_ = clamp01(t);
        const float hz = 150.0f * std::exp2(tone_ * 5.0f);     // 150 Hz .. 4,8 kHz
        lpCoef_ = 1.0f - std::exp(-6.2831853f * hz / sr_);
    }

    inline float Process(float in) {
        // Tracking: laagdoorlaat zodat de grondtoon de nuldoorgangen bepaalt,
        // en een comparator met wat hysterese tegen dubbel klappen.
        track_ += (in - track_) * trackCoef_;
        const float hyst = 0.02f * (env_ + 0.01f);
        if (!above_ && track_ > hyst)       { above_ = true;  ff1_ = -ff1_; if (ff1_ > 0.0f) ff2_ = -ff2_; }
        else if (above_ && track_ < -hyst)  { above_ = false; }

        // Envelope van de ingang: snel op, rustig af.
        const float a = in < 0.0f ? -in : in;
        env_ += (a - env_) * (a > env_ ? envA_ : envR_);

        // Sub-octaven: blokgolf × envelope, twee polen laagdoorlaat.
        float s1 = ff1_ * env_ * 1.4f, s2 = ff2_ * env_ * 1.4f;
        lp1_[0] += (s1 - lp1_[0]) * lpCoef_; lp1_[1] += (lp1_[0] - lp1_[1]) * lpCoef_;
        lp2_[0] += (s2 - lp2_[0]) * lpCoef_; lp2_[1] += (lp2_[0] - lp2_[1]) * lpCoef_;

        // Octaaf omhoog: gelijkrichten en de DC eraf.
        const float rect = a * 2.0f - env_;
        const float hp = rect - hpX_ + hpCoef_ * hpY_;
        hpX_ = rect; hpY_ = hp;

        return in * dry_ + lp1_[1] * oct1_ + lp2_[1] * oct2_ + hp * up_;
    }

private:
    static float clamp01(float v) { return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }

    float sr_ = 44100.0f;
    float trackCoef_ = 0.1f, envA_ = 0.01f, envR_ = 0.001f, lpCoef_ = 0.1f, hpCoef_ = 0.99f;
    float dry_ = 1.0f, oct1_ = 0.7f, oct2_ = 0.0f, up_ = 0.0f, tone_ = 0.5f;
    float track_ = 0.0f, env_ = 0.0f, ff1_ = 1.0f, ff2_ = 1.0f;
    bool  above_ = false;
    float lp1_[2] = { 0.0f, 0.0f }, lp2_[2] = { 0.0f, 0.0f };
    float hpX_ = 0.0f, hpY_ = 0.0f;
};

}  // namespace mmb_dsp
