#pragma once
// Pitch-shifters op één gedeelde vertragingslijn, en de harmonizer daarop.
//
// Twee manieren om een toonhoogte te verschuiven:
//
//   Heads (twee koppen): de klassieke rack-harmonizer. Twee leeskoppen
//     lopen met snelheid 2^(semi/12) door het geheugen; als de ene de rand
//     van het venster nadert is de andere op vol volume (sin-kruisfade).
//     Het venster wordt pitch-synchroon gelegd: een nuldoorgangs-tracker
//     meet de periode en het venster wordt een even aantal periodes, zodat
//     de koppen (een half venster uit elkaar) in fase kruisfaden. Strak op
//     één noot (lead, bas, zang); op akkoorden het vintage gewiebel.
//
//   Grains (korrels): het geluid wordt in korreltjes van `window` ms
//     geknipt, elk met een Hann-venster, sneller of langzamer afgespeeld en
//     met vier tegelijk over elkaar gelegd. Omdat er altijd meerdere korrels
//     klinken valt een fout in één korrel niet op: beter op akkoorden en
//     pads. `jitter` maakt plek, lengte en moment van elke korrel een beetje
//     willekeurig — van glad naar een wolkje.
//
// Header-only, geen allocatie; de gedeelde lijn is 8192 floats (32 KB).
#include <cmath>
#include <cstdint>
#include <cstring>

namespace mmb_dsp {

/** De gedeelde vertragingslijn waar de shifters uit lezen. */
class ShiftLine {
public:
    static constexpr int kLen = 8192;                     // 186 ms bij 44,1 kHz
    void Init() { std::memset(buf_, 0, sizeof(buf_)); write_ = 0; }
    inline void push(float x) { buf_[write_] = x; write_ = (write_ + 1) & (kLen - 1); }
    /** Waarde `d` samples voor de laatst geschreven (d ≥ 1). */
    inline float delayed(float d) const {
        float rp = static_cast<float>(write_) - 1.0f - d;
        while (rp < 0.0f) rp += static_cast<float>(kLen);
        return at(rp);
    }
    /** Absolute (fractionele) positie in de ring. */
    inline float at(float rp) const {
        const int i0 = static_cast<int>(rp);
        const float f = rp - static_cast<float>(i0);
        const float a = buf_[i0 & (kLen - 1)], b = buf_[(i0 + 1) & (kLen - 1)];
        return a + (b - a) * f;
    }
    int write() const { return write_; }
private:
    float buf_[kLen];
    int   write_ = 0;
};

inline float shiftRatio(float st) {
    if (st < -24.0f) st = -24.0f; if (st > 24.0f) st = 24.0f;
    return std::exp2(st / 12.0f);
}

/** Twee kruisgefadete leeskoppen. */
class HeadShifter {
public:
    void Init(float sr) { phase_ = 0.0f; win_ = winTarget_ = 0.04f * sr; ratio_ = 1.0f; }
    void set_ratio(float r) { ratio_ = r; }
    void set_window_samples(float n) {
        if (n < 64.0f) n = 64.0f;
        if (n > static_cast<float>(ShiftLine::kLen - 64)) n = static_cast<float>(ShiftLine::kLen - 64);
        winTarget_ = n;
    }
    inline float Tick(const ShiftLine& line) {
        win_ += (winTarget_ - win_) * 0.002f;
        phase_ += (1.0f - ratio_) / win_;
        phase_ -= std::floor(phase_);
        const float pA = phase_, pB = phase_ + 0.5f - (phase_ >= 0.5f ? 1.0f : 0.0f);
        return halfSin(pA) * line.delayed(1.0f + pA * win_) + halfSin(pB) * line.delayed(1.0f + pB * win_);
    }
private:
    /** sin(π·p) voor p in 0..1 (parabolisch). */
    static float halfSin(float p) {
        const float x = p * 3.1415927f;
        const float y = 1.2732395f * x - 0.4052847f * x * x;
        return 0.225f * (y * y - y) + y;
    }
    float phase_ = 0.0f, win_ = 1764.0f, winTarget_ = 1764.0f, ratio_ = 1.0f;
};

/** Korrels met een Hann-venster, vier tegelijk over elkaar. */
class GrainShifter {
public:
    static constexpr int kGrains = 8;
    static constexpr int kOverlap = 4;

    void Init(float sr, uint32_t seed) {
        sr_ = sr; rng_ = seed; countdown_ = 0.0f; ratio_ = 1.0f; jitter_ = 0.0f;
        for (auto& g : g_) g.active = false;
        for (int i = 0; i < kWin; ++i) win_[i] = 0.5f - 0.5f * std::cos(6.2831853f * static_cast<float>(i) / (kWin - 1));
        set_grain_ms(40.0f);
    }
    void set_ratio(float r)    { ratio_ = r; clampLen(); }
    void set_grain_ms(float ms) { lenMs_ = ms < 8.0f ? 8.0f : (ms > 120.0f ? 120.0f : ms); clampLen(); }
    void set_jitter(float j)   { jitter_ = j < 0.0f ? 0.0f : (j > 1.0f ? 1.0f : j); clampLen(); }

    inline float Tick(const ShiftLine& line) {
        if (--countdown_ <= 0.0f) spawn(line);
        float y = 0.0f;
        for (auto& g : g_) {
            if (!g.active) continue;
            const float t = g.age * g.invLen;                 // 0..1
            const float w = win_[static_cast<int>(t * (kWin - 1))];
            y += w * line.at(g.pos);
            g.pos += g.rate;
            if (g.pos >= static_cast<float>(ShiftLine::kLen)) g.pos -= static_cast<float>(ShiftLine::kLen);
            if (++g.age >= g.len) g.active = false;
        }
        return y * (2.0f / kOverlap);                         // Hann ×4 telt op tot 2
    }

private:
    static constexpr int kWin = 512;
    struct Grain { bool active = false; float pos = 0.0f, rate = 1.0f, invLen = 0.0f; int age = 0, len = 1; };

    inline float rnd() { rng_ = rng_ * 1664525u + 1013904223u; return static_cast<float>(rng_ >> 8) * (1.0f / 16777216.0f); }
    void clampLen() {
        // Een korrel mag de schrijfkop niet inhalen (omhoog) of uit het
        // geheugen lopen (omlaag): lengte × |ratio−1| plus de jitter-marge
        // moet in de lijn passen.
        const float room = static_cast<float>(ShiftLine::kLen - 256);
        const float span = (ratio_ > 1.0f ? ratio_ - 1.0f : 1.0f - ratio_) + 1.0f + 0.5f * jitter_;
        float len = lenMs_ * 0.001f * sr_;
        if (len * span > room) len = room / span;
        lenSamples_ = len;
    }
    void spawn(const ShiftLine& line) {
        const float len = lenSamples_ * (1.0f + jitter_ * 0.3f * (rnd() - 0.5f));
        countdown_ = (lenSamples_ / kOverlap) * (1.0f + jitter_ * 0.8f * (rnd() - 0.5f));
        for (auto& g : g_) {
            if (g.active) continue;
            // Start ver genoeg terug dat hij bij ratio > 1 de schrijfkop niet
            // inhaalt; jitter schuift het startpunt willekeurig verder terug.
            const float lead = (ratio_ > 1.0f ? (ratio_ - 1.0f) * len : 0.0f) + 4.0f + jitter_ * rnd() * 0.5f * len;
            float p = static_cast<float>(line.write()) - 1.0f - lead;
            while (p < 0.0f) p += static_cast<float>(ShiftLine::kLen);
            g.pos = p; g.rate = ratio_; g.age = 0;
            g.len = static_cast<int>(len) < 16 ? 16 : static_cast<int>(len);
            g.invLen = 1.0f / static_cast<float>(g.len);
            g.active = true;
            return;
        }
    }

    float sr_ = 44100.0f, ratio_ = 1.0f, jitter_ = 0.0f, lenMs_ = 40.0f, lenSamples_ = 1764.0f, countdown_ = 0.0f;
    uint32_t rng_ = 1u;
    Grain g_[kGrains];
    float win_[kWin];
};

class Harmonizer {
public:
    enum Algo { kHeads = 0, kGrains = 1 };

    void Init(float sr) {
        sr_ = sr;
        line_.Init();
        for (int k = 0; k < 2; ++k) { h_[k].Init(sr); g_[k].Init(sr, 1234u + 777u * k); }
        trackCoef_ = 1.0f - std::exp(-6.2831853f * 1000.0f / sr);
        track_ = 0.0f; above_ = false; count_ = 0; period_ = 0.0f;
        set_window(40.0f); fb_ = 0.0f; lastWet_ = 0.0f;
    }
    void set_semitones(int voice, float st) { semi_[voice & 1] = st; apply(voice & 1); }
    void set_cents(int voice, float ct)     { cent_[voice & 1] = ct; apply(voice & 1); }
    void set_voct(int voice, float v)       { voct_[voice & 1] = v; apply(voice & 1); }
    void set_level(int voice, float l)      { lvl_[voice & 1] = clamp01(l); }
    void set_window(float ms)               { winMs_ = ms < 8.0f ? 8.0f : (ms > 120.0f ? 120.0f : ms); applyWindow(); g_[0].set_grain_ms(winMs_); g_[1].set_grain_ms(winMs_); }
    void set_feedback(float f)              { fb_ = f < 0.0f ? 0.0f : (f > 0.9f ? 0.9f : f); }
    void set_spread(float s)                { spread_ = clamp01(s); }
    void set_mix(float m)                   { mix_ = clamp01(m); }
    void set_algo(int a)                    { algo_ = a ? kGrains : kHeads; }
    void set_jitter(float j)                { g_[0].set_jitter(j); g_[1].set_jitter(j); }

    /** Mono in, stereo uit: stem A links, stem B rechts (mate `spread`). */
    inline void Process(float in, float* outL, float* outR) {
        track(in);
        line_.push(in + fb_ * lastWet_);
        float a, b;
        if (algo_ == kGrains) { a = g_[0].Tick(line_); b = g_[1].Tick(line_); }
        else                  { a = h_[0].Tick(line_); b = h_[1].Tick(line_); }
        a *= lvl_[0]; b *= lvl_[1];
        lastWet_ = 0.5f * (a + b);
        const float far = 1.0f - spread_;
        const float wl = a + b * far, wr = b + a * far;
        *outL = in * (1.0f - mix_) + wl * mix_;
        *outR = in * (1.0f - mix_) + wr * mix_;
    }

private:
    static float clamp01(float v) { return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }
    void apply(int k) {
        const float r = shiftRatio(semi_[k] + cent_[k] * 0.01f + 12.0f * voct_[k]);
        h_[k].set_ratio(r); g_[k].set_ratio(r);
    }
    /** Periode tussen stijgende nuldoorgangen van de laaggefilterde ingang. */
    inline void track(float in) {
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
        if (count_ > 4000) period_ = 0.0f;                     // stilte / geen toon
    }
    void applyWindow() {
        float n = winMs_ * 0.001f * sr_;
        if (period_ > 0.0f) {
            // De koppen lezen een half venster uit elkaar; dát moet een heel
            // aantal periodes zijn, dus het venster een even aantal.
            float k = std::floor(n / (2.0f * period_) + 0.5f);
            if (k < 1.0f) k = 1.0f;
            n = 2.0f * k * period_;
        }
        h_[0].set_window_samples(n); h_[1].set_window_samples(n);
    }

    float sr_ = 44100.0f;
    ShiftLine line_;
    HeadShifter h_[2];
    GrainShifter g_[2];
    Algo  algo_ = kHeads;
    float semi_[2] = { 0.0f, 0.0f }, cent_[2] = { 0.0f, 0.0f }, voct_[2] = { 0.0f, 0.0f }, lvl_[2] = { 1.0f, 0.0f };
    float winMs_ = 40.0f, fb_ = 0.0f, spread_ = 0.5f, mix_ = 0.5f, lastWet_ = 0.0f;
    float trackCoef_ = 0.1f, track_ = 0.0f, period_ = 0.0f;
    bool  above_ = false;
    int   count_ = 0;
};

}  // namespace mmb_dsp
