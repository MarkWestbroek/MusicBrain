// Bit-identiteit: de oude Cr78Voice-rekenkunde, automatisch gelicht uit
// git HEAD (Cr78Module.h van vóór de verhuizing), tegen mmb_dsp::Cr78.
#include <cstdio>
#include <cstring>
#include <cmath>
#include <cstdint>
#include "mmb_dsp/cr78.h"
#define AUDIO_SAMPLE_RATE_EXACT 44100.0f

struct Oud {
    Oud() { reconfigure(); }
    void setDrum(int d)    { drum_ = d < 0 ? 0 : d > 11 ? 11 : d; reconfigure(); }
    void setTone(float v)  { tone_  = clamp01(v); reconfigure(); }
    void setDecay(float v) { decay_ = clamp01(v); reconfigure(); }
    void setBend(float v)  { bend_  = clamp01(v); }
    void setVoct(float v)  { voct_  = v; reconfigure(); }
    void setAccent(float v){ accent_ = clamp01(v); }
    void setLevel(float v) { level_ = clamp01(v); }

    void trigger() { pending_ = true; }
    float tick() {   // de update()-lus, zonder int16 en piekmeter
        if (pending_) { pending_ = false; strike(); }
        return active_ ? renderOne() * amp_ * level_ : 0.0f;
    }
    static float clamp01(float v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    /// Envelope-coëfficiënt voor een expontentieel verval met tijdconstante tau.
    static float coef(float tauSec) {
        return expf(-1.0f / (tauSec * AUDIO_SAMPLE_RATE_EXACT));
    }
    float noise() {   // LCG, ±1
        rng_ = rng_ * 1664525u + 1013904223u;
        return static_cast<float>((rng_ >> 9) & 0xFFFF) * (1.0f / 32768.0f) - 1.0f;
    }
    /// Eerste-orde hoogdoorlaat (DF1): blijft werken tot ver boven 7 kHz,
    /// waar de naïeve x-lowpass(x)-vorm naar nul zakt.
    float hp(float x) {
        hpY_ = hpR_ * (hpY_ + x - hpX_);
        hpX_ = x;
        return hpY_;
    }
    float lp(float x) { lpS_ += lpA_ * (x - lpS_); return lpS_; }
    static float hpCoef(float fcHz) {
        return expf(-6.2832f * fcHz / AUDIO_SAMPLE_RATE_EXACT);
    }
    static float lpCoef(float fcHz) {
        return 1.0f - expf(-6.2832f * fcHz / AUDIO_SAMPLE_RATE_EXACT);
    }

    void strike() {
        active_ = true;
        env1_ = 1.0f; env2_ = 1.0f; bendEnv_ = 1.0f;
        pulseEnv_ = 0.0f; pulsePhase_ = 0.99f;    // guiro: eerste tik meteen
        // Vellen starten op de cosinus-flank (bridged-T krijgt een puls):
        phase_ = 0.25f; phase2_ = 0.25f;
        // Accent-circuit: luider én meer buiging bij hard aanslaan.
        amp_     = gain_ * (0.55f + 0.45f * accent_);
        bendNow_ = bendAmt_ * (0.4f + 0.6f * accent_);
    }

    /// Eén 44.1k-sample van de actieve drum.
    float renderOne() {
        env1_ *= c1_; env2_ *= c2_; bendEnv_ *= cBend_;
        if (env1_ < 1e-4f && env2_ < 1e-4f) { active_ = false; return 0.0f; }
        float y = 0.0f;
        switch (drum_) {
            case 0:   // Kick: gedempte sinus + pitchbuiging, zachte verzadiging.
            case 9:   // Bongo
            case 10: {// Conga
                const float f = f0_ * (1.0f + 2.0f * bendNow_ * bendEnv_);
                phase_ += f * kInvSr; if (phase_ >= 1.0f) phase_ -= 1.0f;
                const float s = sinf(6.2832f * phase_) * env1_;
                y = s * (1.0f + 0.4f * s * s);          // milde bridged-T-kleur
                break;
            }
            case 1: { // Snare: vel (sinus) + ruis-hiss, tone mengt.
                const float f = f0_ * (1.0f + 1.2f * bendNow_ * bendEnv_);
                phase_ += f * kInvSr; if (phase_ >= 1.0f) phase_ -= 1.0f;
                const float body = sinf(6.2832f * phase_) * env1_;
                float n = hp(noise());
                n = lp(n) * env2_;
                y = body * (1.0f - mixN_) + n * 1.6f * mixN_;
                break;
            }
            case 2:   // Rim: korte hoge sinus + click.
            case 3: { // Claves: idem, iets langer/hoger.
                phase_ += f0_ * kInvSr; if (phase_ >= 1.0f) phase_ -= 1.0f;
                y = sinf(6.2832f * phase_) * env1_
                  + hp(noise()) * env2_ * 0.4f;
                break;
            }
            case 4: { // Cowbell: twee onharmonische sinussen, soft-clip.
                phase_  += f0_ * kInvSr; if (phase_  >= 1.0f) phase_  -= 1.0f;
                phase2_ += f1_ * kInvSr; if (phase2_ >= 1.0f) phase2_ -= 1.0f;
                float u = (sinf(6.2832f * phase_) + 0.8f * sinf(6.2832f * phase2_))
                        * (env1_ + 0.5f * env2_);
                y = u / (1.0f + (u < 0 ? -u : u));      // verzadigde "clank"
                break;
            }
            case 5:   // HiHat ("metal beat"): kort hooggefilterd ruisje.
            case 7: { // Maracas: idem met attack-bocht.
                float n = hp(noise());
                const float att = drum_ == 7 ? (1.0f - env2_) : 1.0f;   // shaker-attack
                y = n * env1_ * att;
                break;
            }
            case 6: { // Cymbal: ruis met snelle kop + lange metalen staart.
                float n = hp(noise());
                n *= 1.0f + 0.5f * sinf(6.2832f * phase_);  // metalige rimpel
                phase_ += f0_ * kInvSr; if (phase_ >= 1.0f) phase_ -= 1.0f;
                y = n * (0.7f * env2_ + 0.45f * env1_);
                break;
            }
            case 8: { // Guiro: ratel — pulstrein moduleert bandgefilterde ruis.
                pulsePhase_ += rate_ * kInvSr;
                if (pulsePhase_ >= 1.0f) { pulsePhase_ -= 1.0f; pulseEnv_ = 1.0f; }
                pulseEnv_ *= cPulse_;
                float n = hp(noise());
                n = lp(n);
                y = n * pulseEnv_ * env1_ * 2.0f;
                break;
            }
            default: {// Tamb: ruis geringmoduleerd met een hoge sinus (jingles).
                phase_ += f0_ * kInvSr; if (phase_ >= 1.0f) phase_ -= 1.0f;
                float n = hp(noise());
                y = n * (0.5f + 0.5f * sinf(6.2832f * phase_)) * env1_;
                break;
            }
        }
        return y;
    }

    /// Vertaal drum/tone/decay/voct naar per-sample-coëfficiënten.
    void reconfigure() {
        const float t = tone_ - 0.5f;                    // -0.5..+0.5
        const float oct = std::exp2f(voct_);             // V/Oct op de vellen
        switch (drum_) {
            case 0:  f0_ = 52.0f  * oct * (1.0f + 0.5f * t);
                     c1_ = coef(0.09f + 0.30f * decay_); c2_ = c1_;
                     bendAmt_ = 0.5f + 1.0f * bend_; gain_ = 1.0f;   break;
            case 1:  f0_ = 185.0f * oct * (1.0f + 0.5f * t);
                     c1_ = coef(0.030f + 0.045f * decay_);
                     c2_ = coef(0.045f + 0.090f * decay_);
                     hpR_ = hpCoef(1200.0f); lpA_ = lpCoef(6500.0f + 5000.0f * tone_);
                     mixN_ = 0.45f + 0.4f * tone_;
                     bendAmt_ = 0.3f * bend_; gain_ = 0.9f;          break;
            case 2:  f0_ = 1250.0f * (1.0f + 0.6f * t);
                     c1_ = coef(0.004f + 0.004f * decay_); c2_ = coef(0.0015f);
                     hpR_ = hpCoef(3000.0f);
                     bendAmt_ = 0.0f; gain_ = 0.8f;                  break;
            case 3:  f0_ = 2450.0f * (1.0f + 0.4f * t);
                     c1_ = coef(0.008f + 0.012f * decay_); c2_ = coef(0.001f);
                     hpR_ = hpCoef(4000.0f);
                     bendAmt_ = 0.0f; gain_ = 0.7f;                  break;
            case 4:  f0_ = 565.0f * (1.0f + 0.3f * t); f1_ = f0_ * 1.48f;
                     c1_ = coef(0.015f); c2_ = coef(0.055f + 0.10f * decay_);
                     bendAmt_ = 0.0f; gain_ = 0.8f;                  break;
            case 5:  hpR_ = hpCoef(7000.0f + 3500.0f * tone_);
                     c1_ = coef(0.018f + 0.045f * decay_); c2_ = coef(0.002f);
                     bendAmt_ = 0.0f; gain_ = 1.8f;                  break;
            case 6:  hpR_ = hpCoef(5500.0f + 2500.0f * tone_); f0_ = 5200.0f;
                     c1_ = coef(0.045f); c2_ = coef(0.20f + 0.45f * decay_);
                     bendAmt_ = 0.0f; gain_ = 1.5f;                  break;
            case 7:  hpR_ = hpCoef(6000.0f + 3000.0f * tone_);
                     c1_ = coef(0.014f + 0.020f * decay_); c2_ = coef(0.004f);
                     bendAmt_ = 0.0f; gain_ = 2.0f;                  break;
            case 8:  hpR_ = hpCoef(1500.0f); lpA_ = lpCoef(3500.0f + 2500.0f * tone_);
                     rate_ = 22.0f + 20.0f * tone_;
                     c1_ = coef(0.10f + 0.18f * decay_); c2_ = coef(0.01f);
                     cPulse_ = coef(0.006f);
                     bendAmt_ = 0.0f; gain_ = 0.9f;                  break;
            case 9:  f0_ = 330.0f * oct * (1.0f + 0.8f * t);
                     c1_ = coef(0.022f + 0.035f * decay_); c2_ = c1_;
                     bendAmt_ = 0.25f * bend_ + 0.05f; gain_ = 0.85f; break;
            case 10: f0_ = 165.0f * oct * (1.0f + 0.8f * t);
                     c1_ = coef(0.035f + 0.070f * decay_); c2_ = c1_;
                     bendAmt_ = 0.3f * bend_ + 0.05f; gain_ = 0.9f;  break;
            default: f0_ = 5900.0f * (1.0f + 0.2f * t);
                     hpR_ = hpCoef(6500.0f);
                     c1_ = coef(0.030f + 0.055f * decay_); c2_ = coef(0.002f);
                     bendAmt_ = 0.0f; gain_ = 1.7f;                  break;
        }
        cBend_ = coef(0.009f);        // pitchbuiging klinkt in ~9 ms uit
    }

    static constexpr float kInvSr = 1.0f / 44100.0f;

    int   drum_ = 0;
    float tone_ = 0.5f, decay_ = 0.5f, bend_ = 0.5f;
    float voct_ = 0.0f, accent_ = 1.0f, level_ = 0.8f;

    // Afgeleide per-drum-parameters (reconfigure).
    float f0_ = 52.0f, f1_ = 80.0f, c1_ = 0.999f, c2_ = 0.999f, cBend_ = 0.997f;
    float hpR_ = 0.5f, lpA_ = 0.5f, mixN_ = 0.5f, rate_ = 30.0f, cPulse_ = 0.99f;
    float bendAmt_ = 0.5f, gain_ = 1.0f;

    // Loopstate.
    bool  pending_ = false, active_ = false;
    float env1_ = 0.0f, env2_ = 0.0f, bendEnv_ = 0.0f, bendNow_ = 0.0f, amp_ = 1.0f;
    float phase_ = 0.0f, phase2_ = 0.0f, pulsePhase_ = 0.0f, pulseEnv_ = 0.0f;
    float hpX_ = 0.0f, hpY_ = 0.0f, lpS_ = 0.0f;
    uint32_t rng_ = 0x1234567u;
};

int main() {
    long n = 0, mism = 0; float maxdiff = 0;
    const float tones[] = {0.0f, 0.5f, 1.0f}, decays[] = {0.1f, 0.9f};
    for (int drum = 0; drum < 12; ++drum)
    for (float tone : tones) for (float decay : decays) {
        Oud a; mmb_dsp::Cr78 b; b.Init(44100.0f);
        a.setDrum(drum); b.setDrum(drum); a.setTone(tone); b.setTone(tone);
        a.setDecay(decay); b.setDecay(decay); a.setBend(0.7f); b.setBend(0.7f);
        a.setVoct(0.3f); b.setVoct(0.3f); a.setLevel(0.9f); b.setLevel(0.9f);
        for (int i = 0; i < 22050; ++i, ++n) {
            if (i % 5000 == 0) {                       // aanslag, wisselend accent
                const float acc = (i / 5000) % 2 ? 0.2f : 1.0f;
                a.setAccent(acc); b.setAccent(acc); a.trigger(); b.trigger();
            }
            const float ya = a.tick(), yb = b.Tick();
            if (std::memcmp(&ya, &yb, sizeof(float)) != 0) {
                ++mism; const float d = std::fabs(ya - yb); if (d > maxdiff) maxdiff = d;
            }
        }
    }
    std::printf("%ld samples, %ld verschillend (max %.3g)", n, mism, maxdiff); std::puts("");
    std::puts(mism == 0 ? "BIT-IDENTIEK" : "AFWIJKING");
    return mism == 0 ? 0 : 1;
}
