#pragma once
/**
 * @file pump_comp.h
 * @brief PUMP: VCA-compressor met sidechain en gate, in de geest van de
 *        Alesis 3630 (de pomp van de French house).
 * @details
 * Zie doc/plans/sidechain-comp.md. Wat het karakter maakt:
 *  - **VCA, feed-forward, schoon.** Geen vervorming in de kern; het "vuile"
 *    van het apparaat komt van een snelle release die de golfvorm zelf
 *    moduleert, en dat gebeurt hier vanzelf.
 *  - **Peak-detector** met traploze attack (0,1–200 ms) en release
 *    (50 ms–3 s), als eenpolige volgers in het dB-domein: de release loopt
 *    lineair in dB terug, zoals bij een VCA. Dat is de pomp.
 *  - **RMS-stand:** een gemiddelde over ~30 ms, attack en release volgen het
 *    programma (een snelle en een trage envelope, de grootste wint); de
 *    knoppen doen dan niets, zoals op het apparaat.
 *  - **Sidechain:** met een sleutel aangesloten luistert de detector alleen
 *    daarnaar (mono). Los: naar de eigen ingang (de hoogste van L en R).
 *    `sc_hp` (niet op het apparaat) haalt laag uit de detector, 12 dB/oct.
 *  - **Knie** hard of zacht (±6 dB), ratio 1 … 20 en ∞ (begrenzer).
 *  - **Gate** na de compressor, op de eigen ingang: opent in ~0,5 ms, sluit
 *    in `gate_rate`. Werkt ook in bypass, zoals op het apparaat.
 *  - **Listen:** hoor de sleutel (na het filter) in plaats van het signaal.
 *
 * Geen buffers met een vaste lengte: alle tijden volgen `Init(sr)`, dus de
 * kern rekent op elke samplerate (MMB_RATE_FLEX in de wasm). Header-only,
 * zonder heap.
 */
#include <cmath>

namespace mmb_dsp {

class PumpComp {
public:
    static constexpr float kMaxGrDb     = 40.0f;
    static constexpr float kRefDb       = -18.0f;   ///< 0 dB op de knop = −18 dBFS
    static constexpr float kGateOffDb   = -70.0f;   ///< gate helemaal links = uit
    static constexpr float kRatioInf    = 20.5f;    ///< ratio vanaf hier = ∞

    void Init(float sr) {
        sr_ = sr;
        gr_ = grSlow_ = 0.0f;
        ms_ = 0.0f;
        for (int i = 0; i < 2; ++i) hp1_[i] = hp1p_[i] = hp2_[i] = hp2p_[i] = 0.0f;
        gateEnv_ = 0.0f; gateGain_ = 1.0f; gateOpen_ = true;
        msCoef_      = coef(30.0f);
        rmsAtt_      = coef(5.0f);
        rmsRelFast_  = coef(150.0f);
        rmsRelSlow_  = coef(1500.0f);
        rmsAttSlow_  = coef(400.0f);
        gateEnvRel_  = coef(20.0f);
        gateOpenCf_  = coef(0.5f);
        set_attack_ms(attMs_);
        set_release_ms(relMs_);
        set_gate_rate_ms(gateRateMs_);
        set_sc_hp(scSel_);
    }

    /** Drempel in dB op de schaal van het apparaat (−40 … +20; 0 = −18 dBFS). */
    void set_threshold_db(float db) { thresh_ = clampf(db, -40.0f, 20.0f) + kRefDb; }
    /** 1 … 20; vanaf 20,5 = ∞ (begrenzer). */
    void set_ratio(float r) {
        r = clampf(r, 1.0f, 21.0f);
        slope_ = r >= kRatioInf ? 1.0f : 1.0f - 1.0f / r;
    }
    void set_attack_ms(float ms)  { attMs_ = clampf(ms, 0.1f, 200.0f);   att_ = coef(attMs_); }
    void set_release_ms(float ms) { relMs_ = clampf(ms, 50.0f, 3000.0f); rel_ = coef(relMs_); }
    /** 0 = Peak, 1 = RMS. */
    void set_rms(bool on) { rms_ = on; }
    /** 0 = hard, 1 = zacht (±6 dB). */
    void set_soft_knee(bool on) { knee_ = on ? 12.0f : 0.0f; }
    void set_output_db(float db) { out_ = dbToLin(clampf(db, -20.0f, 20.0f)); }
    /** Gate-drempel in dBFS; −70 (helemaal links) = uit. */
    void set_gate_db(float db) { gateDb_ = clampf(db, kGateOffDb, 0.0f); }
    /** Sluittijd van de gate, 20 ms … 2 s. */
    void set_gate_rate_ms(float ms) {
        gateRateMs_ = clampf(ms, 20.0f, 2000.0f);
        gateCloseCf_ = coef(gateRateMs_ * 0.25f);   // na `rate` ~98 % dicht
    }
    /** 0..3 = uit / 60 / 100 / 150 Hz in de detector (12 dB/oct). */
    void set_sc_hp(int s) {
        scSel_ = s < 0 ? 0 : (s > 3 ? 3 : s);
        static const float hz[4] = { 0.0f, 60.0f, 100.0f, 150.0f };
        hpCoef_ = scSel_ == 0 ? 0.0f : std::exp(-2.0f * 3.14159265f * hz[scSel_] / sr_);
    }
    void set_listen(bool on) { listen_ = on; }
    void set_mix(float m) { mix_ = clampf(m, 0.0f, 1.0f); }
    void set_bypass(bool on) { bypass_ = on; }

    float gr_db() const { return gr_ > grSlow_ ? gr_ : grSlow_; }
    /** Gain reduction als CV: 0 = niets, 1 = 20 dB of meer. */
    float gr() const { return clampf(gr_db() * (1.0f / 20.0f), 0.0f, 1.0f); }
    /** Gate open (ook waar als de gate uit staat). */
    bool gate_open() const { return gateOpen_; }

    /** Statische gain reduction (dB) bij een detectorniveau in dBFS. */
    float staticGrDb(float levelDb) const {
        const float over = levelDb - thresh_;
        float gr;
        if (knee_ <= 0.0f)              gr = over > 0.0f ? over * slope_ : 0.0f;
        else if (over <= -0.5f * knee_) gr = 0.0f;
        else if (over >= 0.5f * knee_)  gr = over * slope_;
        else { const float t = over + 0.5f * knee_; gr = slope_ * t * t / (2.0f * knee_); }
        return gr > kMaxGrDb ? kMaxGrDb : gr;
    }

    /**
     * Eén stereo sampleframe in place. `sc` is de sleutel; `scOn` zegt of er
     * een kabel op zit (anders luistert de detector naar L en R).
     */
    inline void Process(float* x, float sc, bool scOn) {
        if (!(x[0] == x[0])) x[0] = 0.0f;
        if (!(x[1] == x[1])) x[1] = 0.0f;
        if (!(sc == sc)) sc = 0.0f;

        // ── Detector: sleutel of eigen ingang, door de hoogdoorlaat ──────────
        float key, level;
        if (scOn) {
            key = hp(0, sc);
            level = std::fabs(key);
        } else {
            const float a = hp(0, x[0]), b = hp(1, x[1]);
            key = 0.5f * (a + b);
            level = std::fabs(a) > std::fabs(b) ? std::fabs(a) : std::fabs(b);
        }

        if (rms_) {
            ms_ += msCoef_ * (level * level - ms_);
            const float levelDb = ms_ > 1e-18f ? 10.0f * std::log10(ms_) + 3.01f : -180.0f;  // sinus-RMS ≈ piek
            const float target = staticGrDb(levelDb);
            gr_     += (target > gr_     ? rmsAtt_     : rmsRelFast_) * (target - gr_);
            grSlow_ += (target > grSlow_ ? rmsAttSlow_ : rmsRelSlow_) * (target - grSlow_);
        } else {
            const float levelDb = level > 1e-9f ? 20.0f * std::log10(level) : -180.0f;
            const float target = staticGrDb(levelDb);
            gr_ += (target > gr_ ? att_ : rel_) * (target - gr_);
            grSlow_ = 0.0f;
        }

        // ── Gate op de eigen ingang (ook in bypass) ──────────────────────────
        const float in = std::fabs(x[0]) > std::fabs(x[1]) ? std::fabs(x[0]) : std::fabs(x[1]);
        gateEnv_ = in > gateEnv_ ? in : gateEnv_ + gateEnvRel_ * (in - gateEnv_);
        if (gateDb_ <= kGateOffDb) {
            gateOpen_ = true;
        } else {
            const float envDb = gateEnv_ > 1e-9f ? 20.0f * std::log10(gateEnv_) : -180.0f;
            if (gateOpen_ && envDb < gateDb_ - 4.0f) gateOpen_ = false;     // 4 dB hysterese
            else if (!gateOpen_ && envDb > gateDb_)  gateOpen_ = true;
        }
        const float gTarget = gateOpen_ ? 1.0f : 0.0f;
        gateGain_ += (gateOpen_ ? gateOpenCf_ : gateCloseCf_) * (gTarget - gateGain_);

        if (listen_) { x[0] = x[1] = key; return; }

        if (bypass_) { x[0] *= gateGain_; x[1] *= gateGain_; return; }

        const float g = dbToLin(-gr_db()) * out_ * gateGain_;
        const float dry = (1.0f - mix_) * gateGain_;
        for (int c = 0; c < 2; ++c) x[c] = mix_ * softOut(x[c] * g) + dry * x[c];
    }

private:
    /** Twee eenpolige hoogdoorlaten achter elkaar (12 dB/oct), per kanaal. */
    inline float hp(int c, float d) {
        if (hpCoef_ <= 0.0f) return d;
        hp1_[c] = hpCoef_ * (hp1_[c] + d - hp1p_[c]);       hp1p_[c] = d;
        hp2_[c] = hpCoef_ * (hp2_[c] + hp1_[c] - hp2p_[c]); hp2p_[c] = hp1_[c];
        return hp2_[c];
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
    float thresh_ = -10.0f + kRefDb, slope_ = 0.75f, knee_ = 0.0f, out_ = 1.0f, mix_ = 1.0f;
    float attMs_ = 1.0f, relMs_ = 150.0f, gateRateMs_ = 200.0f, gateDb_ = kGateOffDb;
    int   scSel_ = 0;
    bool  rms_ = false, listen_ = false, bypass_ = false;
    float att_ = 0.02f, rel_ = 0.0002f;
    float msCoef_ = 0.001f, rmsAtt_ = 0.005f, rmsRelFast_ = 0.0002f, rmsRelSlow_ = 0.00002f, rmsAttSlow_ = 0.00005f;
    float gr_ = 0.0f, grSlow_ = 0.0f, ms_ = 0.0f;
    float hpCoef_ = 0.0f, hp1_[2] = {}, hp1p_[2] = {}, hp2_[2] = {}, hp2p_[2] = {};
    float gateEnv_ = 0.0f, gateGain_ = 1.0f, gateEnvRel_ = 0.001f, gateOpenCf_ = 0.05f, gateCloseCf_ = 0.0005f;
    bool  gateOpen_ = true;
};

}  // namespace mmb_dsp
