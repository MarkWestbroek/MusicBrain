#pragma once
// Ladder: Moog-achtig 4-polig laagdoorlaatfilter (tp_mmb_ladder).
//
// Het algoritme is dat van `AudioFilterLadder` uit de Teensy Audio Library:
// Huovilainen's "New Moog" (CMJ, juni 2006), voor de Teensy uitgewerkt door
// Richard van Hoesel (2021). filter_ladder.cpp, Copyright (c) Paul
// Stoffregen, PJRC.COM, LLC; MIT-licentie; "please retain this header if you
// use this code." Vier eenpolers met een tanh in de terugkoppeling,
// gecompenseerd laagverlies (`kPassbandComp`, 0,5 zoals de bibliotheek) en
// dezelfde cutoff-, resonantie- en drive-wetten, dus hij klinkt hetzelfde.
//
// Eigen kopie sinds fw 0.5.103 (doc/dsp-check-2026-10.md §5): de bibliotheek
// overbemonsterde met een FIR van 36 taps en zette de uitgang zonder klem om
// naar 16 bit, zodat hij boven ±1 omklapte; met een zaag op Drive 4 gaf dat
// −35 dB aliasing. Hier: ons eigen 4×-filter (oversample.h, 65 taps) en een
// zachte uitgangsbegrenzer (adaa.h), ook op de 4×-rate. In de terugkoppellus géén ADAA: de
// halve sample vertraging zou de resonantie verstemmen.
//
// CV zoals de module altijd deed: `cv` verschuift de cutoff met `cv_amt`
// octaven per volle schaal, `q_cv` telt `q_cv_amt` resonantie-eenheden per
// volle schaal op (beide als gelijkspanning tot ±1 begrensd, met een lineaire
// glij van 2 ms), `drive_cv` vermenigvuldigt de drive met 2^(2·amt·cv).
// Header-only; gedeeld door Teensy en browser.
#include <cmath>

#include "adaa.h"
#include "oversample.h"

namespace mmb_dsp {

class Ladder {
public:
    enum Control { Cutoff, Q, Drive, CvAmt, QCvAmt, DriveCvAmt, kControls };
    enum CvIn { Cv, QCv, DriveCv, kCvIns };
    static constexpr int kCvOuts = 0;
    static constexpr float kDefaults[kControls] = { 2000, 0.7f, 1, 2, 0.5f, 0.5f };

    void Init(float sampleRate) {
        *this = Ladder();
        sr_ = finiteClamp(sampleRate, 8000, 192000, 44100);
        os_.Init();
        slewStep_ = 1.0f / (0.002f * sr_);
        for (int c = 0; c < kControls; ++c) setControl(c, kDefaults[c]);
    }

    void setControl(int control, float v) {
        switch (control) {
            case Cutoff: base_ = finiteClamp(v, 5, 0.425f * sr_, 2000); break;
            case Q: k_ = 4 * finiteClamp(v, 0, kMaxResonance, 0.7f); break;
            case Drive: driveBase_ = finiteClamp(v, 0, 4, 1); applyDrive(); break;
            case CvAmt: cvAmt_ = finiteClamp(v, 0, 7, 2); break;
            case QCvAmt: qCvAmt_ = finiteClamp(v, 0, 1, 0.5f); qTarget_ = clamp1(qCvRaw_ * qCvAmt_); break;
            case DriveCvAmt: driveCvAmt_ = finiteClamp(v, 0, 4, 0.5f); applyDrive(); break;
            default: break;
        }
    }
    void setCv(int input, float v) {
        const float x = finiteClamp(v, -10, 10, 0);
        if (input == Cv) fcTarget_ = clamp1(x);
        else if (input == QCv) { qCvRaw_ = x; qTarget_ = clamp1(x * qCvAmt_); }
        else if (input == DriveCv) { driveCv_ = clamp1(x); applyDrive(); }
    }
    float cvOut(int) const { return 0; }

    void Process(const float* const* in, float* const* out, int frames) {
        const float* input = in[0];
        for (int n = 0; n < frames; ++n) {
            // CV-gelijkspanningen glijden lineair (2 ms), zoals de DC-objecten.
            fc_ = glide(fc_, fcTarget_);
            q_ = glide(q_, qTarget_);
            // Coëfficiënten alleen opnieuw als de frequentie verandert (een
            // envelope op `cv` doet dat elke sample; een stilstaande knop niet),
            // met de snelle exp2 van de bibliotheek: op de Teensy telt het.
            const float oct = fc_ * cvAmt_;
            if (oct != lastOct_ || base_ != lastBase_) {
                lastOct_ = oct; lastBase_ = base_;
                float f = base_ * fastExp2(oct);
                if (f > 0.425f * sr_) f = 0.425f * sr_;
                coefficients(f);
            }
            float kTot = k_ + 4 * q_;
            kTot = kTot < 0 ? 0 : kTot > 4 * kMaxResonance ? 4 * kMaxResonance : kTot;
            const float kq = kTot * qAdjust_;
            const float x = input ? finiteClamp(input[n], -8, 8, 0) * overdrive_ : 0;
            const float y = os_.process(x, [this, kq](float s) {
                const float u = fastTanh(s - (z1_[3] - kPassbandComp * s) * kq);
                // Begrenzer op de 4×-rate, na de vierde pool (buiten de lus).
                return limit_.f(pole(pole(pole(pole(u, 0), 1), 2), 3) * kMakeup);
            });
            out[0][n] = y;
        }
    }

private:
    static constexpr float kMaxResonance = 1.8f;
    static constexpr float kPassbandComp = 0.5f;
    /** Het interpolatiefilter van de bibliotheek versterkte ~1,1× (+0,85 dB);
     *  zo blijven bestaande patches even luid. */
    static constexpr float kMakeup = 1.1f;
    static float clamp1(float v) { return v < -1 ? -1 : v > 1 ? 1 : v; }
    float glide(float cur, float target) const {
        const float d = target - cur;
        return d > slewStep_ ? cur + slewStep_ : d < -slewStep_ ? cur - slewStep_ : target;
    }
    /** De drive zoals de bibliotheek: boven 1 telt de helft (1 − compensatie). */
    void applyDrive() {
        const float d = finiteClamp(driveBase_ * std::exp2(2 * driveCvAmt_ * driveCv_), 0, 4, 1);
        overdrive_ = d > 1 ? 1 + (d - 1) * (1 - kPassbandComp) : d;
    }
    void coefficients(float c) {
        const float wc = c * (2 * 3.14159265f / (Oversampler4::kFactor * sr_));
        const float wc2 = wc * wc;
        alpha_ = 0.9892f * wc - 0.4324f * wc2 + 0.1381f * wc * wc2 - 0.0202f * wc2 * wc2;
        qAdjust_ = 1.006f + 0.0536f * wc - 0.095f * wc2 - 0.05f * wc2 * wc2;
    }
    float pole(float s, int i) {
        float ft = s * (1 / 1.3f) + (0.3f / 1.3f) * z0_[i] - z1_[i];
        ft = ft * alpha_ + z1_[i];
        z1_[i] = ft;
        z0_[i] = s;
        return ft;
    }
    /** 2^x, snel (uit de bibliotheek): (1 + f·ln2/256)^256 voor het breukdeel. */
    static float fastExp2(float x) {
        float i;
        float f = std::modf(x, &i);
        f *= 0.693147f / 256.0f;
        f += 1.0f;
        f *= f; f *= f; f *= f; f *= f; f *= f; f *= f; f *= f; f *= f;
        return std::ldexp(f, static_cast<int>(i));
    }
    /** Padé-benadering van tanh; glad tot ±3 (de afgeleide is daar 0), dan vlak. */
    static float fastTanh(float x) {
        if (x > 3) return 1;
        if (x < -3) return -1;
        const float x2 = x * x;
        return x * (27 + x2) / (27 + 9 * x2);
    }

    Oversampler4 os_;
    KneeShape limit_{0.9f};
    float sr_ = 44100, slewStep_ = 0.01f;
    float base_ = 2000, k_ = 2.8f, driveBase_ = 1, overdrive_ = 1;
    float cvAmt_ = 2, qCvAmt_ = 0.5f, driveCvAmt_ = 0.5f, driveCv_ = 0, qCvRaw_ = 0;
    float fcTarget_ = 0, qTarget_ = 0, fc_ = 0, q_ = 0;
    float alpha_ = 1, qAdjust_ = 1, lastOct_ = -1e9f, lastBase_ = -1;
    float z0_[4] = {}, z1_[4] = {};
};

}  // namespace mmb_dsp
