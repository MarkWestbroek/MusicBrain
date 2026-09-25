#pragma once
// Pitch-shifter / harmonizer: twee stemmen die elk een vertragingslijn met
// twee leeskoppen uitlezen (de klassieke "twee kruisgefadete koppen" uit de
// rack-harmonizers). De koppen lopen met snelheid `ratio` = 2^(semi/12) door
// het geheugen; als de ene de rand van het venster nadert is de andere op
// vol volume (sin/cos-kruisfade, vermogensbehoudend).
//
// Het venster wordt op de toonhoogte van de ingang gelegd: een simpele
// nuldoorgangs-tracker meet de periode en het venster wordt afgerond op een
// heel aantal periodes. Dan staan de twee koppen bij de kruisfade in fase
// en hoor je geen tremolo op de warble-frequentie (het bekende gebrek van
// een kaal twee-koppen-ontwerp); op akkoorden en ruis valt hij terug op het
// ingestelde venster. Kleine vensters (10–20 ms) volgen strak maar klinken
// ietsje metaalachtig, grote (60–100 ms) zijn zachter maar smeren
// transiënten. Feedback stuurt het gemengde natte signaal terug de shifter
// in: getrapte herhalingen (shimmer, arpeggio's).
//
// Header-only, buffers inline (2 × 8192 floats = 64 KB).
#include <cmath>
#include <cstring>

namespace mmb_dsp {

class PitchShiftVoice {
public:
    static constexpr int kLen = 8192;                     // 186 ms bij 44,1 kHz

    void Init(float sr) {
        sr_ = sr; std::memset(buf_, 0, sizeof(buf_)); write_ = 0; phase_ = 0.0f;
        set_window_samples(0.04f * sr); win_ = winTarget_;
        set_semitones(0.0f);
    }
    /** Venster in samples; wordt met een slew gevolgd (geen klik bij verandering). */
    void set_window_samples(float n) {
        if (n < 64.0f) n = 64.0f;
        if (n > static_cast<float>(kLen - 64)) n = static_cast<float>(kLen - 64);
        winTarget_ = n;
    }
    /** Verschuiving in halve tonen (−24..+24), extra V/Oct erbij (1 V = 12 st). */
    void set_semitones(float st, float voct = 0.0f) {
        float s = st + 12.0f * voct;
        if (s < -24.0f) s = -24.0f; if (s > 24.0f) s = 24.0f;
        ratio_ = std::exp2(s / 12.0f);
    }

    inline float Tick(float in) {
        buf_[write_] = in;
        win_ += (winTarget_ - win_) * 0.002f;
        // De koppen schuiven (1 − ratio) samples per sample door het venster.
        phase_ += (1.0f - ratio_) / win_;
        phase_ -= std::floor(phase_);
        const float pA = phase_, pB = phase_ + 0.5f - (phase_ >= 0.5f ? 1.0f : 0.0f);
        const float dA = 1.0f + pA * win_, dB = 1.0f + pB * win_;
        const float gA = halfSin(pA), gB = halfSin(pB);            // sin(πp)
        const float y = gA * read(dA) + gB * read(dB);
        write_ = (write_ + 1) & (kLen - 1);
        return y;
    }

private:
    inline float read(float d) const {
        float rp = static_cast<float>(write_) - d;
        while (rp < 0.0f) rp += static_cast<float>(kLen);
        const int i0 = static_cast<int>(rp);
        const float f = rp - static_cast<float>(i0);
        return buf_[i0 & (kLen - 1)] + (buf_[(i0 + 1) & (kLen - 1)] - buf_[i0 & (kLen - 1)]) * f;
    }
    /** sin(π·p) voor p in 0..1 (parabolische benadering). */
    static float halfSin(float p) {
        const float x = p * 3.1415927f;
        const float y = 1.2732395f * x - 0.4052847f * x * x;
        return 0.225f * (y * y - y) + y;
    }

    float sr_ = 44100.0f;
    float buf_[kLen];
    int   write_ = 0;
    float phase_ = 0.0f, win_ = 1764.0f, winTarget_ = 1764.0f, ratio_ = 1.0f;
};

class Harmonizer {
public:
    void Init(float sr) {
        sr_ = sr;
        v_[0].Init(sr); v_[1].Init(sr);
        trackCoef_ = 1.0f - std::exp(-6.2831853f * 1000.0f / sr);
        track_ = 0.0f; above_ = false; count_ = 0; period_ = 0.0f;
        set_window(40.0f); fb_ = 0.0f; lastWet_ = 0.0f;
    }
    void set_semitones(int voice, float st) { semi_[voice & 1] = st; apply(voice & 1); }
    void set_cents(int voice, float ct)     { cent_[voice & 1] = ct; apply(voice & 1); }
    void set_voct(int voice, float v)       { voct_[voice & 1] = v; apply(voice & 1); }
    void set_level(int voice, float l)      { lvl_[voice & 1] = clamp01(l); }
    void set_window(float ms)               { winMs_ = ms < 8.0f ? 8.0f : (ms > 120.0f ? 120.0f : ms); applyWindow(); }
    void set_feedback(float f)              { fb_ = f < 0.0f ? 0.0f : (f > 0.9f ? 0.9f : f); }
    void set_spread(float s)                { spread_ = clamp01(s); }
    void set_mix(float m)                   { mix_ = clamp01(m); }

    /** Mono in, stereo uit: stem A links, stem B rechts (mate `spread`). */
    inline void Process(float in, float* outL, float* outR) {
        // Toonhoogte-tracker: periode tussen stijgende nuldoorgangen van de
        // laaggefilterde ingang, gemiddeld; het venster wordt er een heel
        // aantal van.
        track_ += (in - track_) * trackCoef_;
        ++count_;
        if (!above_ && track_ > 0.01f) {
            above_ = true;
            if (count_ >= 20 && count_ <= 2000) {
                const float p = static_cast<float>(count_);
                period_ = period_ > 0.0f ? period_ + (p - period_) * 0.25f : p;
                applyWindow();
            }
            count_ = 0;
        } else if (above_ && track_ < -0.01f) {
            above_ = false;
        }
        if (count_ > 4000) period_ = 0.0f;                  // stilte / geen toon: kaal venster

        const float src = in + fb_ * lastWet_;
        const float a = v_[0].Tick(src) * lvl_[0];
        const float b = v_[1].Tick(src) * lvl_[1];
        lastWet_ = 0.5f * (a + b);
        const float far = 1.0f - spread_;
        const float wl = a + b * far, wr = b + a * far;
        *outL = in * (1.0f - mix_) + wl * mix_;
        *outR = in * (1.0f - mix_) + wr * mix_;
    }

private:
    static float clamp01(float v) { return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }
    void apply(int k) { v_[k].set_semitones(semi_[k] + cent_[k] * 0.01f, voct_[k]); }
    void applyWindow() {
        float n = winMs_ * 0.001f * sr_;
        if (period_ > 0.0f) {
            // De koppen lezen een half venster uit elkaar; dát moet een heel
            // aantal periodes zijn, dus het venster een even aantal.
            float k = std::floor(n / (2.0f * period_) + 0.5f);
            if (k < 1.0f) k = 1.0f;
            n = 2.0f * k * period_;
        }
        v_[0].set_window_samples(n); v_[1].set_window_samples(n);
    }

    float sr_ = 44100.0f;
    PitchShiftVoice v_[2];
    float semi_[2] = { 0.0f, 0.0f }, cent_[2] = { 0.0f, 0.0f }, voct_[2] = { 0.0f, 0.0f }, lvl_[2] = { 1.0f, 0.0f };
    float winMs_ = 40.0f, fb_ = 0.0f, spread_ = 0.5f, mix_ = 0.5f, lastWet_ = 0.0f;
    float trackCoef_ = 0.1f, track_ = 0.0f, period_ = 0.0f;
    bool  above_ = false;
    int   count_ = 0;
};

}  // namespace mmb_dsp
