#pragma once
/**
 * @file tape_echo.h
 * @brief Bandecho — één-koppige tape-delay met verzadiging, bandbreedte-
 *        verlies per omloop, en wow/flutter op de bandsnelheid.
 * @details
 * Header-only, float, samplerate-onafhankelijk; geen Arduino/Teensy-
 * afhankelijkheden. Dezelfde code draait in `TapeEchoModule.h` (Teensy,
 * 44,1 kHz) en in de browser-simulator (`tools/mmb-wasm/tapeecho_wasm.cc`).
 *
 * Signaalpad (per sample):
 *
 *     in ──┬──────────────────────────────────────────► dry
 *          │
 *          └─(+ feedback·wet)─► drive/sat ─► tone-LP ─► [band] ─► HP ─┬─► wet
 *                                                          ▲            │
 *                                                          └────────────┘
 *
 * De band is een int16-ringbuffer (zoals echte band: begrensd, korrelig).
 * De leeskop staat op `tijd + wow + flutter` achter de schrijfkop; de
 * tijd zelf wordt traag geslewd (~120 ms) zodat een draai aan de tijdknop
 * de toonhoogte laat zwiepen, precies zoals een bandmotor die van snelheid
 * verandert. Feedback mag boven 1 (zelfoscillatie); de verzadiger houdt
 * het in toom.
 *
 * Controls: time (s), feedback (0..1,1), mix (0..1), tone (0..1 → LP
 * 0,8..12,8 kHz), wow (0..1), flutter (0..1), drive (0..1).
 */

#include <cmath>
#include <cstdint>
#include <cstring>

namespace mmb_dsp {

class TapeEcho {
public:
    static constexpr float kMaxSeconds = 1.0f;
    static constexpr float kMinSeconds = 0.02f;

    /** Benodigde bufferlengte (int16-samples) voor `sr`. */
    static int bufferLength(float sr) {
        return static_cast<int>(sr * kMaxSeconds) + 4096;
    }

    /** `buffer` moet minstens bufferLength(sr) samples zijn en blijft van de aanroeper. */
    void Init(float sr, int16_t* buffer, int bufferLen) {
        sr_ = sr;
        buf_ = buffer;
        len_ = bufferLen;
        if (buf_) std::memset(buf_, 0, sizeof(int16_t) * static_cast<size_t>(len_));
        write_ = 0;
        slew_ = 1.0f - std::exp(-1.0f / (0.12f * sr));
        wowInc_     = 6.2831853f * 0.6f / sr;
        flutterInc_ = 6.2831853f * 6.5f / sr;
        hpCoef_ = std::exp(-6.2831853f * 120.0f / sr);
        set_time(0.35f);
        delay_ = target_;
        set_tone(0.6f);
        lpState_ = 0.0f; hpX1_ = 0.0f; hpY1_ = 0.0f; wet_ = 0.0f;
        wowPhase_ = 0.0f; flutterPhase_ = 1.7f;
    }

    void set_time(float seconds) {
        if (seconds < kMinSeconds) seconds = kMinSeconds;
        if (seconds > kMaxSeconds) seconds = kMaxSeconds;
        target_ = seconds * sr_;
    }
    void set_feedback(float f) { feedback_ = f < 0.0f ? 0.0f : (f > 1.1f ? 1.1f : f); }
    void set_mix(float m)      { mix_ = clamp01(m); }
    void set_tone(float t) {
        tone_ = clamp01(t);
        const float hz = 800.0f * std::exp2(tone_ * 4.0f);      // 0,8 … 12,8 kHz
        lpCoef_ = 1.0f - std::exp(-6.2831853f * hz / sr_);
    }
    void set_wow(float w)      { wow_ = clamp01(w); }
    void set_flutter(float f)  { flutter_ = clamp01(f); }
    void set_drive(float d)    { drive_ = clamp01(d); }

    bool ready() const { return buf_ != nullptr; }

    inline float Process(float in) {
        if (!buf_) return in;

        // Bandsnelheid: traag naar de doeltijd, plus wow (langzaam) en
        // flutter (snel) — diepte ~3,5 ms resp. ~0,4 ms bij vol.
        delay_ += (target_ - delay_) * slew_;
        wowPhase_ += wowInc_;         if (wowPhase_ > 6.2831853f) wowPhase_ -= 6.2831853f;
        flutterPhase_ += flutterInc_; if (flutterPhase_ > 6.2831853f) flutterPhase_ -= 6.2831853f;
        const float mod = wow_ * 0.0035f * sr_ * fastSin(wowPhase_)
                        + flutter_ * 0.0004f * sr_ * fastSin(flutterPhase_);
        float d = delay_ + mod;
        if (d < 2.0f) d = 2.0f;
        if (d > static_cast<float>(len_ - 3)) d = static_cast<float>(len_ - 3);

        // Leeskop met lineaire interpolatie.
        float rp = static_cast<float>(write_) - d;
        while (rp < 0.0f) rp += static_cast<float>(len_);
        const int   i0 = static_cast<int>(rp);
        const float fr = rp - static_cast<float>(i0);
        int i1 = i0 + 1; if (i1 >= len_) i1 = 0;
        const float a = buf_[i0] * (1.0f / 32768.0f);
        const float b = buf_[i1] * (1.0f / 32768.0f);
        const float tape = a + (b - a) * fr;

        // Hoogdoorlaat (120 Hz) tegen DC-opbouw in de lus.
        const float hp = tape - hpX1_ + hpCoef_ * hpY1_;
        hpX1_ = tape; hpY1_ = hp;
        wet_ = hp;

        // Schrijfkop: ingang + feedback, door de verzadiger en de toon-LP.
        const float g = 1.0f + 3.0f * drive_;
        float x = (in + feedback_ * wet_) * g;
        x = softClip(x) / g;
        lpState_ += (x - lpState_) * lpCoef_;
        float w = lpState_ * 32767.0f;
        if (w > 32767.0f) w = 32767.0f; else if (w < -32768.0f) w = -32768.0f;
        buf_[write_] = static_cast<int16_t>(w);
        if (++write_ >= len_) write_ = 0;

        return in * (1.0f - 0.5f * mix_) + wet_ * mix_;
    }

private:
    static float clamp01(float v) { return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }
    /** tanh-achtig, Padé; versterking 1 rond nul, plafond ±1. */
    static inline float softClip(float x) {
        if (x >  3.0f) return  1.0f;
        if (x < -3.0f) return -1.0f;
        const float x2 = x * x;
        return x * (27.0f + x2) / (27.0f + 9.0f * x2);
    }
    /** Parabolische sinusbenadering, fase 0..2π. */
    static inline float fastSin(float p) {
        p = p * (1.0f / 3.1415927f) - 1.0f;          // −1..1
        const float y = p * (1.0f - (p < 0.0f ? -p : p));
        return -4.0f * y;
    }

    float    sr_ = 44100.0f;
    int16_t* buf_ = nullptr;
    int      len_ = 0;
    int      write_ = 0;
    float    target_ = 0.0f, delay_ = 0.0f, slew_ = 0.0f;
    float    feedback_ = 0.5f, mix_ = 0.4f, tone_ = 0.6f, wow_ = 0.3f, flutter_ = 0.2f, drive_ = 0.3f;
    float    lpCoef_ = 0.5f, lpState_ = 0.0f;
    float    hpCoef_ = 0.99f, hpX1_ = 0.0f, hpY1_ = 0.0f;
    float    wet_ = 0.0f;
    float    wowPhase_ = 0.0f, wowInc_ = 0.0f, flutterPhase_ = 0.0f, flutterInc_ = 0.0f;
};

}  // namespace mmb_dsp
