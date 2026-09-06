#pragma once
/**
 * @file korg35.h
 * @brief Korg35 (MS-20) Sallen-Key VCF met tanh-diodeclipper, float, header-only.
 * @details
 * Zero-delay-feedback (TPT) naar Will Pirkle's virtueel-analoge model (AN-5 /
 * AN-7), uit drie gedeelde one-pole TPT-secties:
 * - **LP** (12 dB/oct): `x → LPF1 → Σ → LPF2 → [×K] → y`, terugkoppeling
 *   `y → HPF1 → Σ`. Lus algebraïsch opgelost:
 *   `u = α0·(y1 + K·(1−G)²·s2 − (1−G)·s3)`, `α0 = 1/(1 − K·G + K·G²)`.
 * - **HP** (6 dB/oct, Korg35-typisch): `x → HPF1 → Σ → [×K] → y`,
 *   terugkoppeling `y → HPF2 → LPF1 → Σ`.
 * `K = 0,01 … 2,0` is de lusversterking; bij 2,0 oscilleert het filter. De
 * MS-20-"schreeuw" is de diodeclipper in de resonantielus: `u = tanh(drive·u)`
 * binnen de opgeloste lus. **2× oversampling** (zero-order hold, coëfficiënten
 * op de interne rate) laat de clipharmonischen minder terugvouwen.
 *
 * Dit is de kernel die vroeger in `Ms20Module.h` als `AudioStream` zat. Nu
 * zit dezelfde code in `Ms20Module` (Teensy), in de wasm-wrapper én per
 * stem-kanaal in `SamplePlayer` — het filter "in de cel" van de sampler is
 * letterlijk de MS-20 uit de catalogus.
 *
 * Gebruik: `Init(sr)`, per blok `Prepare()`, per sample `Tick(x)`.
 * Let op de kosten: 2 × tanh per sample. Acht stemmen × vier kanalen is 64
 * tanh per frame — op een Teensy 4.1 zo'n kwart tot de helft van de CPU.
 */
#include <cmath>

namespace mmb_dsp {

class Korg35 {
public:
    static constexpr int kOversample = 2;

    void Init(float sr) {
        sr_ = sr > 1.0f ? sr : 44100.0f;
        s1_ = s2_ = s3_ = 0.0f;
        fcSm_ = fc_; kSm_ = k_; driveSm_ = drive_;
        Prepare();
    }
    void Reset() { s1_ = s2_ = s3_ = 0.0f; }

    void set_cutoff(float hz)   { fc_ = clampf(hz, 20.0f, 18000.0f); }
    /** Resonantie 0 … 1 → K 0,01 … 2,0 (zelf-oscillatie bij 1,0). */
    void set_resonance(float r) { k_ = 0.01f + clampf(r, 0.0f, 1.0f) * 1.99f; }
    /** Extra resonantie in dezelfde eenheid (CV), mag negatief zijn. */
    void set_resonance_cv(float r) { kCv_ = 1.99f * clampf(r, -1.0f, 1.0f); }
    void set_drive(float d)     { drive_ = clampf(d, 0.1f, 10.0f); }
    /** Drive-CV ±1 → ×4 … ÷4. */
    void set_drive_cv(float v)  { driveCv_ = clampf(v, -1.0f, 1.0f); }
    /** 0 = LP (12 dB), 1 = HP (6 dB). */
    void set_mode(int m)        { hp_ = (m == 1); }
    /** Cutoff-verschuiving in octaven (CV × diepte), zonder clamp op de CV zelf. */
    void set_cutoff_octaves(float oct) { fcOct_ = clampf(oct, -10.0f, 10.0f); }

    inline void Prepare() {
        const float fcMod = clampf(fc_ * std::exp2(fcOct_), 20.0f, 18000.0f);
        fcSm_ += 0.35f * (fcMod - fcSm_);
        kSm_  += 0.35f * (clampf(k_ + kCv_, 0.01f, 2.0f) - kSm_);
        driveSm_ += 0.35f * (clampf(drive_ * std::exp2(2.0f * driveCv_), 0.1f, 10.0f) - driveSm_);
        const float g = std::tan(3.14159265f * fcSm_ / (sr_ * kOversample));
        G_  = g / (1.0f + g);
        mG_ = 1.0f - G_;
        K_  = kSm_;
        alpha0_ = 1.0f / (1.0f - K_ * G_ + K_ * G_ * G_);
        norm_   = 1.0f / K_;                  // passband-compensatie
    }

    inline float Tick(float x) {
        float acc = 0.0f;
        for (int os = 0; os < kOversample; ++os) {   // zero-order hold
            float y;
            if (!hp_) {
                const float y1 = lp(s1_, x, G_);
                const float u0 = alpha0_ * (y1 + K_ * mG_ * mG_ * s2_ - mG_ * s3_);
                const float u  = std::tanh(driveSm_ * u0);
                y = K_ * lp(s2_, u, G_);
                (void)lp(s3_, y, G_);
            } else {
                const float y1 = x - lp(s1_, x, G_);
                const float u0 = alpha0_ * (y1 - G_ * mG_ * s2_ + mG_ * s3_);
                const float u  = std::tanh(driveSm_ * u0);
                y = K_ * u;
                const float yhp2 = y - lp(s2_, y, G_);
                (void)lp(s3_, yhp2, G_);
            }
            acc += y;
        }
        float out = (acc / kOversample) * norm_;
        return out > 1.0f ? 1.0f : (out < -1.0f ? -1.0f : out);
    }

private:
    static float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
    /** One-pole TPT lowpass-stap op toestand `s` (v-vorm). */
    static inline float lp(float& s, float x, float G) {
        const float v = G * (x - s);
        const float y = v + s;
        s = y + v;
        return y;
    }

    float sr_ = 44100.0f;
    float s1_ = 0.0f, s2_ = 0.0f, s3_ = 0.0f;
    float fc_ = 2000.0f, fcOct_ = 0.0f, fcSm_ = 2000.0f;
    float k_ = 0.607f, kCv_ = 0.0f, kSm_ = 0.607f;
    float drive_ = 1.0f, driveCv_ = 0.0f, driveSm_ = 1.0f;
    bool  hp_ = false;
    float G_ = 0.1f, mG_ = 0.9f, K_ = 0.607f, alpha0_ = 1.0f, norm_ = 1.0f;
};

}  // namespace mmb_dsp
