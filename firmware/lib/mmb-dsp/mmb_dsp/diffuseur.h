#pragma once
// Diffuseur: de luidsprekers van de Ondes Martenot, elk met een eigen klank.
// Na de stemmen (één kast voor alle stemmen), en ook achter iets anders.
//
//   Principal   gewone kast: wat laag eraf, wat hoog eraf.
//   Palme       een liervormige kast met twaalf snaren, chromatisch gestemd,
//               die meetrillen: een zingende halo die na de noot doorklinkt.
//               `tune` stemt de snaren om (halve tonen vanaf C3), `ring` is
//               hoe lang ze naklinken.
//   Métallique  een gong als luidsprekermembraan: metalen, niet-harmonische
//               boventonen die niet met de toon meegaan. `gong` is de grondtoon
//               van de gong, `ring` hoe lang hij zingt.
//
// `mix` mengt de kast met de directe klank (Principal heeft geen menging).
// De vierde luidspreker van het instrument, Résonance (veergalm), is de
// SPRING-module erachter.
//
// De twaalf snaren zijn kamfilters met demping in de lus; de gong is acht
// bandfilters op de verhoudingen van een gong. Eigen model op het oor; geen
// schakelingssimulatie. Header-only; gedeeld door Teensy en browser.
#include <cmath>
#include <cstdint>
#include <cstring>

#include "oversample.h"

namespace mmb_dsp {

class Diffuseur {
public:
    enum Control { Type, Mix, Tune, Ring, Gong, Level, kControls };
    enum CvIn { MixCv, kCvIns };
    enum CvOut { kCvOuts };
    enum Kind { Principal, Palme, Metallique };
    static constexpr float kDefaults[kControls] = { Palme, 0.5f, 0, 0.5f, 196, 1 };
    static constexpr int kStrings = 12, kModes = 8;
    static constexpr int kMaxDelay = 768;   // laagste snaar (C2, 65 Hz) bij 48 kHz past

    // Geen `*this = Diffuseur()`: de snaren zijn 36 KB, dat hoort niet als
    // tijdelijke kopie op de stack.
    void Init(float sampleRate) {
        sr_ = finiteClamp(sampleRate, 8000, 96000, 44100);
        std::memset(line_, 0, sizeof(line_));
        std::memset(damp_, 0, sizeof(damp_));
        std::memset(g1_, 0, sizeof(g1_));
        std::memset(g2_, 0, sizeof(g2_));
        wp_ = 0; palmeHp_ = 0; gongLp_ = 0; tone_ = 0; hp_ = 0; mixCv_ = 0;
        for (int c = 0; c < kControls; ++c) setControl(c, kDefaults[c]);
        tuneStrings();
        tuneGong();
    }

    void setControl(int control, float value) {
        switch (control) {
            case Type:  type_ = static_cast<int>(finiteClamp(value, 0, 2, Palme) + 0.5f); break;
            case Mix:   mix_ = finiteClamp(value, 0, 1, 0.5f); break;
            case Tune: {
                const float t = finiteClamp(value, -12, 12, 0);
                if (t != tune_) { tune_ = t; tuneStrings(); }
                break;
            }
            case Ring: {
                const float r = finiteClamp(value, 0, 1, 0.5f);
                if (r != ring_) { ring_ = r; tuneStrings(); tuneGong(); }
                break;
            }
            case Gong: {
                const float g = finiteClamp(value, 60, 600, 196);
                if (g != gongHz_) { gongHz_ = g; tuneGong(); }
                break;
            }
            case Level: level_ = finiteClamp(value, 0, 2, 1); break;
            default: return;
        }
    }
    void setCv(int input, float value) { if (input == MixCv) mixCv_ = finiteClamp(value, -1, 1, 0); }
    float cvOut(int) const { return 0; }

    void Process(const float* const* in, float* const* out, int frames) {
        const float mix = finiteClamp(mix_ + mixCv_, 0, 1, 0.5f);
        for (int frame = 0; frame < frames; ++frame) {
            const float x = in[0] ? in[0][frame] : 0;
            // De kast zelf: wat hoog en wat laag eraf, bij alle drie.
            tone_ += (x - tone_) * 0.45f;
            hp_ += (tone_ - hp_) * hpCoef_;
            const float direct = tone_ - hp_;
            float s = direct;
            if (type_ == Palme) s = direct * (1 - mix) + palme(direct) * mix;
            else if (type_ == Metallique) s = direct * (1 - mix) + gong(direct) * mix;
            s *= level_;
            out[0][frame] = s / (1 + 0.25f * (s < 0 ? -s : s));   // zachte grens
        }
    }

private:
    /** Palme: twaalf meetrillende snaren. */
    float palme(float x) {
        const float drive = x * 0.08f;
        float sum = 0;
        for (int i = 0; i < kStrings; ++i) {
            float rp = static_cast<float>(wp_) - delay_[i];
            if (rp < 0) rp += kMaxDelay;
            const int r0 = static_cast<int>(rp);
            const float fr = rp - static_cast<float>(r0);
            const int r1 = r0 + 1 < kMaxDelay ? r0 + 1 : 0;
            const float d = line_[i][r0] + (line_[i][r1] - line_[i][r0]) * fr;
            damp_[i] += (d - damp_[i]) * 0.55f;                     // snaar verliest hoog
            const float v = drive + fb_[i] * damp_[i];
            line_[i][wp_] = v;
            sum += v;
        }
        if (++wp_ >= kMaxDelay) wp_ = 0;
        palmeHp_ += (sum - palmeHp_) * 0.01f;
        return (sum - palmeHp_) * 0.9f;
    }

    /** Métallique: vaste, niet-harmonische modi van een gong, plus het
     *  membraan zelf hard en helder. */
    float gong(float x) {
        const float in = x * 0.5f;
        float sum = 0;
        for (int i = 0; i < kModes; ++i) {
            const float v3 = in - g2_[i];
            const float v1 = ga1_[i] * g1_[i] + ga2_[i] * v3;
            const float v2 = g2_[i] + ga2_[i] * g1_[i] + ga3_[i] * v3;
            g1_[i] = 2 * v1 - g1_[i];
            g2_[i] = 2 * v2 - g2_[i];
            sum += v1 * gw_[i];
        }
        const float hi = x - gongLp_;
        gongLp_ += (x - gongLp_) * 0.15f;
        const float m = sum * 0.35f + hi * 0.8f;
        return m / (1 + 0.6f * (m < 0 ? -m : m));
    }

    void tuneStrings() {
        // Chromatisch vanaf C3 (130,8 Hz), omgestemd met `tune`.
        const float t60 = 0.8f + 7.0f * ring_;                      // 0,8 … 7,8 s
        for (int i = 0; i < kStrings; ++i) {
            const float hz = 130.8128f * std::exp2((static_cast<float>(i) + tune_) / 12);
            float d = sr_ / hz;
            if (d > kMaxDelay - 2) d = kMaxDelay - 2;
            if (d < 2) d = 2;
            delay_[i] = d;
            float g = std::pow(10.0f, -3 * d / (t60 * sr_)) * 1.02f;   // de demping in de lus kost iets
            fb_[i] = g > 0.9995f ? 0.9995f : g;
        }
    }
    void tuneGong() {
        static constexpr float kRatio[kModes] = { 1.0f, 1.52f, 2.14f, 2.67f, 3.09f, 3.71f, 4.33f, 5.41f };
        static constexpr float kWeight[kModes] = { 1.0f, 0.8f, 0.7f, 0.55f, 0.5f, 0.4f, 0.35f, 0.3f };
        // Breed genoeg dat een gewone toon de gong aanzet (Q 30..200: ~0,3..2 s).
        const float q = 30 + 170 * ring_;
        const float k = 1 / q;
        for (int i = 0; i < kModes; ++i) {
            const float f = finiteClamp(gongHz_ * kRatio[i], 40, 0.45f * sr_, 1000);
            const float g = std::tan(3.14159265f * f / sr_);
            ga1_[i] = 1 / (1 + g * (g + k));
            ga2_[i] = g * ga1_[i];
            ga3_[i] = g * ga2_[i];
            gw_[i] = kWeight[i] * k * 10;
        }
        hpCoef_ = 1 - std::exp(-6.2831853f * 70 / sr_);
    }

    float sr_ = 44100;
    int   type_ = Palme;
    float mix_ = 0.5f, tune_ = 0, ring_ = 0.5f, gongHz_ = 196, level_ = 1, mixCv_ = 0;
    float tone_ = 0, hp_ = 0, hpCoef_ = 0.01f;
    float line_[kStrings][kMaxDelay] = {}, delay_[kStrings] = {}, fb_[kStrings] = {}, damp_[kStrings] = {};
    int   wp_ = 0;
    float palmeHp_ = 0;
    float ga1_[kModes] = {}, ga2_[kModes] = {}, ga3_[kModes] = {}, g1_[kModes] = {}, g2_[kModes] = {}, gw_[kModes] = {};
    float gongLp_ = 0;
};

}  // namespace mmb_dsp
