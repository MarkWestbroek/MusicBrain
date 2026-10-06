#pragma once
// Mixtur: een stem naar het Mixtur-Trautonium van Oskar Sala. Drie dingen
// maken dat instrument:
//
//   1. Een glimlamp-oscillator. Een condensator laadt op via een weerstand
//      en ontlaadt in één klap door een neonlamp zodra de ontsteekspanning
//      bereikt is (relaxatie-oscillator): een zaagtand met een gebogen flank
//      (de laadcurve) en een harde val. `curve` = hoe krom (0 = recht, 1 =
//      sterk verzadigend), `unrest` = de kleine onrust per periode van een
//      echte lamp.
//   2. Ondertonen in plaats van boventonen. Vier frequentiedelers tellen de
//      perioden van de hoofdtoon en geven f/n (n = 1..24): de ondertoonreeks.
//      Ze lopen exact in fase met de hoofdtoon mee, zoals de delers in het
//      instrument, en hebben dezelfde golfvorm. De mengverhouding van
//      hoofdtoon en vier ondertonen is een "mixtuur": een akkoord uit de
//      ondertoonreeks dat meeschuift met de toonhoogte. `sub_cv` schaalt de
//      vier ondertonen samen (pedaal).
//   3. Vaste formantfilters. Drie parallelle bandfilters op vaste
//      frequenties die niet meebewegen met de toonhoogte: daardoor klinkt
//      het als een stem of een blaasinstrument en verandert de kleur als je
//      over het bereik glijdt. Vijf klinkerinstellingen (A, E, I, O, U),
//      `fshift` schuift ze samen, `form_cv` glijdt tussen de klinkers.
//
// Dynamiek: `dyn` 0 = aanslagsterkte (vel, gelatcht bij de aanslag), 1 =
// druk (press, continu — zoals de druk op de draad van het instrument).
// `glide` maakt de toonhoogte traploos glijdend voor wie op toetsen speelt.
// Eigen model op het oor naar de beschrijvingen van het instrument; geen
// schakelingssimulatie. Header-only; gedeeld door Teensy en browser.
#include <cmath>
#include <cstdint>

#include "oversample.h"

namespace mmb_dsp {

class Mixtur {
public:
    enum Control {
        Coarse, Fine, Curve, Unrest, Main, Div1, Div2, Div3, Div4, Sub1, Sub2, Sub3, Sub4,
        Formant, FShift, FReso, FMix, Noise, Dyn, Attack, Release, Glide, Level, kControls
    };
    // Gate als laatste: de aanslag leest vel van hetzelfde moment.
    enum CvIn { Voct, Vel, Press, SubCv, FormCv, Gate, kCvIns };
    enum CvOut { Amp, kCvOuts };
    static constexpr float kDefaults[kControls] = {
        0, 0, 0.55f, 0.25f, 0.8f, 2, 3, 4, 5, 0.6f, 0.45f, 0.3f, 0.0f,
        1, 0, 0.55f, 0.7f, 0.03f, 0, 8, 120, 0, 0.8f };
    static constexpr int kSubs = 4;

    void Init(float sampleRate) {
        *this = Mixtur();
        sr_ = finiteClamp(sampleRate, 8000, 192000, 44100);
        for (int c = 0; c < kControls; ++c) setControl(c, kDefaults[c]);
        voctSm_ = 0; prepare();
    }

    void setControl(int control, float value) {
        switch (control) {
            case Coarse:  coarse_ = finiteClamp(value, -36, 36, 0); break;
            case Fine:    fine_ = finiteClamp(value, -100, 100, 0); break;
            case Curve:   curve_ = finiteClamp(value, 0, 1, 0.55f); buildShape(); break;
            case Unrest:  unrest_ = finiteClamp(value, 0, 1, 0.25f); break;
            case Main:    main_ = finiteClamp(value, 0, 1, 0.8f); break;
            case Div1: case Div2: case Div3: case Div4: {
                const int i = control - Div1;
                div_[i] = static_cast<int>(finiteClamp(value, 1, 24, 2) + 0.5f);
                if (count_[i] >= div_[i]) count_[i] = 0;
                break;
            }
            case Sub1: case Sub2: case Sub3: case Sub4: sub_[control - Sub1] = finiteClamp(value, 0, 1, 0); break;
            case Formant: formant_ = static_cast<int>(finiteClamp(value, 0, 5, 1) + 0.5f); break;
            case FShift:  fshift_ = finiteClamp(value, -12, 12, 0); break;
            case FReso:   freso_ = finiteClamp(value, 0, 1, 0.55f); break;
            case FMix:    fmix_ = finiteClamp(value, 0, 1, 0.7f); break;
            case Noise:   noise_ = finiteClamp(value, 0, 1, 0.03f); break;
            case Dyn:     dyn_ = value >= 0.5f ? 1 : 0; break;
            case Attack:  attack_ = coef(finiteClamp(value, 0.5f, 2000, 8)); break;
            case Release: release_ = coef(finiteClamp(value, 1, 5000, 120)); break;
            case Glide:   glideMs_ = finiteClamp(value, 0, 2000, 0); glide_ = glideMs_ > 0 ? coef8(glideMs_) : 1; break;
            case Level:   level_ = finiteClamp(value, 0, 1, 0.8f); break;
            default: return;
        }
    }

    void setCv(int input, float value) {
        switch (input) {
            case Voct:   voct_ = finiteClamp(value, -6, 6, 0); break;
            case Vel:    vel_ = finiteClamp(value, 0, 1, 0); break;
            case Press:  press_ = finiteClamp(value, 0, 1, 0); break;
            case SubCv:  subCv_ = finiteClamp(value, -1, 1, 0); break;
            case FormCv: formCv_ = finiteClamp(value, 0, 1, 0); break;
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

            // ── glimlamp + ondertoondelers ─────────────────────────────────
            phase_ += inc_;
            bool wrapped = false;
            if (phase_ >= 1) {
                phase_ -= 1; wrapped = true;
                // Onrust: de volgende periode een fractie langer of korter.
                rng_ = rng_ * 1664525u + 1013904223u;
                jitter_ = 1 + unrest_ * 0.006f * (static_cast<float>(rng_ >> 9) * (1.0f / 4194304.0f) - 1);
            }
            float y = main_ * (shape(phase_) - blep(phase_, inc_));
            float subSum = 0;
            for (int i = 0; i < kSubs; ++i) {
                if (wrapped && ++count_[i] >= div_[i]) count_[i] = 0;
                if (sub_[i] <= 0) continue;
                const float dt = inc_ / div_[i];
                const float p = (static_cast<float>(count_[i]) + phase_) / div_[i];
                subSum += sub_[i] * (shape(p) - blep(p, dt));
            }
            y += subSum * subGain_;
            y *= mixNorm_;

            // Ruis (de lucht in de lamp), meegewogen met de dynamiek.
            rng2_ = rng2_ * 22695477u + 1u;
            y += noise_ * 0.6f * (static_cast<float>(static_cast<int32_t>(rng2_)) * (1.0f / 2147483648.0f));

            // ── vaste formantfilters ───────────────────────────────────────
            float wet = y;
            if (formant_ > 0) {
                float f = 0;
                for (int k = 0; k < 3; ++k) f += fgain_[k] * bandpass(k, y);
                wet = y * (1 - fmix_) + f * fmix_ * 1.6f;
            }

            // ── dynamiek ───────────────────────────────────────────────────
            const float target = gate_ ? (dyn_ ? press_ : velLatched_) : 0;
            amp_ += (target - amp_) * (target > amp_ ? attack_ : release_);
            float s = wet * amp_ * level_ * 0.9f;
            s = s / (1 + 0.3f * (s < 0 ? -s : s));                  // zachte grens
            out[0][frame] = s;
        }
    }

private:
    static constexpr int kTable = 256;
    // Klinkers (mannenstem, F1..F3 in Hz) en hun gewichten.
    static constexpr float kVowels[5][3] = {
        { 730, 1090, 2440 },   // A
        { 530, 1840, 2480 },   // E
        { 270, 2290, 3010 },   // I
        { 570,  840, 2410 },   // O
        { 300,  870, 2240 },   // U
    };

    float coef(float ms) const { return 1 - std::exp(-1 / (ms * 0.001f * sr_)); }
    float coef8(float ms) const { return 1 - std::exp(-8 / (ms * 0.001f * sr_)); }   // per 8 samples

    /** Laadcurve van de condensator, genormaliseerd naar −1..+1. */
    void buildShape() {
        const float c = 0.05f + 4.5f * curve_;
        const float norm = 1 - std::exp(-c);
        for (int i = 0; i <= kTable; ++i) {
            const float p = static_cast<float>(i) / kTable;
            table_[i] = 2 * (1 - std::exp(-c * p)) / norm - 1;
        }
        // De rechte zaagtand heeft gemiddeld 0; een kromme niet: DC eraf.
        float mean = 0;
        for (int i = 0; i < kTable; ++i) mean += table_[i];
        dc_ = mean / kTable;
    }
    inline float shape(float p) const {
        const float x = p * kTable;
        int i = static_cast<int>(x);
        if (i >= kTable) i = kTable - 1;
        const float f = x - static_cast<float>(i);
        return table_[i] + (table_[i + 1] - table_[i]) * f - dc_;
    }
    /** polyBLEP voor de val van +1 naar −1 bij de ontlading. */
    static float blep(float t, float dt) {
        if (dt <= 0) return 0;
        if (t < dt) { t /= dt; return t + t - t * t - 1; }
        if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
        return 0;
    }
    /** TPT state-variable bandpass, genormaliseerd op 1 in de top. */
    inline float bandpass(int k, float x) {
        const float v3 = x - ic2_[k];
        const float v1 = a1_[k] * ic1_[k] + a2_[k] * v3;
        const float v2 = ic2_[k] + a2_[k] * ic1_[k] + a3_[k] * v3;
        ic1_[k] = 2 * v1 - ic1_[k];
        ic2_[k] = 2 * v2 - ic2_[k];
        return v1 * damp_;
    }

    void controlRate() {
        voctSm_ += (voct_ - voctSm_) * glide_;
        prepare();
    }
    void prepare() {
        const float hz = 261.6256f * std::exp2(voctSm_ + coarse_ / 12 + fine_ / 1200);
        inc_ = finiteClamp(hz * jitter_ / sr_, 0, 0.45f, 0.006f);
        subGain_ = finiteClamp(1 + subCv_, 0, 2, 1);
        float total = main_;
        for (int i = 0; i < kSubs; ++i) total += sub_[i] * subGain_;
        mixNorm_ = total > 1 ? 1 / (0.6f + 0.4f * total) : 1;
        if (formant_ > 0) {
            // Positie in de klinkerrij: knop + CV, tussen twee klinkers in.
            float pos = static_cast<float>(formant_ - 1) + formCv_ * 4;
            if (pos > 4) pos = 4;
            const int a = static_cast<int>(pos), b = a < 4 ? a + 1 : 4;
            const float t = pos - static_cast<float>(a);
            const float shift = std::exp2(fshift_ / 12);
            const float q = 2 + 18 * freso_ * freso_;
            const float k = 1 / q;
            damp_ = k;                                           // top van elk bandfilter = 1
            for (int i = 0; i < 3; ++i) {
                float f = (kVowels[a][i] + (kVowels[b][i] - kVowels[a][i]) * t) * shift;
                f = finiteClamp(f, 60, 0.45f * sr_, 1000);
                const float g = std::tan(3.14159265f * f / sr_);
                a1_[i] = 1 / (1 + g * (g + k));
                a2_[i] = g * a1_[i];
                a3_[i] = g * a2_[i];
            }
        }
    }

    float sr_ = 44100;
    float coarse_ = 0, fine_ = 0, curve_ = 0.55f, unrest_ = 0.25f, main_ = 0.8f;
    int   div_[kSubs] = { 2, 3, 4, 5 }, count_[kSubs] = { 0, 0, 0, 0 };
    float sub_[kSubs] = { 0.6f, 0.45f, 0.3f, 0 };
    int   formant_ = 1, dyn_ = 0;
    float fshift_ = 0, freso_ = 0.55f, fmix_ = 0.7f, noise_ = 0.03f;
    float attack_ = 0.01f, release_ = 0.001f, glide_ = 1, glideMs_ = 0, level_ = 0.8f;
    float voct_ = 0, voctSm_ = 0, vel_ = 0, velLatched_ = 0.8f, press_ = 0, subCv_ = 0, formCv_ = 0;
    bool  gate_ = false;
    float phase_ = 0, inc_ = 0.006f, jitter_ = 1, subGain_ = 1, mixNorm_ = 1, amp_ = 0;
    float table_[kTable + 1] = {}, dc_ = 0;
    float a1_[3] = {}, a2_[3] = {}, a3_[3] = {}, ic1_[3] = {}, ic2_[3] = {}, damp_ = 1;
    float fgain_[3] = { 1.0f, 0.6f, 0.35f };
    uint32_t counter_ = 0, rng_ = 12345u, rng2_ = 777u;
};

}  // namespace mmb_dsp
