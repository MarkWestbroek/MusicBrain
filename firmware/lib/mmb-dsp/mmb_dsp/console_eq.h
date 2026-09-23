#pragma once
/**
 * @file console_eq.h
 * @brief Console-EQ in de geest van de Britse klasse-A kanaal-EQ (Neve
 *        1073): vaste keuzefrequenties, brede shelves met een bult, een
 *        inductor-middenband en een warme trap.
 * @details
 * Wat het karakter maakt, en hoe het hier zit (zie doc/plans/vintage-eq.md):
 *  - **HPF** uit / 50 / 80 / 160 / 300 Hz, 18 dB/oct (2e orde Butterworth +
 *    1e orde) — het filter waar de 1073 om bekendstaat.
 *  - **Low** 35 / 60 / 110 / 220 Hz, ±16 dB: een shelf met slope 1,4, dus
 *    een lichte bult bij de knik (de inductor) en een kleine dip aan de
 *    andere kant. Daardoor klinkt +6 dB laag stevig, niet wollig.
 *  - **Mid** 360 / 700 / 1600 / 3200 / 4800 / 7200 Hz, ±18 dB: bell met een
 *    matige Q die licht meeloopt met de gain (0,7 → 0,95 bij vol), zodat
 *    kleine ingrepen breed zijn en grote wat gerichter.
 *  - **High** 12 kHz, ±16 dB: shelf met slope 1,2.
 *  - **Color**: klasse-A/transformator-verzadiging (asymmetrisch, even én
 *    oneven harmonischen) rond een werkpunt van −12 dBFS, dubbel bemonsterd op
 *    alleen het vervormingsdeel; 0 = schoon, 1 = zoals het apparaat, 2 = dik.
 *  - **Output**, **Bypass**.
 *
 * Versterkingen glijden in ~5 ms naar hun stand (geen geritsel bij draaien);
 * een frequentiekeuze schakelt direct. Stereo: dezelfde curve op elk kanaal.
 * Header-only, zonder heap.
 */
#include <cmath>
#include "biquad.h"

namespace mmb_dsp {

class ConsoleEq {
public:
    void Init(float sr) {
        sr_ = sr;
        for (auto& b : st_) for (auto& s : b) s = BiquadState{};
        for (int c = 0; c < 4; ++c) prev_[c] = dc_[c] = 0.0f;
        dcCoef_ = 1.0f - std::exp(-2.0f * 3.14159265f * 5.0f / sr);
        for (int i = 0; i < 3; ++i) cur_[i] = tgt_[i];
        dirty_ = true;
        recompute();
    }

    /** 0..4 = uit / 50 / 80 / 160 / 300 Hz. */
    void set_hpf(int i)       { hpfSel_ = clampi(i, 0, 4); dirty_ = true; }
    /** 0..3 = 35 / 60 / 110 / 220 Hz. */
    void set_low_freq(int i)  { lowSel_ = clampi(i, 0, 3); dirty_ = true; }
    void set_low_gain(float db)  { tgt_[0] = clampf(db, -16.0f, 16.0f); }
    /** 0..5 = 360 / 700 / 1600 / 3200 / 4800 / 7200 Hz. */
    void set_mid_freq(int i)  { midSel_ = clampi(i, 0, 5); dirty_ = true; }
    void set_mid_gain(float db)  { tgt_[1] = clampf(db, -18.0f, 18.0f); }
    void set_high_gain(float db) { tgt_[2] = clampf(db, -16.0f, 16.0f); }
    void set_output_db(float db) { outGain_ = std::exp(db * 0.11512925f); }
    void set_color(float c) { color_ = clampf(c, 0.0f, 2.0f); }
    void set_bypass(bool on) { bypass_ = on; }

    /** Versterking (dB) van de filtercurve op `hz`, zonder de trap — voor tests. */
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
        const float k = color_ * kDrive;
        for (int c = 0; c < n; ++c) {
            float v = x[c];
            if (!(v == v)) v = 0.0f;
            for (int i = 0; i < kStages; ++i) v = biquadTick(co_[i], st_[i][c], v);
            // De trap: asymmetrisch rond het werkpunt, residu dubbel bemonsterd.
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
    static constexpr int   kStages = 5;       ///< HP2, HP1, low, mid, high
    static constexpr float kDrive = 0.4f;
    static constexpr float kBias  = 0.15f;
    static constexpr float kOp    = 4.0f;     ///< werkpunt −12 dBFS

    void glide() {
        bool moved = dirty_;
        for (int i = 0; i < 3; ++i) {
            const float d = tgt_[i] - cur_[i];
            if (std::fabs(d) > 1e-3f) { cur_[i] += 0.35f * d; moved = true; }
            else cur_[i] = tgt_[i];
        }
        if (moved) recompute();
        dirty_ = false;
    }

    void recompute() {
        static const float hpfHz[5] = { 0.0f, 50.0f, 80.0f, 160.0f, 300.0f };
        static const float lowHz[4] = { 35.0f, 60.0f, 110.0f, 220.0f };
        static const float midHz[6] = { 360.0f, 700.0f, 1600.0f, 3200.0f, 4800.0f, 7200.0f };
        if (hpfSel_ == 0) { co_[0] = rbj::flat(); co_[1] = rbj::flat(); }
        else {
            co_[0] = rbj::highPass(hpfHz[hpfSel_], 0.7071f, sr_);   // 3e orde: Butterworth-paar + 1e orde
            co_[1] = rbj::highPass1(hpfHz[hpfSel_], sr_);
        }
        co_[2] = rbj::lowShelf(lowHz[lowSel_], cur_[0], 1.4f, sr_);
        const float q = 0.7f + 0.25f * std::fabs(cur_[1]) / 18.0f;   // licht proportioneel
        co_[3] = rbj::peak(midHz[midSel_], cur_[1], q, sr_);
        co_[4] = rbj::highShelf(12000.0f, cur_[2], 1.2f, sr_);
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
    int   hpfSel_ = 0, lowSel_ = 1, midSel_ = 2, count_ = 0;
    float outGain_ = 1.0f, color_ = 1.0f;
    bool  bypass_ = false, dirty_ = true;
    float tgt_[3] = { 0, 0, 0 }, cur_[3] = { 0, 0, 0 };   // dB: low, mid, high
    BiquadCoef  co_[kStages];
    BiquadState st_[kStages][4];
    float prev_[4] = {}, dc_[4] = {}, dcCoef_ = 0.001f;
};

}  // namespace mmb_dsp
