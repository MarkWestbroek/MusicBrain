#pragma once
// Leslie (draaiende luidspreker): een hoorn voor het hoog en een trommel
// (rotor met een schotel voor de woofer) voor het laag, elk met een eigen
// motor en eigen traagheid. Het karakter zit in vier dingen:
//
//   1. Doppler: de hoorn beweegt naar de microfoon toe en ervan af, dus de
//      toonhoogte schommelt (vertragingslijn, ±0,44 ms voor een straal van
//      15 cm); de trommel veel minder.
//   2. Richting: de hoorn is gericht — van voren luid en helder, van achteren
//      zacht en dof (volume én klank schommelen mee). Plus een reflectie
//      van de kastwand, een halve slag verschoven: de "swirl".
//   3. Traagheid: tussen langzaam (chorale) en snel (tremolo) versnelt de
//      lichte hoorn in ongeveer een seconde, de zware trommel in een seconde
//      of vier; vertragen duurt langer dan versnellen. Omdat hoorn en
//      trommel elk hun eigen tempo hebben, lopen ze tijdens het omschakelen
//      uit elkaar — dat "opwinden" is het geluid waar je hem op herkent.
//   4. Bijgeluiden: de hoorn suist hoorbaar als hij snel draait (lucht), de
//      motor bromt, de trommel rommelt, en het relais geeft een tikje bij
//      het omschakelen. Plus de buizenvoorversterker die lekker kan kraken.
//
// Snelheden instelbaar (langzaam én snel), zoals op een ELKA; de
// standaardwaarden zijn die van een klassiek exemplaar. De trommel draait
// iets langzamer dan de hoorn (vaste verhouding), zodat ze nooit gelijk
// oplopen. Mono in (L+R), stereo uit via twee microfoons (`spread` = hoek).
//
// Header-only, buffers inline (2 × 1024 floats).
#include <cmath>
#include <cstdint>
#include <cstring>

#include "biquad.h"

namespace mmb_dsp {

class Leslie {
public:
    enum Speed { kSlow = 0, kFast = 1, kBrake = 2 };
    static constexpr int kLen = 1024;

    void Init(float sr) {
        sr_ = sr;
        std::memset(hBuf_, 0, sizeof(hBuf_));
        std::memset(dBuf_, 0, sizeof(dBuf_));
        write_ = 0;
        hPhase_ = 0.0f; dPhase_ = 0.37f;
        hRate_ = slowHz_; dRate_ = slowHz_ * kDrumSlow;
        lpX_ = rbj::lowPass(800.0f, 0.7071f, sr);  hpX_ = rbj::highPass(800.0f, 0.7071f, sr);
        cab_ = rbj::peak(170.0f, 2.5f, 0.9f, sr);
        cabHp_ = rbj::highPass(45.0f, 0.7071f, sr);
        for (int i = 0; i < 2; ++i) { lp1_[i] = BiquadState{}; lp2_[i] = BiquadState{}; hp1_[i] = BiquadState{}; hp2_[i] = BiquadState{}; }
        for (int m = 0; m < 2; ++m) { bright_[m] = 0.0f; cabS_[m] = BiquadState{}; cabHpS_[m] = BiquadState{}; airA_[m] = airB_[m] = 0.0f; }
        rumble_ = 0.0f; humPhase_ = 0.0f; click_ = 0.0f; noise_ = 22222u;
        setTimes(); set_spread(spread_);
    }

    void set_speed(int s)        { const Speed n = s <= 0 ? kSlow : (s == 1 ? kFast : kBrake); if (n != speed_) click_ = 1.0f; speed_ = n; }
    void set_slow_rate(float hz) { slowHz_ = hz < 0.1f ? 0.1f : (hz > 3.0f ? 3.0f : hz); }
    void set_fast_rate(float hz) { fastHz_ = hz < 2.0f ? 2.0f : (hz > 10.0f ? 10.0f : hz); }
    /** Schaal op de traagheid: 0,25 = vlug, 1 = klassiek, 2 = extra zwaar. */
    void set_inertia(float k)    { inertia_ = k < 0.25f ? 0.25f : (k > 2.0f ? 2.0f : k); setTimes(); }
    void set_drive(float d)      { drive_ = clamp01(d); }
    /** 0 = alleen trommel, 0,5 = beide, 1 = alleen hoorn. */
    void set_balance(float b)    { balance_ = clamp01(b); }
    /** Microfoonhoek: 0 = beide op dezelfde plek (mono), 1 = tegenover elkaar. */
    void set_spread(float s) {
        spread_ = clamp01(s);
        const float a = 1.5707963f * spread_;                  // ±90° bij spread 1
        micCos_ = std::cos(a); micSin_ = std::sin(a);
    }
    void set_noise(float n)      { noiseAmt_ = clamp01(n); }
    void set_level(float l)      { level_ = l < 0.0f ? 0.0f : (l > 2.0f ? 2.0f : l); }

    float horn_hz() const { return hRate_; }
    float drum_hz() const { return dRate_; }

    /** Mono in (x = (L+R)/2), stereo uit in outL/outR. */
    inline void Process(float in, float* outL, float* outR) {
        // ── motoren ─────────────────────────────────────────────────────
        const float hT = speed_ == kFast ? fastHz_ : (speed_ == kSlow ? slowHz_ : 0.0f);
        const float dT = speed_ == kFast ? fastHz_ * kDrumFast : (speed_ == kSlow ? slowHz_ * kDrumSlow : 0.0f);
        hRate_ += (hT - hRate_) * (hT > hRate_ ? hUp_ : hDn_);
        dRate_ += (dT - dRate_) * (dT > dRate_ ? dUp_ : dDn_);
        hPhase_ += hRate_ / sr_; if (hPhase_ >= 1.0f) hPhase_ -= 1.0f;
        dPhase_ += dRate_ / sr_; if (dPhase_ >= 1.0f) dPhase_ -= 1.0f;

        // ── voorversterker: zachte, iets asymmetrische buizenvervorming ──
        float v = in * (1.0f + 5.0f * drive_);
        v = v + 0.12f * drive_ * v * v;                         // even harmonischen
        v = v / (1.0f + (v < 0.0f ? -v : v));
        v *= (1.0f + 0.6f * drive_) / (1.0f + 1.5f * drive_);   // ongeveer gelijk niveau

        // ── crossover 800 Hz (LR4: twee keer 2e orde) ─────────────────────
        const float lo = biquadTick(lpX_, lp2_[0], biquadTick(lpX_, lp1_[0], v));
        const float hi = biquadTick(hpX_, hp2_[0], biquadTick(hpX_, hp1_[0], v));
        hBuf_[write_] = hi;
        dBuf_[write_] = lo;

        // ── bijgeluiden: gedeelde bronnen ────────────────────────────────
        const float wn = white();
        rumble_ += (wn - rumble_) * 0.012f;                    // ~85 Hz ruis
        humPhase_ += 60.0f / sr_; if (humPhase_ >= 1.0f) humPhase_ -= 1.0f;
        const float hum = std::sin(6.2831853f * humPhase_) * 0.6f
                        + std::sin(12.566371f * humPhase_) * 0.4f;
        float clk = 0.0f;
        if (click_ > 0.0005f) { clk = click_ * wn; click_ *= clickDecay_; }
        const float hornSpd = hRate_ / 7.0f, drumSpd = dRate_ / 6.0f;

        const float hornG = balance_ < 0.5f ? 2.0f * balance_ : 1.0f;
        const float drumG = balance_ > 0.5f ? 2.0f * (1.0f - balance_) : 1.0f;
        // Hoek van hoorn en trommel één keer per sample; per microfoon
        // gedraaid met de vaste mic-hoek (cos(θ∓a), sin(θ∓a)).
        const float hc = std::cos(6.2831853f * hPhase_), hs = std::sin(6.2831853f * hPhase_);
        const float dc = std::cos(6.2831853f * dPhase_), ds = std::sin(6.2831853f * dPhase_);
        float out[2];
        for (int m = 0; m < 2; ++m) {
            const float sa = m ? micSin_ : -micSin_;           // L: −a, R: +a
            const float chm = hc * micCos_ + hs * sa, shm = hs * micCos_ - hc * sa;
            const float cdm = dc * micCos_ + ds * sa, sdm = ds * micCos_ - dc * sa;
            out[m] = mic(m, chm, shm, cdm, sdm, hornG, drumG, wn, hornSpd, drumSpd, hum, clk);
        }
        write_ = (write_ + 1) & (kLen - 1);
        *outL = out[0] * level_;
        *outR = out[1] * level_;
    }

private:
    static constexpr float kDrumSlow = 0.85f;   // trommel iets langzamer dan hoorn
    static constexpr float kDrumFast = 0.88f;

    static float clamp01(float v) { return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }
    void setTimes() {
        // Klassiek: hoorn ~0,8 s op / 1,2 s af, trommel ~4 s op / 5,5 s af.
        auto k = [&](float s) { return 1.0f - std::exp(-1.0f / (s * inertia_ * sr_)); };
        hUp_ = k(0.8f); hDn_ = k(1.2f); dUp_ = k(4.0f); dDn_ = k(5.5f);
        clickDecay_ = std::exp(-1.0f / (0.004f * sr_));
    }
    inline float white() {
        noise_ = noise_ * 1664525u + 1013904223u;
        return static_cast<float>(static_cast<int32_t>(noise_)) * (1.0f / 2147483648.0f);
    }
    inline float tap(const float* b, float d) const {
        float rp = static_cast<float>(write_) - d;
        if (rp < 0.0f) rp += static_cast<float>(kLen);
        const int i0 = static_cast<int>(rp);
        const float f = rp - static_cast<float>(i0);
        const float a = b[i0 & (kLen - 1)], c = b[(i0 + 1) & (kLen - 1)];
        return a + (c - a) * f;
    }
    /** Eén microfoon; ch/cs = cos/sin van de hoornhoek t.o.v. deze mic,
     *  cd/sd idem voor de trommel. */
    inline float mic(int m, float ch, float cs, float cd, float sd, float hornG, float drumG, float wn,
                     float hornSpd, float drumSpd, float hum, float clk) {
        const float base = 0.0022f * sr_;                      // 2,2 ms kast
        const float hDop = 0.00044f * sr_;                     // straal hoorn / c
        const float dDop = 0.00012f * sr_;
        // Hoorn: direct (Doppler + richting) plus kastreflectie een halve slag verder.
        const float direct = tap(hBuf_, base + hDop * cs);
        const float refl   = tap(hBuf_, base + 0.0013f * sr_ - hDop * cs);
        const float aim = 0.5f + 0.5f * ch;                    // 1 = naar de mic gericht
        float horn = direct * (0.30f + 0.70f * aim) + refl * 0.30f * (1.0f - 0.6f * aim);
        // Klank: van achteren doffer (één pool tussen ~2,5 en 14 kHz).
        const float fx = 6.2831853f * (2500.0f + 11500.0f * aim) / sr_;
        const float kLp = fx / (1.0f + fx);
        bright_[m] += (horn - bright_[m]) * kLp;
        horn = bright_[m];

        // Trommel: kleine Doppler, milde volumeschommeling.
        const float drum = tap(dBuf_, base + dDop * sd) * (0.78f + 0.22f * cd);

        // Lucht: bandruis rond 2–4 kHz, kwadratisch met de hoornsnelheid,
        // en harder als de hoornmond langs de mic zwiept.
        airA_[m] += (wn - airA_[m]) * 0.45f;
        airB_[m] += (airA_[m] - airB_[m]) * 0.2f;
        const float air = (airA_[m] - airB_[m]) * hornSpd * hornSpd * (0.4f + 0.6f * aim);
        const float mech = rumble_ * (0.3f + drumSpd) * 0.6f + hum * 0.08f;
        const float noise = noiseAmt_ * (0.012f * air + 0.006f * mech + 0.03f * clk);

        float y = hornG * horn + drumG * drum * 1.1f + noise;
        y = biquadTick(cab_, cabS_[m], y);                     // kastresonantie
        y = biquadTick(cabHp_, cabHpS_[m], y);
        return y;
    }

    float sr_ = 44100.0f;
    float hBuf_[kLen], dBuf_[kLen];
    int   write_ = 0;
    Speed speed_ = kSlow;
    float slowHz_ = 0.8f, fastHz_ = 6.7f, inertia_ = 1.0f;
    float hRate_ = 0.8f, dRate_ = 0.68f, hPhase_ = 0.0f, dPhase_ = 0.0f;
    float hUp_ = 0.0f, hDn_ = 0.0f, dUp_ = 0.0f, dDn_ = 0.0f;
    float drive_ = 0.2f, balance_ = 0.5f, spread_ = 0.8f, noiseAmt_ = 0.3f, level_ = 1.0f;
    float micCos_ = 0.309f, micSin_ = 0.951f;
    BiquadCoef lpX_, hpX_, cab_, cabHp_;
    BiquadState lp1_[2], lp2_[2], hp1_[2], hp2_[2], cabS_[2], cabHpS_[2];
    float bright_[2] = { 0.0f, 0.0f }, airA_[2] = { 0.0f, 0.0f }, airB_[2] = { 0.0f, 0.0f };
    float rumble_ = 0.0f, humPhase_ = 0.0f, click_ = 0.0f, clickDecay_ = 0.99f;
    uint32_t noise_ = 22222u;
};

}  // namespace mmb_dsp
