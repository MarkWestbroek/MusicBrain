#pragma once
// Shimmer reverb: de plaatgalm (mmb_dsp::Reverb, Dattorro) met in de lus een
// pitch-shifter. De natte galm wordt een interval omhoog geschoven (meestal
// een octaaf) en gaat, met `shimmer` als hoeveelheid, terug de galm in. Elke
// ronde komt er zo een laagje een interval hoger bij: een glinsterende wolk
// boven wat je speelt.
//
// De shifter is de korrel-versie (GrainShifter): een galm is diffuus en
// akkoordrijk, daar is een korrel-shifter gladder dan twee koppen. Een
// tone-filter (hoogdoorlaat + laagdoorlaat) in de lus houdt het opbouwen in
// toom; een rem op de lusversterking (envelope-volger op de galm) en een
// zachte begrenzer voorkomen dat de lus wegloopt.
//
// Header-only; de galmpool komt van buiten (zoals bij Reverb).
#include <cmath>

#include "pitch_shift.h"
#include "reverb.h"

namespace mmb_dsp {

class Shimmer {
public:
    static int poolLength(float sr) { return Reverb::poolLength(sr); }

    void Init(float sr, float* pool, int poolLen) {
        sr_ = sr;
        rv_.Init(sr, pool, poolLen);
        rv_.set_mode(Reverb::kPlate);
        rv_.set_mix(1.0f);                                    // alleen nat; wij mengen
        line_.Init();
        gs_.Init(sr, 4242u);
        gs_.set_grain_ms(70.0f);
        gs_.set_jitter(0.25f);
        hpCoef_ = std::exp(-6.2831853f * 250.0f / sr);
        hpX_ = hpY_ = lp_ = 0.0f; fbSig_ = 0.0f; env_ = 0.0f;
        envA_ = 1.0f - std::exp(-1.0f / (0.005f * sr));
        envR_ = 1.0f - std::exp(-1.0f / (0.300f * sr));
        set_interval(12.0f); set_tone(0.6f);
    }
    bool ready() const { return rv_.ready(); }

    void set_size(float s)      { rv_.set_size(s); }
    void set_damp(float d)      { rv_.set_damp(d); }
    void set_predelay(float ms) { rv_.set_predelay(ms); }
    void set_mod(float m)       { rv_.set_mod(m); }
    void set_mix(float m)       { mix_ = m < 0.0f ? 0.0f : (m > 1.0f ? 1.0f : m); }
    /** Hoeveelheid terugvoer van de verschoven galm (0 = gewone plaat). */
    void set_shimmer(float s)   { shimmer_ = s < 0.0f ? 0.0f : (s > 1.0f ? 1.0f : s); }
    /** Interval in halve tonen (+12 octaaf, +7 kwint, +19, +24, −12). */
    void set_interval(float st) { gs_.set_ratio(shiftRatio(st)); }
    /** Helderheid van de shimmer-lus: 0 = donker (2 kHz), 1 = open (10 kHz). */
    void set_tone(float t) {
        t = t < 0.0f ? 0.0f : (t > 1.0f ? 1.0f : t);
        const float hz = 2000.0f * std::exp2(t * 2.32f);
        lpCoef_ = 1.0f - std::exp(-6.2831853f * hz / sr_);
    }

    /** In-place op x[0]/x[1]. */
    inline void Process(float* x) {
        if (!rv_.ready()) return;
        const float dryL = x[0], dryR = x[1];
        // De verschoven galm van de vorige stap gaat mee de galm in.
        float w[2] = { dryL + fbSig_, dryR + fbSig_ };
        rv_.Process(w);
        // Nat (mono) → shifter → tone → begrenzer → volgende ronde.
        const float wet = 0.5f * (w[0] + w[1]);
        line_.push(wet);
        // Rem op de lus: de galm versterkt zelf al; met de shifter erbij kan
        // de lusversterking boven 1 komen. Boven ~0,25 niveau draait de
        // terugvoer evenredig terug, zodat de wolk groeit tot een vast
        // niveau en daar blijft hangen in plaats van weg te lopen.
        const float a = wet < 0.0f ? -wet : wet;
        env_ += (a - env_) * (a > env_ ? envA_ : envR_);
        const float brake = env_ > 0.25f ? 0.25f / env_ : 1.0f;
        float s = gs_.Tick(line_);
        const float hp = s - hpX_ + hpCoef_ * hpY_;
        hpX_ = s; hpY_ = hp;
        lp_ += (hp - lp_) * lpCoef_;
        s = lp_ * shimmer_ * 0.6f * brake;
        fbSig_ = s / (1.0f + (s < 0.0f ? -s : s));             // zachte grens
        x[0] = dryL * (1.0f - mix_) + w[0] * mix_;
        x[1] = dryR * (1.0f - mix_) + w[1] * mix_;
    }

private:
    float sr_ = 44100.0f;
    Reverb rv_;
    ShiftLine line_;
    GrainShifter gs_;
    float mix_ = 0.4f, shimmer_ = 0.5f;
    float hpCoef_ = 0.96f, hpX_ = 0.0f, hpY_ = 0.0f, lpCoef_ = 0.3f, lp_ = 0.0f, fbSig_ = 0.0f;
    float env_ = 0.0f, envA_ = 0.01f, envR_ = 0.0001f;
};

}  // namespace mmb_dsp
