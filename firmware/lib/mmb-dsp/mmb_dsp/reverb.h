#pragma once
// Plaat- en veergalm.
//   Plate  = de Dattorro-tank (input-diffusie, twee gemoduleerde all-passes,
//            vier vertragingen in een acht, demping in de lus, zeven taps
//            per kant) — de gladde studiogalm.
//   Spring = twee veren (L/R iets anders): een vertragingslijn in feedback
//            met acht eerste-orde all-passes in de lus (dispersie: de
//            "boing"), een demping-LP, een ingangs-bandpass en wat
//            modulatie voor het gerommel.
// Header-only; de vertragingsbuffers (float, poolLength() samples) komen
// van buiten, zoals bij het bandecho.
#include <cmath>
#include <cstring>

namespace mmb_dsp {

class Reverb {
public:
    enum Mode { kPlate = 0, kSpring = 1 };
    static constexpr int kMaxPredelayMs = 120;

    /** Benodigde pool in floats voor sample rate `sr`. */
    static int poolLength(float sr) {
        int n = 0;
        for (int i = 0; i < kNumLines; ++i) n += lineLen(i, sr);
        return n;
    }

    void Init(float sr, float* pool, int poolLen) {
        sr_ = sr; pool_ = pool;
        if (!pool_ || poolLen < poolLength(sr)) { pool_ = nullptr; return; }
        std::memset(pool_, 0, sizeof(float) * static_cast<size_t>(poolLen));
        int off = 0;
        for (int i = 0; i < kNumLines; ++i) { base_[i] = off; len_[i] = lineLen(i, sr); pos_[i] = 0; off += len_[i]; }
        for (int i = 0; i < 2; ++i) { lpT_[i] = 0.0f; lpS_[i] = 0.0f; hpX_[i] = hpY_[i] = 0.0f; bpA_[i] = bpB_[i] = 0.0f; }
        for (int i = 0; i < 2; ++i) for (int k = 0; k < kSpringAp; ++k) apS_[i][k] = 0.0f;
        lpIn_ = 0.0f; phase_ = 0.0f;
        hpCoef_ = std::exp(-6.2831853f * 30.0f / sr);
        set_size(0.6f); set_damp(0.4f); set_predelay(10.0f); set_mod(0.3f); set_mix(0.3f);
    }

    void set_mode(int m)        { mode_ = m ? kSpring : kPlate; }
    /** Plate: decay 0,2..0,97 in de lus; spring: feedback 0,5..0,95. */
    void set_size(float s)      { size_ = clamp01(s); }
    /** Demping van het hoog in de lus: 0 = helder, 1 = dof. */
    void set_damp(float d)      { damp_ = clamp01(d); const float hz = 12000.0f * std::exp2(-3.0f * damp_); lpCoef_ = 1.0f - std::exp(-6.2831853f * hz / sr_); }
    void set_predelay(float ms) { pre_ = static_cast<int>((ms < 0.0f ? 0.0f : (ms > kMaxPredelayMs ? kMaxPredelayMs : ms)) * 0.001f * sr_); }
    void set_mod(float m)       { mod_ = clamp01(m); }
    void set_mix(float m)       { mix_ = clamp01(m); }

    bool ready() const { return pool_ != nullptr; }

    /** In-place op x[0]/x[1]. */
    inline void Process(float* x) {
        if (!pool_) return;
        const float inL = x[0], inR = x[1];
        // Predelay op de mono-som, met een zachte ingangs-LP (de tank hoeft
        // geen 20 kHz te horen).
        const float mono = 0.5f * (inL + inR);
        lpIn_ += (mono - lpIn_) * 0.6f;
        const float pre = tap(L_PRE, pre_ < 1 ? 1 : pre_);
        push(L_PRE, lpIn_);
        phase_ += 0.7f / sr_;
        if (phase_ >= 1.0f) phase_ -= 1.0f;
        float wl, wr;
        if (mode_ == kPlate) plate(pre, &wl, &wr);
        else                 spring(pre, &wl, &wr);
        x[0] = inL * (1.0f - mix_) + wl * mix_;
        x[1] = inR * (1.0f - mix_) + wr * mix_;
    }

private:
    // Lijnen: 0 predelay; 1-4 input-diffusie; 5-12 tank; 13-14 veren.
    enum { L_PRE = 0, L_D1, L_D2, L_D3, L_D4, L_AP1, L_DEL1, L_AP2, L_DEL2, L_AP3, L_DEL3, L_AP4, L_DEL4, L_SPR1, L_SPR2, kNumLines };
    static constexpr int kSpringAp = 8;
    // Uitgangsniveau van de plaat: zeven taps opgeteld; een aangehouden toon
    // bouwt in de tank op, dus ruim onder 1 per tap (0,6 liet een sinus van
    // 0,3 boven 1 uitkomen).
    static constexpr float kPlateOut = 0.2f;

    static int lineLen(int i, float sr) {
        // Dattorro-lengtes bij 29761 Hz, geschaald; extra ruimte voor modulatie.
        static constexpr int kRef[kNumLines] = { 0, 142, 107, 379, 277, 672, 4453, 1800, 3720, 908, 4217, 2656, 3163, 0, 0 };
        const float s = sr / 29761.0f;
        if (i == L_PRE)  return static_cast<int>(sr * kMaxPredelayMs * 0.001f) + 8;
        if (i == L_SPR1) return static_cast<int>(sr * 0.046f) + 8;
        if (i == L_SPR2) return static_cast<int>(sr * 0.053f) + 8;
        return static_cast<int>(kRef[i] * s) + 64;
    }
    static float clamp01(float v) { return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }
    inline float* line(int i) { return pool_ + base_[i]; }
    inline void push(int i, float v) { line(i)[pos_[i]] = v; if (++pos_[i] >= len_[i]) pos_[i] = 0; }
    /** Waarde `d` samples geleden (d ≥ 1, lineair geïnterpoleerd). */
    inline float tap(int i, float d) const {
        const float* b = pool_ + base_[i];
        if (d > static_cast<float>(len_[i] - 2)) d = static_cast<float>(len_[i] - 2);
        float rp = static_cast<float>(pos_[i]) - d;
        if (rp < 0.0f) rp += static_cast<float>(len_[i]);
        const int i0 = static_cast<int>(rp);
        int i1 = i0 + 1; if (i1 >= len_[i]) i1 = 0;
        return b[i0] + (b[i1] - b[i0]) * (rp - static_cast<float>(i0));
    }
    /** All-pass over lijn `i` met vaste lengte len−64 (+ modulatie in samples). */
    inline float allpass(int i, float in, float g, float modSamples = 0.0f) {
        const float d = static_cast<float>(len_[i] - 64) + modSamples;
        const float z = tap(i, d);
        const float v = in - g * z;
        push(i, v);
        return z + g * v;
    }
    inline float delay(int i, float in) { const float z = tap(i, static_cast<float>(len_[i] - 64)); push(i, in); return z; }

    void plate(float in, float* wl, float* wr) {
        const float decay = 0.2f + 0.77f * size_;
        float v = in;
        v = allpass(L_D1, v, 0.75f); v = allpass(L_D2, v, 0.75f);
        v = allpass(L_D3, v, 0.625f); v = allpass(L_D4, v, 0.625f);
        const float m = mod_ * 12.0f * std::sin(6.2831853f * phase_);
        // Linkerhelft van de acht.
        float a = v + decay * lpT_[1];
        a = allpass(L_AP1, a, -0.7f, m);
        a = delay(L_DEL1, a);
        lpT_[0] += (a - lpT_[0]) * lpCoef_;
        a = allpass(L_AP2, lpT_[0] * decay, 0.5f);
        a = delay(L_DEL2, a);
        // Rechterhelft.
        float b = v + decay * a;
        b = allpass(L_AP3, b, -0.7f, -m);
        b = delay(L_DEL3, b);
        lpT_[1] += (b - lpT_[1]) * lpCoef_;
        b = allpass(L_AP4, lpT_[1] * decay, 0.5f);
        b = delay(L_DEL4, b);
        // Taps (Dattorro, geschaald in tap()): som van zeven per kant.
        const float s = sr_ / 29761.0f;
        *wl = kPlateOut * ( tap(L_DEL3, 266 * s)  + tap(L_DEL3, 2974 * s) - tap(L_AP4, 1913 * s)
                     + tap(L_DEL4, 1996 * s) - tap(L_DEL1, 1990 * s) - tap(L_AP2, 187 * s) - tap(L_DEL2, 1066 * s));
        *wr = kPlateOut * ( tap(L_DEL1, 353 * s)  + tap(L_DEL1, 3627 * s) - tap(L_AP2, 1228 * s)
                     + tap(L_DEL2, 2673 * s) - tap(L_DEL3, 2111 * s) - tap(L_AP4, 335 * s)  - tap(L_DEL4, 121 * s));
    }

    void spring(float in, float* wl, float* wr) {
        // Ingangs-bandpass (200 Hz .. 4 kHz): een veer hoort geen sub en geen lucht.
        bpA_[0] += (in - bpA_[0]) * 0.45f;                  // LP ~4 kHz
        bpB_[0] += (bpA_[0] - bpB_[0]) * 0.028f;            // LP ~200 Hz (eraf)
        const float src = bpA_[0] - bpB_[0];
        const float fb = 0.5f + 0.45f * size_;
        static constexpr int kLines[2] = { L_SPR1, L_SPR2 };
        float out[2];
        for (int k = 0; k < 2; ++k) {
            const int li = kLines[k];
            const float m = mod_ * 3.0f * std::sin(6.2831853f * (phase_ * 2.3f + k * 0.37f));
            float z = tap(li, static_cast<float>(len_[li] - 8) + m);
            // Dispersie: acht all-passes met een negatieve coëfficiënt — lage
            // frequenties komen later dan hoge, dat is de chirp van een veer.
            for (int a = 0; a < kSpringAp; ++a) {
                const float in1 = z;
                z = -0.62f * in1 + apS_[k][a];
                apS_[k][a] = in1 + 0.62f * z;
            }
            lpS_[k] += (z - lpS_[k]) * lpCoef_;
            const float hp = lpS_[k] - hpX_[k] + hpCoef_ * hpY_[k];
            hpX_[k] = lpS_[k]; hpY_[k] = hp;
            float v = src + fb * hp;
            v = v / (1.0f + 0.3f * (v < 0.0f ? -v : v));     // de veer klapt zacht dicht
            push(li, v);
            out[k] = hp;
        }
        *wl = 1.2f * (out[0] + 0.3f * out[1]);
        *wr = 1.2f * (out[1] + 0.3f * out[0]);
    }

    float  sr_ = 44100.0f;
    float* pool_ = nullptr;
    int    base_[kNumLines] = {}, len_[kNumLines] = {}, pos_[kNumLines] = {};
    Mode   mode_ = kPlate;
    float  size_ = 0.6f, damp_ = 0.4f, mod_ = 0.3f, mix_ = 0.3f, lpCoef_ = 0.5f, hpCoef_ = 0.99f;
    int    pre_ = 441;
    float  lpIn_ = 0.0f, phase_ = 0.0f;
    float  lpT_[2] = { 0.0f, 0.0f }, lpS_[2] = { 0.0f, 0.0f }, hpX_[2] = { 0.0f, 0.0f }, hpY_[2] = { 0.0f, 0.0f };
    float  bpA_[2] = { 0.0f, 0.0f }, bpB_[2] = { 0.0f, 0.0f };
    float  apS_[2][kSpringAp] = {};
};

}  // namespace mmb_dsp
