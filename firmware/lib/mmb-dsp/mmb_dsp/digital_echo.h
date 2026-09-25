#pragma once
// Vintage digitale echo (de rack-delays van begin jaren '80: 12-bit
// companderende converters, een bandbreedte van een kilohertz of acht, en
// een modulatie-LFO voor chorus op de herhalingen). Stereo met twee sporen,
// `ratio` voor de R-tijd en cross-feedback, net als het stereo bandecho.
//
// Het karakter zit in de schrijfkop: laagdoorlaat op `band`, dan een
// zero-order-hold op de interne samplefrequentie (2 × band — de aliasing
// dáárvan is het gruis van die kasten), dan µ-law-achtig companderen en
// afkappen op `bits`. De leeskop is een lineair geïnterpoleerde tap die
// door een sinus-LFO wordt gemoduleerd (R een kwartslag verschoven).
//
// Header-only, geen allocatie: de buffers (int16, per spoor bufferLength()
// samples) komen van buiten.
#include <cmath>
#include <cstdint>
#include <cstring>

namespace mmb_dsp {

class DigitalEcho {
public:
    static constexpr float kMaxSeconds = 1.0f;
    static constexpr float kMinSeconds = 0.005f;
    static int bufferLength(float sr) { return static_cast<int>(sr * kMaxSeconds) + 4096; }

    void Init(float sr, int16_t* bufL, int16_t* bufR, int bufferLen) {
        sr_ = sr; len_ = bufferLen;
        buf_[0] = bufL; buf_[1] = bufR;
        for (int ch = 0; ch < 2; ++ch) {
            if (buf_[ch]) std::memset(buf_[ch], 0, sizeof(int16_t) * static_cast<size_t>(len_));
            write_[ch] = 0; delay_[ch] = 0.0f; hold_[ch] = 0.0f; holdCnt_[ch] = 0;
            lpA_[ch] = lpB_[ch] = lpC_[ch] = lpD_[ch] = 0.0f; wet_[ch] = 0.0f;
        }
        slew_ = 1.0f - std::exp(-1.0f / (0.05f * sr));
        phase_ = 0.0f;
        set_mod_rate(0.8f); set_band(8000.0f); set_bits(12);
        set_time(0.3f); delay_[0] = target_[0]; delay_[1] = target_[1];
    }

    void set_time(float s) {
        time_ = s < kMinSeconds ? kMinSeconds : (s > kMaxSeconds ? kMaxSeconds : s);
        applyTime();
    }
    void set_ratio(float r)      { ratio_ = r < 0.25f ? 0.25f : (r > 4.0f ? 4.0f : r); applyTime(); }
    void set_feedback(float f)   { feedback_ = f < 0.0f ? 0.0f : (f > 1.1f ? 1.1f : f); }
    void set_cross(float c)      { cross_ = c < 0.0f ? 0.0f : (c > 1.1f ? 1.1f : c); }
    void set_mix(float m)        { mix_ = clamp01(m); }
    void set_mod_rate(float hz)  { hz = hz < 0.05f ? 0.05f : (hz > 10.0f ? 10.0f : hz); inc_ = hz / sr_; }
    void set_mod_depth(float d)  { depth_ = clamp01(d); }
    /** Converterbreedte 6..16 bit; 12 = de klassieke kasten. */
    void set_bits(int b) {
        b = b < 6 ? 6 : (b > 16 ? 16 : b);
        bits_ = b; steps_ = static_cast<float>((1 << (b - 1)) - 1);
    }
    /** Bandbreedte 1..16 kHz; de interne samplefrequentie is 2 × band. */
    void set_band(float hz) {
        hz = hz < 1000.0f ? 1000.0f : (hz > 16000.0f ? 16000.0f : hz);
        lpCoef_ = 1.0f - std::exp(-6.2831853f * hz / sr_);
        holdN_ = static_cast<int>(sr_ / (2.0f * hz) + 0.5f);
        if (holdN_ < 1) holdN_ = 1;
    }

    bool ready() const { return buf_[0] != nullptr && buf_[1] != nullptr; }

    /** In-place op x[0] (L) en x[1] (R). */
    inline void Process(float* x) {
        if (!ready()) return;
        phase_ += inc_;
        if (phase_ >= 1.0f) phase_ -= 1.0f;
        const float wl = wet_[0], wr = wet_[1];
        for (int ch = 0; ch < 2; ++ch) {
            delay_[ch] += (target_[ch] - delay_[ch]) * slew_;
            float ph = phase_ + (ch ? 0.25f : 0.0f);
            if (ph >= 1.0f) ph -= 1.0f;
            float d = delay_[ch] + depth_ * 0.0025f * sr_ * fastSin(ph);
            if (d < 2.0f) d = 2.0f;
            if (d > static_cast<float>(len_ - 3)) d = static_cast<float>(len_ - 3);

            // Leeskop.
            float rp = static_cast<float>(write_[ch]) - d;
            while (rp < 0.0f) rp += static_cast<float>(len_);
            const int   i0 = static_cast<int>(rp);
            const float fr = rp - static_cast<float>(i0);
            int i1 = i0 + 1; if (i1 >= len_) i1 = 0;
            const float a = buf_[ch][i0] * (1.0f / 32768.0f);
            const float b = buf_[ch][i1] * (1.0f / 32768.0f);
            const float tap = a + (b - a) * fr;
            // Uitgangs-reconstructiefilter (twee polen op `band`).
            lpC_[ch] += (tap - lpC_[ch]) * lpCoef_;
            lpD_[ch] += (lpC_[ch] - lpD_[ch]) * lpCoef_;
            wet_[ch] = lpD_[ch];

            // Schrijfkop: ingang + feedback + kruis → anti-alias LP → ZOH →
            // compander/quantisatie → geheugen.
            const float src = x[ch] + feedback_ * wet_[ch] + cross_ * (ch ? wl : wr);
            lpA_[ch] += (src - lpA_[ch]) * lpCoef_;
            lpB_[ch] += (lpA_[ch] - lpB_[ch]) * lpCoef_;
            if (holdCnt_[ch] <= 0) { hold_[ch] = quantize(lpB_[ch]); holdCnt_[ch] = holdN_; }
            --holdCnt_[ch];
            float w = hold_[ch] * 32767.0f;
            if (w > 32767.0f) w = 32767.0f; else if (w < -32768.0f) w = -32768.0f;
            buf_[ch][write_[ch]] = static_cast<int16_t>(w);
            if (++write_[ch] >= len_) write_[ch] = 0;

            x[ch] = x[ch] * (1.0f - 0.5f * mix_) + wet_[ch] * mix_;
        }
    }

private:
    static float clamp01(float v) { return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }
    void applyTime() { target_[0] = time_ * sr_; target_[1] = time_ * ratio_ * sr_;
                       if (target_[1] > (kMaxSeconds * sr_)) target_[1] = kMaxSeconds * sr_; }
    /** µ-law-achtig companderen (µ = 255), afkappen op `bits`, terug. */
    inline float quantize(float v) const {
        float a = v < 0.0f ? -v : v;
        if (a > 1.0f) a = 1.0f;                                   // de converter clipt hard
        const float c = std::log1p(255.0f * a) * (1.0f / 5.5452f); // 0..1
        const float q = std::floor(c * steps_ + 0.5f) / steps_;
        const float e = std::expm1(q * 5.5452f) * (1.0f / 255.0f);
        return v < 0.0f ? -e : e;
    }
    static float fastSin(float ph) {                     // ph 0..1
        const float x = ph * 6.2831853f - 3.1415927f;
        const float y = 1.2732395f * x - 0.4052847f * x * (x < 0.0f ? -x : x);
        return 0.225f * (y * (y < 0.0f ? -y : y) - y) + y;
    }

    float    sr_ = 44100.0f;
    int16_t* buf_[2] = { nullptr, nullptr };
    int      len_ = 0, write_[2] = { 0, 0 };
    float    time_ = 0.3f, ratio_ = 1.0f, target_[2] = { 0.0f, 0.0f }, delay_[2] = { 0.0f, 0.0f }, slew_ = 0.0f;
    float    feedback_ = 0.4f, cross_ = 0.0f, mix_ = 0.4f, depth_ = 0.2f, inc_ = 0.0f, phase_ = 0.0f;
    int      bits_ = 12, holdN_ = 3, holdCnt_[2] = { 0, 0 };
    float    steps_ = 2047.0f, hold_[2] = { 0.0f, 0.0f };
    float    lpCoef_ = 0.5f, lpA_[2] = { 0.0f, 0.0f }, lpB_[2] = { 0.0f, 0.0f }, lpC_[2] = { 0.0f, 0.0f }, lpD_[2] = { 0.0f, 0.0f };
    float    wet_[2] = { 0.0f, 0.0f };
};

}  // namespace mmb_dsp
