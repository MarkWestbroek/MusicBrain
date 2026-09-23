#pragma once
/**
 * @file param_eq.h
 * @brief Vierbands parametrische EQ in de geest van de Britse mixer-EQ (SSL
 *        E/G), met de proportionele Q van de Amerikaanse console-EQ (API 550)
 *        als schakelbare stand.
 * @details
 * Wat het karakter maakt, en hoe het hier zit (zie doc/plans/vintage-eq.md):
 *  - **Vier banden**, volledig instelbaar: LF (30–450 Hz) en HF (1,5–16 kHz)
 *    elk schakelbaar **bell of shelf**; LMF (200 Hz–2 kHz) en HMF (600 Hz–
 *    7 kHz) met eigen Q (0,4–4). Gain ±15 dB.
 *  - **HPF** (20–400 Hz, 12 dB/oct; helemaal links = uit) en **LPF** (3–20
 *    kHz; helemaal rechts = uit).
 *  - **Prop. Q** (de Amerikaanse stand): de Q loopt mee met de gain. Bij een
 *    kleine ingreep is de bell breed (0,4× de ingestelde Q), bij ±15 dB smal
 *    (1×). Zo blijft een subtiele boost muzikaal en wordt een grote gericht.
 *    Uit = constante Q, strak en voorspelbaar (de Britse stand).
 *  - Schoon: geen verzadiging. **Output**, **Bypass**.
 *
 * Alle knoppen glijden in ~5 ms (frequentie, gain, Q), zodat draaien niet
 * ritst; de biquads worden alleen herberekend als er iets beweegt. Stereo:
 * dezelfde curve op elk kanaal. Header-only, zonder heap.
 */
#include <cmath>
#include "biquad.h"

namespace mmb_dsp {

class ParamEq {
public:
    enum Param { P_HPF, P_LPF, P_LF_F, P_LF_G, P_LMF_F, P_LMF_G, P_LMF_Q, P_HMF_F, P_HMF_G, P_HMF_Q, P_HF_F, P_HF_G, kParams };

    void Init(float sr) {
        sr_ = sr;
        for (auto& b : st_) for (auto& s : b) s = BiquadState{};
        for (int i = 0; i < kParams; ++i) cur_[i] = tgt_[i];
        dirty_ = true;
        recompute();
    }

    /** Hz; ≤ 20 = uit. */
    void set_hpf(float hz)   { tgt_[P_HPF] = clampf(hz, 16.0f, 400.0f); }
    /** Hz; ≥ 20 kHz = uit. */
    void set_lpf(float hz)   { tgt_[P_LPF] = clampf(hz, 3000.0f, 20000.0f); }
    void set_lf_freq(float hz)  { tgt_[P_LF_F] = clampf(hz, 30.0f, 450.0f); }
    void set_lf_gain(float db)  { tgt_[P_LF_G] = clampf(db, -15.0f, 15.0f); }
    void set_lf_shelf(bool on)  { lfShelf_ = on; dirty_ = true; }
    void set_lmf_freq(float hz) { tgt_[P_LMF_F] = clampf(hz, 200.0f, 2000.0f); }
    void set_lmf_gain(float db) { tgt_[P_LMF_G] = clampf(db, -15.0f, 15.0f); }
    void set_lmf_q(float q)     { tgt_[P_LMF_Q] = clampf(q, 0.4f, 4.0f); }
    void set_hmf_freq(float hz) { tgt_[P_HMF_F] = clampf(hz, 600.0f, 7000.0f); }
    void set_hmf_gain(float db) { tgt_[P_HMF_G] = clampf(db, -15.0f, 15.0f); }
    void set_hmf_q(float q)     { tgt_[P_HMF_Q] = clampf(q, 0.4f, 4.0f); }
    void set_hf_freq(float hz)  { tgt_[P_HF_F] = clampf(hz, 1500.0f, 16000.0f); }
    void set_hf_gain(float db)  { tgt_[P_HF_G] = clampf(db, -15.0f, 15.0f); }
    void set_hf_shelf(bool on)  { hfShelf_ = on; dirty_ = true; }
    void set_prop_q(bool on)    { propQ_ = on; dirty_ = true; }
    void set_output_db(float db) { outGain_ = std::exp(db * 0.11512925f); }
    void set_bypass(bool on) { bypass_ = on; }

    /** Versterking (dB) van de curve op `hz` — voor tests. */
    float responseDb(float hz) const {
        float db = 0.0f;
        for (int i = 0; i < kStages; ++i) db += biquadResponseDb(co_[i], hz, sr_);
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
        for (int c = 0; c < n; ++c) {
            float v = x[c];
            if (!(v == v)) v = 0.0f;
            for (int i = 0; i < kStages; ++i) v = biquadTick(co_[i], st_[i][c], v);
            x[c] = softOut(v * outGain_);
        }
    }

private:
    static constexpr int kStages = 6;      ///< HPF, LPF, LF, LMF, HMF, HF

    void glide() {
        bool moved = dirty_;
        for (int i = 0; i < kParams; ++i) {
            const float d = tgt_[i] - cur_[i];
            // Relatief voor frequenties en Q, absoluut (dB) voor gains.
            const bool gain = (i == P_LF_G || i == P_LMF_G || i == P_HMF_G || i == P_HF_G);
            const float eps = gain ? 1e-3f : 1e-4f * std::fabs(tgt_[i]);
            if (std::fabs(d) > eps) { cur_[i] += 0.35f * d; moved = true; }
            else cur_[i] = tgt_[i];
        }
        if (moved) recompute();
        dirty_ = false;
    }

    /** Q met, als Prop. Q aan staat, de gain erin: breed bij weinig, smal bij veel. */
    float effQ(float q, float gainDb) const {
        if (!propQ_) return q;
        return q * (0.4f + 0.6f * std::fabs(gainDb) / 15.0f);
    }

    void recompute() {
        co_[0] = cur_[P_HPF] <= 20.5f ? rbj::flat() : rbj::highPass(cur_[P_HPF], 0.7071f, sr_);
        co_[1] = cur_[P_LPF] >= 19500.0f ? rbj::flat() : rbj::lowPass(cur_[P_LPF], 0.7071f, sr_);
        co_[2] = lfShelf_ ? rbj::lowShelf(cur_[P_LF_F], cur_[P_LF_G], 1.0f, sr_)
                          : rbj::peak(cur_[P_LF_F], cur_[P_LF_G], effQ(0.9f, cur_[P_LF_G]), sr_);
        co_[3] = rbj::peak(cur_[P_LMF_F], cur_[P_LMF_G], effQ(cur_[P_LMF_Q], cur_[P_LMF_G]), sr_);
        co_[4] = rbj::peak(cur_[P_HMF_F], cur_[P_HMF_G], effQ(cur_[P_HMF_Q], cur_[P_HMF_G]), sr_);
        co_[5] = hfShelf_ ? rbj::highShelf(cur_[P_HF_F], cur_[P_HF_G], 1.0f, sr_)
                          : rbj::peak(cur_[P_HF_F], cur_[P_HF_G], effQ(0.9f, cur_[P_HF_G]), sr_);
    }

    static inline float softOut(float v) {
        const float a = std::fabs(v);
        if (a <= 0.8f) return v;
        const float y = 0.8f + 0.2f * std::tanh((a - 0.8f) * 5.0f);
        return v < 0.0f ? -y : y;
    }
    static float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

    float sr_ = 44100.0f;
    int   count_ = 0;
    float outGain_ = 1.0f;
    bool  lfShelf_ = true, hfShelf_ = true, propQ_ = false, bypass_ = false, dirty_ = true;
    float tgt_[kParams] = { 16.0f, 20000.0f, 100.0f, 0.0f, 600.0f, 0.0f, 1.0f, 2500.0f, 0.0f, 1.0f, 8000.0f, 0.0f };
    float cur_[kParams] = { 16.0f, 20000.0f, 100.0f, 0.0f, 600.0f, 0.0f, 1.0f, 2500.0f, 0.0f, 1.0f, 8000.0f, 0.0f };
    BiquadCoef  co_[kStages];
    BiquadState st_[kStages][4];
};

}  // namespace mmb_dsp
