#pragma once
/**
 * @file program_eq.h
 * @brief Passieve program-EQ in de geest van de Pultec EQP-1A: brede,
 *        muzikale curves, een buistrap, en de beroemde "Pultec-truc".
 * @details
 * Wat het karakter maakt, en hoe het hier zit (zie doc/plans/vintage-compressors.md):
 *  - **Laag:** frequentie 20 / 30 / 60 / 100 Hz, met aparte knoppen voor
 *    **Boost** (tot +13,5 dB, een shelf met een lichte bult bij de
 *    frequentie) en **Atten** (tot −10 dB, een zachtere shelf die hoger
 *    begint, rond 3× de frequentie).
 *  - **De Pultec-truc:** beide tegelijk opendraaien. Omdat de verzwakking
 *    hoger begint en minder diep gaat, blijft er onderin een stevige boost en
 *    ontstaat er net erboven een dip: vol maar niet modderig.
 *  - **Hoog:** een **Boost**-bell op 3 / 4 / 5 / 8 / 10 / 12 / 16 kHz (tot
 *    +16 dB) met **Bandwidth** van scherp naar breed, en een aparte **Atten**
 *    (high shelf op 5 / 10 / 20 kHz, tot −16 dB).
 *  - **Buistrap:** lichte verzadiging (vooral even harmonischen), met
 *    **Color** te regelen (0 = schoon), dubbel bemonsterd.
 *  - **Output** (niet op het origineel) om het niveau gelijk te trekken bij
 *    een A/B met **Bypass**.
 *
 * Knoppen 0..10 zoals op het apparaat. De filters zijn biquads (RBJ); de
 * versterkingen glijden in ~5 ms naar hun nieuwe stand, zodat draaien niet
 * rits. Stereo: dezelfde curve op elk kanaal. Header-only, zonder heap.
 */
#include <cmath>

namespace mmb_dsp {

class ProgramEq {
public:
    void Init(float sr) {
        sr_ = sr;
        for (auto& b : bq_) for (auto& s : b) s = State{};
        for (int c = 0; c < 4; ++c) prev_[c] = dc_[c] = 0.0f;
        dcCoef_ = 1.0f - std::exp(-2.0f * 3.14159265f * 5.0f / sr);
        for (int i = 0; i < 4; ++i) cur_[i] = tgt_[i];
        dirty_ = true;
        recompute();
    }

    /** 0..3 = 20 / 30 / 60 / 100 Hz. */
    void set_low_freq(int i)   { lowSel_ = clampi(i, 0, 3); dirty_ = true; }
    void set_low_boost(float k)  { tgt_[0] = 1.35f * clampf(k, 0.0f, 10.0f); }
    void set_low_atten(float k)  { tgt_[1] = -1.0f * clampf(k, 0.0f, 10.0f); }
    /** 0..6 = 3 / 4 / 5 / 8 / 10 / 12 / 16 kHz. */
    void set_high_freq(int i)  { highSel_ = clampi(i, 0, 6); dirty_ = true; }
    void set_high_boost(float k) { tgt_[2] = 1.6f * clampf(k, 0.0f, 10.0f); }
    /** 0 = scherp .. 10 = breed. */
    void set_bandwidth(float k)  { bw_ = clampf(k, 0.0f, 10.0f); dirty_ = true; }
    /** 0..2 = 5 / 10 / 20 kHz. */
    void set_atten_freq(int i) { attSel_ = clampi(i, 0, 2); dirty_ = true; }
    void set_high_atten(float k) { tgt_[3] = -1.6f * clampf(k, 0.0f, 10.0f); }
    void set_output_db(float db) { outGain_ = std::exp(db * 0.11512925f); }
    void set_color(float c) { color_ = clampf(c, 0.0f, 2.0f); }
    void set_bypass(bool on) { bypass_ = on; }

    /** Versterking (dB) van de filtercurve op `hz`, zonder buistrap — voor tests. */
    float responseDb(float hz) const {
        const float w = 2.0f * 3.14159265f * hz / sr_;
        float db = 0.0f;
        for (const auto& k : co_) {
            // |H(e^jw)| van één biquad
            const float cr = std::cos(w), ci = -std::sin(w), c2r = std::cos(2 * w), c2i = -std::sin(2 * w);
            const float nr = k.b0 + k.b1 * cr + k.b2 * c2r, ni = k.b1 * ci + k.b2 * c2i;
            const float dr = 1.0f + k.a1 * cr + k.a2 * c2r, di = k.a1 * ci + k.a2 * c2i;
            db += 10.0f * std::log10((nr * nr + ni * ni) / (dr * dr + di * di));
        }
        return db;
    }

    /** Eén sampleframe van `n` kanalen (≤ 4), in place. */
    inline void Process(float* x, int n) {
        if (n > 4) n = 4;
        if (--count_ <= 0) { count_ = 32; glide(); }
        if (bypass_) {
            for (int c = 0; c < n; ++c) if (!(x[c] == x[c])) x[c] = 0.0f;
            return;
        }
        const float k = color_ * kDrive;
        for (int c = 0; c < n; ++c) {
            float v = x[c];
            if (!(v == v)) v = 0.0f;
            for (int s = 0; s < 4; ++s) v = tick(co_[s], bq_[s][c], v);
            // Buistrap rond zijn werkpunt (−12 dBFS), dubbel bemonsterd.
            const float u = v * kOp;
            const float m = 0.5f * (prev_[c] + u);
            float y = u + 0.5f * ((shape(m, k) - m) + (shape(u, k) - u));
            prev_[c] = u;
            dc_[c] += dcCoef_ * (y - dc_[c]);
            y = (y - dc_[c]) * (1.0f / kOp);
            x[c] = softOut(y * outGain_);
        }
    }

private:
    struct Coef  { float b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0; };
    struct State { float z1 = 0, z2 = 0; };

    static constexpr float kDrive = 0.35f;
    static constexpr float kBias  = 0.1f;
    static constexpr float kOp    = 4.0f;     ///< werkpunt van de buis: −12 dBFS

    static inline float tick(const Coef& k, State& s, float x) {
        const float y = k.b0 * x + s.z1;
        s.z1 = k.b1 * x - k.a1 * y + s.z2;
        s.z2 = k.b2 * x - k.a2 * y;
        return y;
    }

    /** Versterkingen glijden naar hun doel; alleen herberekenen als er iets beweegt. */
    void glide() {
        bool moved = dirty_;
        for (int i = 0; i < 4; ++i) {
            const float d = tgt_[i] - cur_[i];
            if (std::fabs(d) > 1e-3f) { cur_[i] += 0.35f * d; moved = true; }
            else cur_[i] = tgt_[i];
        }
        if (moved) recompute();
        dirty_ = false;
    }

    void recompute() {
        static const float lowHz[4]  = { 20.0f, 30.0f, 60.0f, 100.0f };
        static const float highHz[7] = { 3000.0f, 4000.0f, 5000.0f, 8000.0f, 10000.0f, 12000.0f, 16000.0f };
        static const float attHz[3]  = { 5000.0f, 10000.0f, 20000.0f };
        const float fl = lowHz[lowSel_];
        co_[0] = lowShelf(fl * 1.25f, cur_[0], 1.0f);        // boost met een bult rond de frequentie
        co_[1] = lowShelf(fl * 3.0f, cur_[1], 0.5f);         // atten: hoger en zachter
        const float q = 2.5f * std::pow(0.35f / 2.5f, bw_ / 10.0f);
        co_[2] = peak(highHz[highSel_], cur_[2], q);
        co_[3] = highShelf(attHz[attSel_], cur_[3], 0.707f);
    }

    Coef lowShelf(float f, float db, float q) const {
        const float A = std::pow(10.0f, db / 40.0f), w = w0(f), cs = std::cos(w), al = std::sin(w) / (2 * q);
        const float sa = 2 * std::sqrt(A) * al;
        return norm(A * ((A + 1) - (A - 1) * cs + sa), 2 * A * ((A - 1) - (A + 1) * cs),
                    A * ((A + 1) - (A - 1) * cs - sa),
                    (A + 1) + (A - 1) * cs + sa, -2 * ((A - 1) + (A + 1) * cs), (A + 1) + (A - 1) * cs - sa);
    }
    Coef highShelf(float f, float db, float q) const {
        const float A = std::pow(10.0f, db / 40.0f), w = w0(f), cs = std::cos(w), al = std::sin(w) / (2 * q);
        const float sa = 2 * std::sqrt(A) * al;
        return norm(A * ((A + 1) + (A - 1) * cs + sa), -2 * A * ((A - 1) + (A + 1) * cs),
                    A * ((A + 1) + (A - 1) * cs - sa),
                    (A + 1) - (A - 1) * cs + sa, 2 * ((A - 1) - (A + 1) * cs), (A + 1) - (A - 1) * cs - sa);
    }
    Coef peak(float f, float db, float q) const {
        const float A = std::pow(10.0f, db / 40.0f), w = w0(f), cs = std::cos(w), al = std::sin(w) / (2 * q);
        return norm(1 + al * A, -2 * cs, 1 - al * A, 1 + al / A, -2 * cs, 1 - al / A);
    }
    float w0(float f) const {
        const float fmax = 0.45f * sr_;                     // niet tegen Nyquist aan
        return 2.0f * 3.14159265f * (f < fmax ? f : fmax) / sr_;
    }
    static Coef norm(float b0, float b1, float b2, float a0, float a1, float a2) {
        Coef k; k.b0 = b0 / a0; k.b1 = b1 / a0; k.b2 = b2 / a0; k.a1 = a1 / a0; k.a2 = a2 / a0;
        return k;
    }
    static inline float shape(float v, float k) {
        if (k < 1e-4f) return v;
        const float tb = std::tanh(k * kBias);
        return (std::tanh(k * (v + kBias)) - tb) / (k * (1.0f - tb * tb));
    }
    static inline float softOut(float v) {
        const float a = std::fabs(v);
        if (a <= 0.8f) return v;
        const float y = 0.8f + 0.2f * std::tanh((a - 0.8f) * 5.0f);
        return v < 0.0f ? -y : y;
    }
    static float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
    static int clampi(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }

    float sr_ = 44100.0f;
    int   lowSel_ = 2, highSel_ = 4, attSel_ = 1, count_ = 0;
    float bw_ = 5.0f, outGain_ = 1.0f, color_ = 1.0f;
    bool  bypass_ = false, dirty_ = true;
    float tgt_[4] = { 0, 0, 0, 0 }, cur_[4] = { 0, 0, 0, 0 };   // dB: low boost, low atten, high boost, high atten
    Coef  co_[4];
    State bq_[4][4];
    float prev_[4] = {}, dc_[4] = {}, dcCoef_ = 0.001f;
};

}  // namespace mmb_dsp
