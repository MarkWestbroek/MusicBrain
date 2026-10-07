#pragma once
// Martenot: een stem naar de Ondes Martenot (Maurice Martenot, 1928). Wat
// het instrument maakt:
//
//   1. Een bijna zuivere toon (zwevingsoscillator), met een la ("tiroir")
//      vol schakelaars die klankkleuren erbij zetten. Ze zijn te combineren,
//      hier als mengknoppen:
//        O  onde       de zuivere golf (sinus);
//        C  creux      hol: alleen oneven boventonen (zacht vierkant);
//        G  gambe      strijkend, rijk (zaagtand);
//        N  nasillard  neuzig (smalle puls door een hoogdoorlaat);
//        8  octaviant  het octaaf erbij (dubbelzijdig gelijkgericht);
//        S  souffle    adem: ruis rond de toonhoogte.
//   2. De "touche d'intensité": een druktoets onder de linkerhand die het
//      volume maakt. Het klavier (of de ring aan de draad) kiest alleen de
//      toonhoogte; zonder druk klinkt er niets. `touche` 1 = zo (volume =
//      druk, dus aftertouch of het lint); 0 = gewoon klavier (gate en
//      aanslag), met druk als zwelling erbovenop.
//   3. Vibrato door de toets opzij te wiegen: `vib` (diepte, halve toon) op
//      `vib_rate`, geschaald met `vib_cv` (het modwiel); en `glide` voor
//      het glijden van de ring.
//   4. De luidsprekers ("diffuseurs") zijn een eigen module, DIFFUSEUR
//      (diffuseur.h): ze horen na de stemmen, één kast voor alle stemmen,
//      en ze kunnen ook achter iets anders. Hier alleen `bright`: hoe dof of
//      helder de toon de kast in gaat.
//
// Eigen model op het oor naar de beschrijvingen van het instrument; geen
// schakelingssimulatie. Header-only; gedeeld door Teensy en browser.
#include <cmath>
#include <cstdint>

#include "oversample.h"

namespace mmb_dsp {

class Martenot {
public:
    enum Control {
        Coarse, Fine, Onde, Creux, Gambe, Nasillard, Octaviant, Souffle, Touche, Attack, Release, Glide,
        Vib, VibRate, Bright, Level, kControls
    };
    // Gate als laatste: de aanslag leest vel van hetzelfde moment.
    enum CvIn { Voct, Vel, Press, VibCv, Gate, kCvIns };
    enum CvOut { Amp, kCvOuts };
    static constexpr float kDefaults[kControls] = {
        0, 0, 0.8f, 0, 0, 0, 0, 0.05f, 0, 6, 250, 0,
        0.15f, 5.5f, 0.6f, 0.8f };

    void Init(float sampleRate) {
        *this = Martenot();
        sr_ = finiteClamp(sampleRate, 8000, 192000, 44100);
        for (int c = 0; c < kControls; ++c) setControl(c, kDefaults[c]);
        voctSm_ = 0;
        prepare();
    }

    void setControl(int control, float value) {
        switch (control) {
            case Coarse:    coarse_ = finiteClamp(value, -36, 36, 0); break;
            case Fine:      fine_ = finiteClamp(value, -100, 100, 0); break;
            case Onde:      mix_[0] = finiteClamp(value, 0, 1, 0.8f); break;
            case Creux:     mix_[1] = finiteClamp(value, 0, 1, 0); break;
            case Gambe:     mix_[2] = finiteClamp(value, 0, 1, 0); break;
            case Nasillard: mix_[3] = finiteClamp(value, 0, 1, 0); break;
            case Octaviant: mix_[4] = finiteClamp(value, 0, 1, 0); break;
            case Souffle:   mix_[5] = finiteClamp(value, 0, 1, 0.05f); break;
            case Touche:    touche_ = value >= 0.5f ? 1 : 0; break;
            case Attack:    attack_ = coef(finiteClamp(value, 0.5f, 2000, 6)); break;
            case Release:   release_ = coef(finiteClamp(value, 1, 5000, 250)); break;
            case Glide:     glideMs_ = finiteClamp(value, 0, 2000, 0); glide_ = glideMs_ > 0 ? coef8(glideMs_) : 1; break;
            case Vib:       vib_ = finiteClamp(value, 0, 1, 0.15f); break;
            case VibRate:   vibRate_ = finiteClamp(value, 0.5f, 12, 5.5f); break;
            case Bright:    bright_ = finiteClamp(value, 0, 1, 0.6f); toneCoef_ = onePole(1500 + 9000 * bright_ * bright_); break;
            case Level:     level_ = finiteClamp(value, 0, 1, 0.8f); break;
            default: return;
        }
    }

    void setCv(int input, float value) {
        switch (input) {
            case Voct:  voct_ = finiteClamp(value, -6, 6, 0); break;
            case Vel:   vel_ = finiteClamp(value, 0, 1, 0); break;
            case Press: press_ = finiteClamp(value, 0, 1, 0); break;
            case VibCv: vibCv_ = finiteClamp(value, 0, 1, 0); break;
            case Gate: {
                const bool high = value >= 0.5f;
                if (high && !gate_) velLatched_ = vel_ > 0.001f ? vel_ : 0.8f;   // geen kabel: 0,8
                gate_ = high;
                break;
            }
            default: break;
        }
    }
    float cvOut(int output) const { return output == Amp ? amp_ : 0; }

    void Process(const float* const*, float* const* out, int frames) {
        for (int frame = 0; frame < frames; ++frame) {
            if ((counter_++ & 7) == 0) controlRate();

            // ── toon en tiroir ─────────────────────────────────────────────
            phase_ += inc_;
            if (phase_ >= 1) phase_ -= 1;
            const float w = 6.2831853f * phase_;
            const float s1 = std::sin(w);
            float y = mix_[0] * s1;
            if (mix_[1] > 0) {   // creux: 1, 1/3, 1/5 (oneven), alleen wat onder Nyquist past
                float c = s1;
                if (inc_ * 3 < 0.45f) c += std::sin(3 * w) * (1.0f / 3);
                if (inc_ * 5 < 0.45f) c += std::sin(5 * w) * (1.0f / 5);
                if (inc_ * 7 < 0.45f) c += std::sin(7 * w) * (1.0f / 7);
                y += mix_[1] * c * 0.85f;
            }
            if (mix_[2] > 0) y += mix_[2] * 0.6f * (2 * phase_ - 1 - blep(phase_, inc_));
            if (mix_[3] > 0) {   // nasillard: smalle puls, hoogdoorlaat
                float p = (phase_ < 0.15f ? 1.0f : 0.0f) + blep(phase_, inc_) * 0.5f;
                float q = phase_ - 0.15f; if (q < 0) q += 1;
                p -= blep(q, inc_) * 0.5f;
                nasLp_ += (p - nasLp_) * 0.08f;
                y += mix_[3] * 1.4f * (p - nasLp_);
            }
            if (mix_[4] > 0) y += mix_[4] * 0.9f * (2 * (s1 < 0 ? -s1 : s1) - 1.2732395f);   // |sin| zonder DC
            if (mix_[5] > 0) {   // souffle: ruis door een bandfilter op de toonhoogte
                rng_ = rng_ * 1664525u + 1013904223u;
                const float n = static_cast<float>(static_cast<int32_t>(rng_)) * (1.0f / 2147483648.0f);
                y += mix_[5] * 2.5f * svfBand(n);
            }

            // ── touche en klavier ──────────────────────────────────────────
            float target;
            if (touche_) target = press_;                                             // alleen druk
            else target = gate_ ? finiteClamp(velLatched_ * 0.75f + press_ * 0.5f, 0, 1, 0) : 0;
            amp_ += (target - amp_) * (target > amp_ ? attack_ : release_);
            float x = y * amp_ * amp_ * 0.7f + y * amp_ * 0.3f;   // iets steiler: zacht is echt zacht

            // ── toon de kast in: hoog eraf (bright), laag eraf ─────────────
            tone_ += (x - tone_) * toneCoef_;
            hp_ += (tone_ - hp_) * hpCoef_;
            float s = (tone_ - hp_) * level_;
            s = s / (1 + 0.25f * (s < 0 ? -s : s));               // zachte grens
            out[0][frame] = s;
        }
    }

private:
    float coef(float ms) const { return 1 - std::exp(-1 / (ms * 0.001f * sr_)); }
    float coef8(float ms) const { return 1 - std::exp(-8 / (ms * 0.001f * sr_)); }   // per 8 samples
    float onePole(float hz) const { return 1 - std::exp(-6.2831853f * hz / sr_); }

    static float blep(float t, float dt) {
        if (dt <= 0) return 0;
        if (t < dt) { t /= dt; return t + t - t * t - 1; }
        if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
        return 0;
    }

    /** TPT-bandfilter voor de souffle (op de toonhoogte, Q ~3). */
    inline float svfBand(float x) {
        const float v3 = x - sb2_;
        const float v1 = sa1_ * sb1_ + sa2_ * v3;
        const float v2 = sb2_ + sa2_ * sb1_ + sa3_ * v3;
        sb1_ = 2 * v1 - sb1_;
        sb2_ = 2 * v2 - sb2_;
        return v1;
    }

    void controlRate() {
        voctSm_ += (voct_ - voctSm_) * glide_;
        vibPh_ += 8 * vibRate_ / sr_;
        if (vibPh_ >= 1) vibPh_ -= 1;
        prepare();
    }
    void prepare() {
        // Vibrato: altijd een beetje (vib), het modwiel zet er meer bij.
        const float depth = vib_ * (0.25f + 0.75f * vibCv_);
        const float vibSemi = depth * std::sin(6.2831853f * vibPh_);
        const float hz = 261.6256f * std::exp2(voctSm_ + (coarse_ + vibSemi) / 12 + fine_ / 1200);
        inc_ = finiteClamp(hz / sr_, 0, 0.45f, 0.006f);
        // Souffle-bandfilter op de toonhoogte.
        const float f = finiteClamp(hz, 40, 0.45f * sr_, 440);
        const float g = std::tan(3.14159265f * f / sr_);
        const float k = 1.0f / 3;
        sa1_ = 1 / (1 + g * (g + k));
        sa2_ = g * sa1_;
        sa3_ = g * sa2_;
    }

    float sr_ = 44100;
    float coarse_ = 0, fine_ = 0;
    float mix_[6] = { 0.8f, 0, 0, 0, 0, 0.05f };
    int   touche_ = 0;
    float attack_ = 0.01f, release_ = 0.001f, glide_ = 1, glideMs_ = 0;
    float vib_ = 0.15f, vibRate_ = 5.5f, vibPh_ = 0;
    float bright_ = 0.6f, toneCoef_ = 0.5f, hpCoef_ = 0.012f, level_ = 0.8f;
    float voct_ = 0, voctSm_ = 0, vel_ = 0, velLatched_ = 0.8f, press_ = 0, vibCv_ = 0;
    bool  gate_ = false;
    float phase_ = 0, inc_ = 0.006f, amp_ = 0, nasLp_ = 0, tone_ = 0, hp_ = 0;
    float sa1_ = 0, sa2_ = 0, sa3_ = 0, sb1_ = 0, sb2_ = 0;
    uint32_t counter_ = 0, rng_ = 4242u;
};

}  // namespace mmb_dsp
