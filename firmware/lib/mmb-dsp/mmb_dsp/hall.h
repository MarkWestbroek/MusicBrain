#pragma once
// HALL — een grote galm in Lexicon-stijl (doc/plans/hall-reverb.md), eigen
// code (MIT). Gedeeld door de Teensy (HallModule.h) en de simulator
// (hall_wasm.cc).
//
// Opbouw, alles gepubliceerde technieken:
//  - pre-delay op de mono-som, met daaruit de vroege reflecties: per kant
//    acht aftakkingen in een patroon dat met Size meeschaalt;
//  - verspreiding: vier all-pass-filters in serie (Schroeder 1962);
//  - de tank: een feedback delay network van 8 lijnen met Householder-
//    menging (Jot & Chaigne 1991). Per lijn een demping in drie banden
//    (laag < 300 Hz, midden, hoog > 3 kHz): de winst per rondgang volgt
//    uit de gewenste galmtijd, g = 10^(−3·L / (T60·fs)), zodat Decay een
//    echte RT60 is en Lo mult / Hi damp de galmtijd van laag en hoog zetten;
//  - modulatie: de lengte van elke lijn beweegt langzaam (sinus met eigen
//    snelheid per lijn, in Random Hall plus een willekeurige dwaling), wat
//    de metalige resonanties wegneemt (de "chorus" van Lexicon);
//  - uitgang: links en rechts uit verschillende lijnen, met Width.
// De vier algoritmes zijn instellingen van dezelfde structuur: hoe groot de
// ruimte kan worden, hoeveel vroege reflecties, hoe sterk de modulatie.
//
// Geheugen: de buffers (~180 KB) haalt de kern zelf van de heap, niet
// uit PSRAM: de tank leest per sample op veel verspreide plekken (FxMem.h).
// release()/acquire() geven ze vrij en terug (parkeren, FW-13); zonder
// geheugen gaat het droge signaal door.

#include <cmath>
#include <cstdint>
#include <cstring>
#include <new>

namespace mmb_dsp {

class Hall {
public:
    enum Control { Algo, Size, Decay, Predelay, Early, Diffusion, HiDamp, LoMult, Mod, Width, Mix, Freeze, kControls };
    enum CvIn { SizeCv, DecayCv, MixCv, FreezeGate, kCvIns };
    enum CvOut { kCvOuts };
    enum Algorithm { kHall = 0, kRoom = 1, kChamber = 2, kRandomHall = 3 };

    static constexpr int kLines = 8;
    static constexpr int kLineMax = 4096;          // per lijn (Size 1,8 × 2011 × 48/48 = 3620)
    static constexpr int kPreMax = 16384;          // 250 ms pre-delay + 75 ms reflecties bij 48 kHz
    static constexpr int kApMax = 1024;

    struct Memory {
        float lines[kLines][kLineMax];
        std::int16_t pre[kPreMax];   // alleen de ingang: 16 bit is genoeg (de Teensy levert int16)
        float ap[4][kApMax];
    };

    Hall() = default;
    Hall(const Hall&) = delete;
    Hall& operator=(const Hall&) = delete;
    ~Hall() { delete m_; }

    /** Buffers vrijgeven; de aanroeper zorgt dat Process niet tegelijk loopt. */
    void release() { Memory* old = m_; m_ = nullptr; delete old; }
    /** Buffers (weer) halen en leegmaken; false als er geen geheugen is. */
    bool acquire() {
        if (!m_) m_ = new (std::nothrow) Memory;
        if (!m_) return false;
        std::memset(m_, 0, sizeof(Memory));
        return true;
    }
    bool hasMemory() const { return m_ != nullptr; }

    void Init(float sampleRate) {
        sr_ = sampleRate;
        acquire();
        for (int i = 0; i < kLines; ++i) {
            pos_[i] = 0; lp_[i] = hp_[i] = 0.0f; phase_[i] = 0.13f * i; walk_[i] = walkTo_[i] = 0.0f; mod_[i] = modTo_[i] = 0.0f;
        }
        for (int k = 0; k < 4; ++k) { apPos_[k] = 0; apLen_[k] = static_cast<int>(kApBase[k] * sr_ / 44100.0f); }
        prePos_ = 0; rng_ = 0x1234567u; tick_ = 0;
        lowCoef_ = 1.0f - std::exp(-6.2831853f * 300.0f / sr_);
        highCoef_ = 1.0f - std::exp(-6.2831853f * 3000.0f / sr_);
        for (int c = 0; c < kControls; ++c) setControl(c, kDefaults[c]);
        for (int i = 0; i < kLines; ++i) lenCur_[i] = lenTarget_[i];
    }

    void setControl(int control, float v) {
        switch (control) {
            case Algo: algo_ = clampi(static_cast<int>(v + 0.5f), 0, 3); break;
            case Size: size_ = clamp01(v); break;
            case Decay: decay_ = v < 0.2f ? 0.2f : (v > 30.0f ? 30.0f : v); break;
            case Predelay: predelayMs_ = v < 0.0f ? 0.0f : (v > 250.0f ? 250.0f : v); break;
            case Early: early_ = clamp01(v); break;
            case Diffusion: diffusion_ = clamp01(v); break;
            case HiDamp: hiDamp_ = clamp01(v); break;
            case LoMult: loMult_ = v < 0.25f ? 0.25f : (v > 4.0f ? 4.0f : v); break;
            case Mod: modAmt_ = clamp01(v); break;
            case Width: width_ = clamp01(v); break;
            case Mix: mix_ = clamp01(v); break;
            case Freeze: freezeKnob_ = v >= 0.5f; break;
            default: return;
        }
        update();
    }

    void setCv(int input, float v) {
        if (v != v) v = 0.0f;
        switch (input) {
            case SizeCv: sizeCv_ = v; break;
            case DecayCv: decayCv_ = v; break;
            case MixCv: mixCv_ = v; break;
            case FreezeGate: freezeGate_ = v >= 0.5f; break;
            default: return;
        }
        update();
    }

    float cvOut(int) const { return 0.0f; }   // geen CV-uitgangen

    /** in[0]/in[1] (R mag nullptr zijn: dan mono), out[0]/out[1]. */
    void Process(const float* const* in, float* const* out, int frames) {
        const float* inL = in[0];
        const float* inR = in[1] ? in[1] : in[0];
        if (!m_) {
            for (int n = 0; n < frames; ++n) {
                const float l = inL ? inL[n] : 0.0f;
                out[0][n] = l;
                out[1][n] = inR ? inR[n] : l;
            }
            return;
        }
        const float* aps = apCoef_;
        std::int16_t* const pre = m_->pre;
        for (int n = 0; n < frames; ++n) {
            const float l = inL ? inL[n] : 0.0f;
            const float r = inR ? inR[n] : l;
            // Modulatie: elke 16 samples een nieuw doel, daartussen lineair.
            if ((tick_++ & 15) == 0) stepModulation();
            for (int i = 0; i < kLines; ++i) mod_[i] += (modTo_[i] - mod_[i]) * (1.0f / 16.0f);

            // Pre-delay en vroege reflecties.
            const float mono = 0.5f * (l + r);
            pre[prePos_] = toI16(mono);
            const float x = readPre(preSamples_);
            float erL = 0.0f, erR = 0.0f;
            for (int k = 0; k < 8; ++k) {
                erL += earlyGain_[k] * readPre(preSamples_ + earlyL_[k]);
                erR += earlyGain_[k] * readPre(preSamples_ + earlyR_[k]);
            }
            prePos_ = (prePos_ + 1) & (kPreMax - 1);

            // Verspreiding: vier all-pass-filters.
            float d = frozen_ ? 0.0f : x;
            for (int k = 0; k < 4; ++k) {
                float* buf = m_->ap[k];
                const int len = apLen_[k];
                const float delayed = buf[apPos_[k]];
                const float v = d - aps[k] * delayed;
                buf[apPos_[k]] = v;
                d = delayed + aps[k] * v;
                if (++apPos_[k] >= len) apPos_[k] = 0;
            }

            // De tank: lezen (gemoduleerd), dempen, Householder, terugschrijven.
            float y[kLines];
            float sum = 0.0f;
            for (int i = 0; i < kLines; ++i) {
                lenCur_[i] += (lenTarget_[i] - lenCur_[i]) * 0.0005f;   // Size glijdt, geen tik
                const float s = readLine(i, lenCur_[i] + mod_[i]);
                // Drie banden: laag (< 300 Hz), hoog (> 3 kHz), midden ertussen.
                lp_[i] += (s - lp_[i]) * lowCoef_;
                const float rest = s - lp_[i];
                hp_[i] += (rest - hp_[i]) * highCoef_;
                const float hi = rest - hp_[i];
                const float mid = rest - hi;
                const float g = gLo_[i] * lp_[i] + gMid_[i] * mid + gHi_[i] * hi;
                y[i] = g;
                sum += g;
            }
            const float h = sum * (2.0f / kLines);
            float tankL = 0.0f, tankR = 0.0f;
            for (int i = 0; i < kLines; ++i) {
                const float fb = y[i] - h + d * kInSign[i] * 0.35f;
                m_->lines[i][pos_[i]] = fb + 1e-18f;   // geen denormalen
                pos_[i] = (pos_[i] + 1) & (kLineMax - 1);
                tankL += kOutL[i] * y[i];
                tankR += kOutR[i] * y[i];
            }
            float wl = 0.5f * tankL + early_ * erL * earlyLevel_;
            float wr = 0.5f * tankR + early_ * erR * earlyLevel_;
            const float mid = 0.5f * (wl + wr), side = 0.5f * (wl - wr) * width_;
            wl = mid + side; wr = mid - side;
            out[0][n] = l * dry_ + wl * wet_;
            out[1][n] = r * dry_ + wr * wet_;
        }
    }

    static constexpr float kDefaults[kControls] = { 0, 0.6f, 2.5f, 20.0f, 0.5f, 0.85f, 0.4f, 1.2f, 0.4f, 1.0f, 0.3f, 0 };
    // Lijnlengten bij 48 kHz en Size-schaal 1 (onderling ondeelbaar).
    static constexpr int kBase[kLines] = { 1031, 1193, 1327, 1471, 1607, 1741, 1879, 2011 };
private:
    static constexpr int kApBase[4] = { 142, 107, 379, 277 };   // bij 44,1 kHz
    static constexpr float kInSign[kLines] = { 1, -1, 1, -1, 1, -1, 1, -1 };
    static constexpr float kOutL[kLines] = { 1, 0, -1, 0, 1, 0, -1, 0 };
    static constexpr float kOutR[kLines] = { 0, 1, 0, 1, 0, -1, 0, -1 };
    // Vroege reflecties in ms bij Size-schaal 1.
    static constexpr float kEarlyLms[8] = { 7.3f, 11.9f, 17.1f, 23.7f, 31.3f, 41.1f, 52.7f, 67.1f };
    static constexpr float kEarlyRms[8] = { 8.9f, 13.7f, 19.3f, 26.1f, 34.7f, 44.3f, 57.1f, 71.9f };

    struct AlgoSet { float sizeMin, sizeMax, modSamples, modHz, random, earlyLevel; };
    static constexpr AlgoSet kAlgo[4] = {
        { 0.60f, 1.80f,  6.0f, 0.50f, 0.25f, 0.6f },   // Hall
        { 0.25f, 0.70f,  3.0f, 0.70f, 0.20f, 1.2f },   // Room
        { 0.40f, 1.10f,  1.5f, 0.40f, 0.10f, 0.8f },   // Chamber
        { 0.60f, 1.80f, 12.0f, 0.80f, 1.00f, 0.6f },   // Random Hall
    };

    static std::int16_t toI16(float v) {
        v = v > 1.0f ? 1.0f : (v < -1.0f ? -1.0f : v);
        return static_cast<std::int16_t>(v * 32767.0f);
    }
    static float clamp01(float v) { return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }
    static int clampi(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }

    float readPre(int delay) const {
        if (delay > kPreMax - 1) delay = kPreMax - 1;
        return m_->pre[(prePos_ - delay) & (kPreMax - 1)] * (1.0f / 32767.0f);
    }
    float readLine(int i, float delay) const {
        if (delay < 2.0f) delay = 2.0f;
        if (delay > kLineMax - 2) delay = static_cast<float>(kLineMax - 2);
        const int di = static_cast<int>(delay);
        const float fr = delay - static_cast<float>(di);
        const float* line = m_->lines[i];
        const float a = line[(pos_[i] - di) & (kLineMax - 1)];
        const float b = line[(pos_[i] - di - 1) & (kLineMax - 1)];
        return a + (b - a) * fr;
    }
    float rand01() { rng_ = rng_ * 1664525u + 1013904223u; return static_cast<float>(rng_ >> 8) * (1.0f / 16777216.0f); }

    void stepModulation() {
        const AlgoSet& a = kAlgo[algo_];
        const float depth = a.modSamples * modAmt_ * (sr_ / 48000.0f);
        const float dt = 16.0f / sr_;
        for (int i = 0; i < kLines; ++i) {
            phase_[i] += a.modHz * (0.7f + 0.083f * i) * dt;
            if (phase_[i] >= 1.0f) phase_[i] -= 1.0f;
            // Willekeurige dwaling: elke ~0,25 s een nieuw doel.
            if (rand01() < dt * 4.0f) walkTo_[i] = rand01() * 2.0f - 1.0f;
            walk_[i] += (walkTo_[i] - walk_[i]) * dt * 3.0f;
            const float s = std::sin(6.2831853f * phase_[i]);
            modTo_[i] = depth * ((1.0f - a.random) * s + a.random * walk_[i]);
        }
    }

    void update() {
        const AlgoSet& a = kAlgo[algo_];
        const float size = clamp01(size_ + sizeCv_);
        const float scale = a.sizeMin + (a.sizeMax - a.sizeMin) * size;
        frozen_ = freezeKnob_ || freezeGate_;
        float t60 = decay_ * std::exp2(4.0f * (decayCv_ < -1.0f ? -1.0f : (decayCv_ > 1.0f ? 1.0f : decayCv_)));
        if (t60 < 0.1f) t60 = 0.1f;
        const float hiRatio = 1.0f - 0.85f * hiDamp_;
        for (int i = 0; i < kLines; ++i) {
            float len = kBase[i] * scale * (sr_ / 48000.0f);
            if (len > kLineMax - 32) len = static_cast<float>(kLineMax - 32);
            lenTarget_[i] = len;
            if (frozen_) { gLo_[i] = gMid_[i] = gHi_[i] = 1.0f; continue; }
            const float perSec = len / sr_;
            gMid_[i] = std::pow(10.0f, -3.0f * perSec / t60);
            gLo_[i]  = std::pow(10.0f, -3.0f * perSec / (t60 * loMult_));
            gHi_[i]  = std::pow(10.0f, -3.0f * perSec / (t60 * hiRatio));
        }
        preSamples_ = static_cast<int>(predelayMs_ * 0.001f * sr_);
        for (int k = 0; k < 8; ++k) {
            earlyL_[k] = static_cast<int>(kEarlyLms[k] * scale * 0.001f * sr_);
            earlyR_[k] = static_cast<int>(kEarlyRms[k] * scale * 0.001f * sr_);
            earlyGain_[k] = ((k & 1) ? -0.55f : 0.55f) * std::pow(0.82f, static_cast<float>(k));
        }
        earlyLevel_ = a.earlyLevel;
        apCoef_[0] = apCoef_[1] = 0.75f * diffusion_;   // Dattorro: 0,75 / 0,625
        apCoef_[2] = apCoef_[3] = 0.625f * diffusion_;
        const float mix = clamp01(mix_ + mixCv_);
        dry_ = std::cos(1.5707963f * mix);
        wet_ = std::sin(1.5707963f * mix);
    }

    float sr_ = 48000.0f;
    Memory* m_ = nullptr;
    int pos_[kLines] = {}, apPos_[4] = {}, apLen_[4] = {}, prePos_ = 0, preSamples_ = 0;
    int earlyL_[8] = {}, earlyR_[8] = {};
    float earlyGain_[8] = {}, earlyLevel_ = 0.6f;
    float lenCur_[kLines] = {}, lenTarget_[kLines] = {};
    float gLo_[kLines] = {}, gMid_[kLines] = {}, gHi_[kLines] = {};
    float lp_[kLines] = {}, hp_[kLines] = {};
    float phase_[kLines] = {}, walk_[kLines] = {}, walkTo_[kLines] = {}, mod_[kLines] = {}, modTo_[kLines] = {};
    float apCoef_[4] = {};
    float lowCoef_ = 0.0f, highCoef_ = 0.0f;
    int algo_ = 0;
    float size_ = 0.6f, decay_ = 2.5f, predelayMs_ = 20.0f, early_ = 0.5f, diffusion_ = 0.85f, hiDamp_ = 0.4f;
    float loMult_ = 1.2f, modAmt_ = 0.4f, width_ = 1.0f, mix_ = 0.3f;
    float sizeCv_ = 0.0f, decayCv_ = 0.0f, mixCv_ = 0.0f, dry_ = 1.0f, wet_ = 0.0f;
    bool freezeKnob_ = false, freezeGate_ = false, frozen_ = false;
    std::uint32_t rng_ = 1u, tick_ = 0;
};

}  // namespace mmb_dsp
