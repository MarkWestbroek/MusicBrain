#pragma once
// Low-pass gate: filter en versterker in één, gestuurd door een vactrol.
//
// Een vactrol is een lampje (LED) tegen een lichtgevoelige weerstand. De
// weerstand reageert vlug op licht maar komt traag terug in het donker, en
// trager naarmate het donkerder wordt. In de Buchla 292 stuurt die ene
// weerstand tegelijk de helderheid en het volume: een klank die uitsterft
// wordt ook doffer, zoals een aangeslagen stuk hout of een getokkelde snaar.
// Een korte puls op het lampje (een "ping") geeft daarom zonder envelope al
// een natuurlijke tik: het klassieke bongo-geluid van de West Coast.
//
// Model: een vactrol-toestand v (0..1) die in ~1,5 ms opkomt en met een
// niveau-afhankelijke tijdconstante terugvalt (snel begin, lange staart),
// gevolgd door een tweepolig filter (TPT state-variable) en een versterker.
//   Mode 0 LP   : alleen het filter volgt v
//   Mode 1 Both : filter en versterker samen (de eigenlijke low-pass gate)
//   Mode 2 VCA  : alleen de versterker
// Header-only; gedeeld door Teensy en browser.
#include "oversample.h"

namespace mmb_dsp {

class Lpg {
public:
    enum Control { Offset, Decay, Mode, Resonance, Level, kControls };
    enum CvIn { LevelCv, Trig, kCvIns };
    enum CvOut { Env, kCvOuts };
    static constexpr float kDefaults[kControls] = {0.0f, 0.25f, 1.0f, 0.1f, 0.9f};

    void Init(float sampleRate) {
        *this = Lpg();
        sampleRate_ = finiteClamp(sampleRate, 8000, 192000, 44100);
        attack_ = 1 - std::exp(-1 / (0.0015f * sampleRate_));
    }

    void setControl(int control, float value) {
        switch (control) {
            case Offset: offset_ = finiteClamp(value, 0, 1, 0); break;
            case Decay: decay_ = finiteClamp(value, 0.02f, 4, 0.25f); break;
            case Mode: mode_ = static_cast<int>(finiteClamp(value, 0, 2, 1) + 0.5f); break;
            case Resonance: resonance_ = finiteClamp(value, 0, 1, 0.1f); break;
            case Level: level_ = finiteClamp(value, 0, 1, 0.9f); break;
            default: break;
        }
    }
    void setCv(int input, float value) {
        if (input == LevelCv) levelCv_ = finiteClamp(value, -1, 1, 0);
        else if (input == Trig) {
            const bool high = value >= 0.5f;
            if (high && !trigHigh_) ping_ = 3;      // lampje flitst, ruim over de grens
            trigHigh_ = high;
        }
    }
    float cvOut(int output) const { return output == Env ? vactrol_ : 0; }

    void Process(const float* const* in, float* const* out, int frames) {
        const float* input = in[0];
        const float pingDecay = std::exp(-1 / (0.004f * sampleRate_));
        // Q van 0,6 (geen piek) tot 6 (zingt mee, zoals een 292 met feedback).
        const float k = 1 / (0.6f + resonance_ * resonance_ * 5.4f);
        for (int frame = 0; frame < frames; ++frame) {
            const float x = input ? finiteClamp(input[frame], -4, 4, 0) : 0;
            float target = offset_ + levelCv_ + ping_;
            target = target < 0 ? 0 : target > 1 ? 1 : target;
            ping_ *= pingDecay;
            if (target > vactrol_) vactrol_ += attack_ * (target - vactrol_);
            else {
                // Hoe donkerder, hoe trager: de lange staart van de vactrol.
                const float tau = decay_ * (0.2f + 1.6f * (1 - vactrol_));
                vactrol_ += (target - vactrol_) / (tau * sampleRate_);
            }
            const float v = vactrol_;
            // Filter: 20 Hz (dicht) tot 20 kHz (open), exponentieel met v.
            const float cutoff = mode_ == 2 ? 18000.0f : 20.0f * std::exp2(v * 9.97f);
            const float limited = cutoff > 0.45f * sampleRate_ ? 0.45f * sampleRate_ : cutoff;
            const float g = std::tan(3.14159265f * limited / sampleRate_);
            const float a1 = 1 / (1 + g * (g + k));
            const float v1 = a1 * (ic1_ + g * (x - ic2_));
            const float v2 = ic2_ + g * v1;
            ic1_ = 2 * v1 - ic1_;
            ic2_ = 2 * v2 - ic2_;
            const float gain = mode_ == 0 ? 1.0f : mode_ == 1 ? v * std::sqrt(v) : v * v;
            const float y = v2 * gain * level_;
            out[0][frame] = y < -1 ? -1 : y > 1 ? 1 : y;
        }
    }

private:
    float sampleRate_ = 44100, attack_ = 0.015f;
    float offset_ = 0, decay_ = 0.25f, resonance_ = 0.1f, level_ = 0.9f, levelCv_ = 0;
    float vactrol_ = 0, ping_ = 0, ic1_ = 0, ic2_ = 0;
    int mode_ = 1;
    bool trigHigh_ = false;
};

}  // namespace mmb_dsp
