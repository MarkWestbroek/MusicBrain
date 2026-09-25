#pragma once
// BBD-chorus (emmertjesgeheugen, CE-1/Dimension-familie). Een korte
// vertraging (1..40 ms) die door een driehoek-LFO heen en weer wordt
// getrokken; de emmertjesketen zelf is het karakter: een laagdoorlaat aan
// de ingang en de uitgang (`tone`, de anti-aliasfilters van een echte BBD),
// een zachte compander (verzadiging bij hard spelen) en een vleugje
// klokruis (`age`). Twee sporen met een instelbare LFO-fasehoek (`spread`:
// 0 = mono, 1 = tegenfase, het brede stereobeeld van de Dimension) en
// feedback voor de flanger-kant.
//
// Header-only, buffers inline (2 × 2048 floats = 16 KB).
#include <cmath>
#include <cstdint>
#include <cstring>

namespace mmb_dsp {

class BbdChorus {
public:
    static constexpr int kLen = 2048;                 // 46 ms bij 44,1 kHz

    void Init(float sr) {
        sr_ = sr;
        std::memset(buf_, 0, sizeof(buf_));
        write_ = 0; phase_ = 0.0f;
        set_rate(0.6f); set_tone(0.6f);
        lpIn_[0] = lpIn_[1] = lpOut_[0] = lpOut_[1] = 0.0f;
        noise_ = 12345u;
    }

    void set_rate(float hz)    { rate_ = hz < 0.02f ? 0.02f : (hz > 12.0f ? 12.0f : hz); inc_ = rate_ / sr_; }
    void set_depth(float d)    { depth_ = clamp01(d); }
    /** Middenvertraging in ms (1..40): 2–6 = flanger, 8–20 = chorus, 20+ = doubling. */
    void set_delay(float ms)   { delayMs_ = ms < 0.5f ? 0.5f : (ms > 40.0f ? 40.0f : ms); }
    void set_feedback(float f) { feedback_ = f < -0.95f ? -0.95f : (f > 0.95f ? 0.95f : f); }
    void set_mix(float m)      { mix_ = clamp01(m); }
    void set_spread(float s)   { spread_ = clamp01(s); }
    void set_age(float a)      { age_ = clamp01(a); }
    /** Bandbreedte van de emmertjes: 0 = 2 kHz (oud, dof), 1 = 12 kHz. */
    void set_tone(float t) {
        tone_ = clamp01(t);
        const float hz = 2000.0f * std::exp2(tone_ * 2.585f);   // 2 k .. 12 k
        lpCoef_ = 1.0f - std::exp(-6.2831853f * hz / sr_);
    }

    /** In-place op x[0]/x[1]; `stereoIn` false = R krijgt L. */
    inline void Process(float* x, bool stereoIn) {
        phase_ += inc_;
        if (phase_ >= 1.0f) phase_ -= 1.0f;
        const float in0 = x[0], in1 = stereoIn ? x[1] : x[0];
        const float centre = delayMs_ * 0.001f * sr_;
        const float swing  = depth_ * centre * 0.6f;         // ±60 % van de middenvertraging
        for (int ch = 0; ch < 2; ++ch) {
            // Driehoek-LFO, spoor R een `spread`-deel verschoven, lichtjes
            // afgerond zodat de keerpunten niet klikken.
            float ph = phase_ + (ch ? spread_ * 0.5f : 0.0f);
            if (ph >= 1.0f) ph -= 1.0f;
            float tri = ph < 0.5f ? 4.0f * ph - 1.0f : 3.0f - 4.0f * ph;
            tri = tri * (1.5f - 0.5f * tri * tri);            // zachte knieën
            float d = centre + swing * tri;
            if (d < 1.0f) d = 1.0f;
            if (d > static_cast<float>(kLen - 3)) d = static_cast<float>(kLen - 3);

            float rp = static_cast<float>(write_) - d;
            while (rp < 0.0f) rp += static_cast<float>(kLen);
            const int   i0 = static_cast<int>(rp);
            const float fr = rp - static_cast<float>(i0);
            const int   i1 = (i0 + 1) & (kLen - 1);
            const float tap = buf_[ch][i0] + (buf_[ch][i1] - buf_[ch][i0]) * fr;

            // Uitgangsfilter van de BBD + klokruis.
            lpOut_[ch] += (tap - lpOut_[ch]) * lpCoef_;
            const float wet = lpOut_[ch] + age_ * 0.004f * white();

            // Ingangsfilter, compander (zachte verzadiging) en feedback.
            const float src = (ch ? in1 : in0) + feedback_ * lpOut_[ch];
            lpIn_[ch] += (src - lpIn_[ch]) * lpCoef_;
            const float v = lpIn_[ch];
            const float comp = v / (1.0f + 0.25f * (v < 0.0f ? -v : v) * (1.0f + 2.0f * age_));
            buf_[ch][write_] = comp;

            x[ch] = (ch ? in1 : in0) * (1.0f - 0.5f * mix_) + wet * mix_;
        }
        write_ = (write_ + 1) & (kLen - 1);
    }

private:
    static float clamp01(float v) { return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }
    inline float white() {
        noise_ = noise_ * 1664525u + 1013904223u;
        return static_cast<float>(static_cast<int32_t>(noise_)) * (1.0f / 2147483648.0f);
    }

    float    sr_ = 44100.0f;
    float    buf_[2][kLen];
    int      write_ = 0;
    float    phase_ = 0.0f, inc_ = 0.0f, rate_ = 0.6f;
    float    depth_ = 0.5f, delayMs_ = 8.0f, feedback_ = 0.0f, mix_ = 0.5f, spread_ = 1.0f, age_ = 0.3f, tone_ = 0.6f;
    float    lpCoef_ = 0.5f, lpIn_[2] = { 0.0f, 0.0f }, lpOut_[2] = { 0.0f, 0.0f };
    uint32_t noise_ = 12345u;
};

}  // namespace mmb_dsp
