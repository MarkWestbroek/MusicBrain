#pragma once
// Wah: een smalle piek die door het midden van het spectrum schuift.
//
// Type 0, Wah: naar het inductor-wahpedaal (Cry Baby-familie). Een
// resonantiepiek van ongeveer 400 Hz (hak) tot 2,2 kHz (teen), met een beetje
// van het laag eronder zodat de klank niet uitdunt.
// Type 1, Vowel: twee pieken die samen een klinker vormen en met het pedaal
// van OE via O, A en E naar IE lopen: een sprekend filter (de formanten F1
// en F2 van die klinkers).
//
// De stand van het "pedaal" komt uit de knop plus de CV, of het filter
// beweegt zelf (Mode):
//   0 Pedal  - knop + CV (expressiepedaal, envelope, LFO van buiten)
//   1 Auto ↑ - een envelope-volger duwt het pedaal open: harder spelen =
//              helderder (touch-wah, funk)
//   2 Auto ↓ - andersom: harder spelen = doffer
//   3 LFO    - een eigen sinus tussen de knopstand en helemaal open
//
// Header-only; gedeeld door Teensy en browser.
#include "oversample.h"

namespace mmb_dsp {

class Wah {
public:
    enum Control { Pedal, Mode, Type, Sens, Rate, Q, Mix, Level, kControls };
    enum CvIn { PedalCv, kCvIns };
    enum CvOut { Env, kCvOuts };
    static constexpr float kDefaults[kControls] = {0.3f, 0.0f, 0.0f, 0.6f, 2.0f, 0.5f, 1.0f, 0.8f};

    void Init(float sampleRate) {
        *this = Wah();
        sampleRate_ = finiteClamp(sampleRate, 8000, 192000, 44100);
        smooth_ = 1 - std::exp(-1 / (0.005f * sampleRate_));
        attack_ = 1 - std::exp(-1 / (0.003f * sampleRate_));
        release_ = 1 - std::exp(-1 / (0.12f * sampleRate_));
    }

    void setControl(int control, float value) {
        switch (control) {
            case Pedal: pedal_ = finiteClamp(value, 0, 1, 0.3f); break;
            case Mode: mode_ = static_cast<int>(finiteClamp(value, 0, 3, 0) + 0.5f); break;
            case Type: type_ = static_cast<int>(finiteClamp(value, 0, 1, 0) + 0.5f); break;
            case Sens: sens_ = finiteClamp(value, 0, 1, 0.6f); break;
            case Rate: rate_ = finiteClamp(value, 0.05f, 12, 2); break;
            case Q: q_ = finiteClamp(value, 0, 1, 0.5f); break;
            case Mix: mix_ = finiteClamp(value, 0, 1, 1); break;
            case Level: level_ = finiteClamp(value, 0, 1, 0.8f); break;
            default: break;
        }
    }
    void setCv(int input, float value) { if (input == PedalCv) pedalCv_ = finiteClamp(value, -1, 1, 0); }
    float cvOut(int output) const { return output == Env ? envelope_ : 0; }

    void Process(const float* const* in, float* const* out, int frames) {
        // Klinkers op het pedaal: OE, O, A, E, IE (F1, F2 in Hz).
        static constexpr float kF1[5] = {300, 570, 730, 530, 270};
        static constexpr float kF2[5] = {870, 840, 1090, 1840, 2290};
        const float* input = in[0];
        const float base = finiteClamp(pedal_ + pedalCv_, 0, 1, 0.3f);
        const float sensGain = 1 + sens_ * sens_ * 24;
        for (int frame = 0; frame < frames; ++frame) {
            const float x = input ? finiteClamp(input[frame], -4, 4, 0) : 0;
            const float level = std::fabs(x);
            envelope_ += (level > envelope_ ? attack_ : release_) * (level - envelope_);
            const float pushed = envelope_ * sensGain > 1 ? 1.0f : envelope_ * sensGain;
            lfoPhase_ += rate_ / sampleRate_;
            if (lfoPhase_ >= 1) lfoPhase_ -= 1;
            float target = base;
            if (mode_ == 1) target = base + (1 - base) * pushed;
            else if (mode_ == 2) target = base * (1 - pushed);
            else if (mode_ == 3) target = base + (1 - base) * (0.5f - 0.5f * std::cos(6.2831853f * lfoPhase_));
            position_ += smooth_ * (target - position_);
            float wet;
            if (type_ == 0) {
                const float fc = 400.0f * std::pow(5.5f, position_);            // 400 Hz .. 2,2 kHz
                const float k = 1 / (3.0f + q_ * 7.0f);
                float low, band;
                first_.process(x, std::tan(3.14159265f * fc / sampleRate_), k, low, band);
                wet = band * k * (1.6f + 1.4f * q_) + low * 0.25f;
            } else {
                const float scaled = position_ * 4;
                const int index = scaled >= 4 ? 3 : static_cast<int>(scaled);
                const float blend = scaled - index;
                const float f1 = kF1[index] + (kF1[index + 1] - kF1[index]) * blend;
                const float f2 = kF2[index] + (kF2[index + 1] - kF2[index]) * blend;
                const float k = 1 / (5.0f + q_ * 10.0f);
                float low, band1, band2;
                first_.process(x, std::tan(3.14159265f * f1 / sampleRate_), k, low, band1);
                second_.process(x, std::tan(3.14159265f * f2 / sampleRate_), k, low, band2);
                wet = (band1 + 0.7f * band2) * k * 2.0f;
            }
            const float y = (x + (wet - x) * mix_) * level_;
            out[0][frame] = y < -1 ? -1 : y > 1 ? 1 : y;
        }
    }

private:
    struct Svf {
        float ic1 = 0, ic2 = 0;
        void process(float x, float g, float k, float& low, float& band) {
            const float a1 = 1 / (1 + g * (g + k));
            band = a1 * (ic1 + g * (x - ic2));
            low = ic2 + g * band;
            ic1 = 2 * band - ic1;
            ic2 = 2 * low - ic2;
        }
    };

    Svf first_, second_;
    float sampleRate_ = 44100, smooth_ = 0.005f, attack_ = 0.01f, release_ = 0.001f;
    float pedal_ = 0.3f, sens_ = 0.6f, rate_ = 2, q_ = 0.5f, mix_ = 1, level_ = 0.8f, pedalCv_ = 0;
    float envelope_ = 0, position_ = 0.3f, lfoPhase_ = 0;
    int mode_ = 0, type_ = 0;
};

}  // namespace mmb_dsp
