#pragma once
// Ringmodulator: ingang × draaggolf. De draaggolf komt van de eigen
// oscillator (sinus/driehoek/blok, `freq` × 2^voct) of van de carrier-ingang.
// Twee modes: *Clean* = het zuivere product (alleen som- en verschiltonen),
// *Diode* = de vier-diodenring: sign-gestuurd met een zachte drempel, zodat
// de draaggolf en de ingang een beetje doorlekken en er oneven harmonischen
// bijkomen — het "gemene" van een echte ringmod.
//
// Header-only, geen allocatie.
#include <cmath>

namespace mmb_dsp {

class RingMod {
public:
    enum Wave { kSine = 0, kTri = 1, kSquare = 2 };
    enum Mode { kClean = 0, kDiode = 1 };

    void Init(float sr) { sr_ = sr; phase_ = 0.0f; recompute(); }

    void set_freq(float hz)   { freq_ = hz < 0.1f ? 0.1f : (hz > 12000.0f ? 12000.0f : hz); recompute(); }
    void set_voct(float v)    { voct_ = v < -8.0f ? -8.0f : (v > 8.0f ? 8.0f : v); recompute(); }
    void set_wave(int w)      { wave_ = w < 0 ? kSine : (w > 2 ? kSquare : static_cast<Wave>(w)); }
    void set_mode(int m)      { mode_ = m ? kDiode : kClean; }
    void set_mix(float m)     { mix_ = clamp01(m); }
    /** Diode-drempel: 0 = bijna clean, 1 = grof (veel doorlek en harmonischen). */
    void set_bias(float b)    { bias_ = clamp01(b); }

    /** `carrier` = externe draaggolf (of NaN/ongebruikt: intern). */
    inline float Process(float in, const float* carrier) {
        float c;
        if (carrier) {
            c = *carrier;
        } else {
            phase_ += inc_;
            if (phase_ >= 1.0f) phase_ -= 1.0f;
            switch (wave_) {
                case kTri:    c = phase_ < 0.5f ? 4.0f * phase_ - 1.0f : 3.0f - 4.0f * phase_; break;
                case kSquare: c = phase_ < 0.5f ? 1.0f : -1.0f; break;
                default:      c = fastSin(phase_); break;
            }
        }
        float y;
        if (mode_ == kClean) {
            y = in * c;
        } else {
            // Vier-diodenring: twee diodes geleiden op de positieve helft
            // van de draaggolf, twee op de negatieve; de ingang wordt dus
            // met (ongeveer) het teken van de draaggolf vermenigvuldigd —
            // een schakelende modulator, met de harmonischen van dat blok.
            // De drempel `bias` (diodedrempel) laat een dode zone rond de
            // nuldoorgang van de draaggolf, en een beetje van de draaggolf
            // en de ingang lekt door de onbalans van de ring heen.
            const float th = 0.05f + 0.35f * bias_;
            y = 0.5f * (diode(c + in, th) - diode(c - in, th) - diode(-c + in, th) + diode(-c - in, th))
              + bias_ * (0.12f * c + 0.06f * in);
        }
        return in * (1.0f - mix_) + y * mix_;
    }

private:
    static float clamp01(float v) { return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }
    void recompute() { inc_ = freq_ * std::exp2(voct_) / sr_; if (inc_ > 0.49f) inc_ = 0.49f; }
    /** Eén diode: onder `th` niets, daarboven ~lineair met een zachte knik. */
    static float diode(float v, float th) {
        if (v <= th) return 0.0f;
        const float o = v - th;
        return o / (1.0f + 0.4f * o);                     // zachte verzadiging
    }
    static float fastSin(float ph) {                     // ph 0..1
        const float x = ph * 6.2831853f - 3.1415927f;
        const float y = 1.2732395f * x - 0.4052847f * x * (x < 0.0f ? -x : x);
        return 0.225f * (y * (y < 0.0f ? -y : y) - y) + y;
    }

    float sr_ = 44100.0f, freq_ = 440.0f, voct_ = 0.0f, inc_ = 0.01f, phase_ = 0.0f;
    float mix_ = 1.0f, bias_ = 0.3f;
    Wave  wave_ = kSine;
    Mode  mode_ = kClean;
};

}  // namespace mmb_dsp
