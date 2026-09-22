#pragma once
/**
 * @file bus_comp.h
 * @brief VCA-buscompressor in de geest van de SSL G-bus: strak, schoon, en de
 *        "lijm" die een mix bij elkaar houdt.
 * @details
 * Wat het karakter maakt, en hoe het hier zit (zie doc/plans/vintage-compressors.md):
 *  - **VCA, feed-forward.** De detector meet de ingang en de VCA regelt
 *    vrijwel zonder kleur. Het karakter zit in de tijden, niet in vervorming.
 *  - **Vaste standen** zoals op het apparaat: Attack 0,1 / 0,3 / 1 / 3 / 10 /
 *    30 ms, Release 0,1 / 0,3 / 0,6 / 1,2 s en **Auto**, Ratio 2 / 4 / 10.
 *    De klassieke busstand is attack 30 ms, release Auto, ratio 2 of 4: de
 *    aanslag komt erdoor en de mix "pompt" mee met de maat.
 *  - **Auto-release:** twee envelopes naast elkaar. Een snelle (100 ms) vangt
 *    losse pieken en laat ze snel los; een trage (1,2 s, traag opbouwend)
 *    groeit alleen bij aanhoudend luid materiaal. De gain reduction is de
 *    grootste van de twee: korte pieken pompen niet, een luid refrein wordt
 *    rustig ingetoomd.
 *  - **Sidechain-hoogdoorlaat** (niet op het origineel, wel op veel
 *    opvolgers): de bas laat de compressor dan minder pompen.
 *  - **Makeup**, **Mix**, **Bypass**, en de gain reduction als CV.
 *
 * Stereo gekoppeld: één detector over alle kanalen. Header-only, zonder heap.
 */
#include <cmath>

namespace mmb_dsp {

class BusComp {
public:
    static constexpr float kMaxGrDb = 30.0f;

    void Init(float sr) {
        sr_ = sr;
        grFast_ = grSlow_ = 0.0f;
        for (int c = 0; c < 4; ++c) hpState_[c] = hpPrev_[c] = 0.0f;
        relSlowAuto_ = coef(1200.0f);
        attSlowAuto_ = coef(400.0f);
        relFastAuto_ = coef(100.0f);
        updateTimes();
        set_sc_hpf(sc_);
    }

    /** Drempel in dBFS. */
    void set_threshold_db(float db) { thresh_ = clampf(db, -60.0f, 0.0f); }
    /** 0..2 = 2:1, 4:1, 10:1. */
    void set_ratio(int r) { ratioSel_ = r < 0 ? 0 : (r > 2 ? 2 : r); }
    /** 0..5 = 0,1 / 0,3 / 1 / 3 / 10 / 30 ms. */
    void set_attack(int a) { attackSel_ = a < 0 ? 0 : (a > 5 ? 5 : a); updateTimes(); }
    /** 0..4 = 0,1 / 0,3 / 0,6 / 1,2 s / Auto. */
    void set_release(int r) { releaseSel_ = r < 0 ? 0 : (r > 4 ? 4 : r); updateTimes(); }
    void set_makeup_db(float db) { makeup_ = dbToLin(db); }
    /** 0..3 = uit / 60 / 100 / 150 Hz in de detector. */
    void set_sc_hpf(int s) {
        sc_ = s < 0 ? 0 : (s > 3 ? 3 : s);
        static const float hz[4] = { 0.0f, 60.0f, 100.0f, 150.0f };
        hpCoef_ = sc_ == 0 ? 0.0f : std::exp(-2.0f * 3.14159265f * hz[sc_] / sr_);
    }
    void set_mix(float m) { mix_ = clampf(m, 0.0f, 1.0f); }
    void set_bypass(bool on) { bypass_ = on; }

    float gr_db() const { return grFast_ > grSlow_ ? grFast_ : grSlow_; }
    /** Gain reduction als CV: 0 = niets, 1 = 20 dB of meer. */
    float gr() const { return clampf(gr_db() * (1.0f / 20.0f), 0.0f, 1.0f); }

    /** Statische gain reduction (dB) bij een detectorniveau in dBFS. */
    float staticGrDb(float levelDb) const {
        static const float r[3] = { 2.0f, 4.0f, 10.0f };
        const float slope = 1.0f - 1.0f / r[ratioSel_];
        const float w = 2.0f;                       // vrij harde knie, zoals het apparaat
        const float over = levelDb - thresh_;
        float gr;
        if (over <= -0.5f * w)     gr = 0.0f;
        else if (over >= 0.5f * w) gr = over * slope;
        else { const float t = over + 0.5f * w; gr = slope * t * t / (2.0f * w); }
        return gr > kMaxGrDb ? kMaxGrDb : gr;
    }

    /** Eén sampleframe van `n` kanalen (≤ 4), in place. */
    inline void Process(float* x, int n) {
        if (n > 4) n = 4;
        float peak = 0.0f;
        for (int c = 0; c < n; ++c) {
            if (!(x[c] == x[c])) x[c] = 0.0f;
            float d = x[c];
            if (hpCoef_ > 0.0f) {                   // eenpolige hoogdoorlaat in de detector
                hpState_[c] = hpCoef_ * (hpState_[c] + d - hpPrev_[c]);
                hpPrev_[c] = d;
                d = hpState_[c];
            }
            const float a = std::fabs(d);
            if (a > peak) peak = a;
        }
        const float levelDb = peak > 1e-9f ? 20.0f * std::log10(peak) : -180.0f;
        const float target = staticGrDb(levelDb);

        if (releaseSel_ == 4) {                     // Auto: snel en traag naast elkaar
            grFast_ += (target > grFast_ ? att_ : relFastAuto_) * (target - grFast_);
            grSlow_ += (target > grSlow_ ? attSlowAuto_ : relSlowAuto_) * (target - grSlow_);
        } else {
            grFast_ += (target > grFast_ ? att_ : rel_) * (target - grFast_);
            grSlow_ = 0.0f;
        }
        if (bypass_) return;

        const float g = dbToLin(-gr_db()) * makeup_;
        for (int c = 0; c < n; ++c) {
            const float y = softOut(x[c] * g);
            x[c] = mix_ * y + (1.0f - mix_) * x[c];
        }
    }

private:
    void updateTimes() {
        static const float a[6] = { 0.1f, 0.3f, 1.0f, 3.0f, 10.0f, 30.0f };
        static const float r[4] = { 100.0f, 300.0f, 600.0f, 1200.0f };
        att_ = coef(a[attackSel_]);
        rel_ = coef(r[releaseSel_ > 3 ? 3 : releaseSel_]);
    }
    float coef(float ms) const { return 1.0f - std::exp(-1.0f / (0.001f * ms * sr_)); }
    static inline float softOut(float v) {
        const float a = std::fabs(v);
        if (a <= 0.8f) return v;
        const float y = 0.8f + 0.2f * std::tanh((a - 0.8f) * 5.0f);
        return v < 0.0f ? -y : y;
    }
    static float dbToLin(float db) { return std::exp(db * 0.11512925f); }
    static float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

    float sr_ = 44100.0f;
    float thresh_ = -18.0f, makeup_ = 1.0f, mix_ = 1.0f;
    int   ratioSel_ = 1, attackSel_ = 5, releaseSel_ = 4, sc_ = 0;
    bool  bypass_ = false;
    float att_ = 0.001f, rel_ = 0.0001f;
    float relFastAuto_ = 0.0002f, relSlowAuto_ = 0.00002f, attSlowAuto_ = 0.00005f;
    float grFast_ = 0.0f, grSlow_ = 0.0f;
    float hpCoef_ = 0.0f, hpState_[4] = {}, hpPrev_[4] = {};
};

}  // namespace mmb_dsp
