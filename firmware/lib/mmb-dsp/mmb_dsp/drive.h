#pragma once
// Drie vervormpedalen in één kern: overdrive, distortion en fuzz. Het
// verschil tussen die drie zit niet in "meer gain", maar in wat er vóór en
// ná de clipper gefilterd wordt en hoe hard die knipt.
//
//   0 Overdrive  - naar de groene overdrive (Tube Screamer-familie): alleen
//      het midden en hoog gaat de clipper in (hoogdoorlaat op 720 Hz) en het
//      schone signaal wordt er weer bij opgeteld. Zachte, licht asymmetrische
//      dioden. Het laag blijft strak, het midden komt naar voren: de
//      "mid-hump" waarmee een solo door de band heen komt.
//   1 Distortion - naar de RAT-familie: veel versterking in een trage opamp
//      (de bandbreedte zakt naarmate de gain stijgt), dan harde dioden naar
//      massa. Ruiger en platter; Tone is het omgekeerde Filter-knopje
//      (laagdoorlaat).
//   2 Fuzz       - naar de Big Muff-familie: twee clippende trappen achter
//      elkaar en een toonregeling die laag en hoog mengt met een gat in het
//      midden ("scooped"). Lange, zingende sustain.
//
// De clippers lopen vier keer overbemonsterd (oversample.h). Het is een eigen
// model op het oor en op de schema-topologie, geen component-voor-component
// simulatie. Header-only; gedeeld door Teensy en browser.
#include "oversample.h"

namespace mmb_dsp {

class Drive {
public:
    enum Control { Amount, Tone, Level, Mode, Mix, kControls };
    enum CvIn { AmountCv, kCvIns };
    static constexpr int kCvOuts = 0;
    static constexpr float kDefaults[kControls] = {0.5f, 0.5f, 0.5f, 0.0f, 1.0f};

    void Init(float sampleRate) {
        *this = Drive();
        sampleRate_ = finiteClamp(sampleRate, 8000, 192000, 44100);
        oversampler_.Init();
        smooth_ = 1 - std::exp(-1 / (0.005f * sampleRate_));
    }

    void setControl(int control, float value) {
        switch (control) {
            case Amount: amount_ = finiteClamp(value, 0, 1, 0.5f); break;
            case Tone: tone_ = finiteClamp(value, 0, 1, 0.5f); break;
            case Level: level_ = finiteClamp(value, 0, 1, 0.5f); break;
            case Mode: mode_ = static_cast<int>(finiteClamp(value, 0, 2, 0) + 0.5f); break;
            case Mix: mix_ = finiteClamp(value, 0, 1, 1); break;
            default: break;
        }
    }
    void setCv(int input, float value) { if (input == AmountCv) amountCv_ = finiteClamp(value, -1, 1, 0); }
    float cvOut(int) const { return 0; }

    void Process(const float* const* in, float* const* out, int frames) {
        const float* input = in[0];
        const float amount = finiteClamp(amount_ + amountCv_, 0, 1, 0.5f);
        const int mode = mode_;
        // Versterking vóór de clipper, exponentieel over de knop.
        const float gainTarget = mode == 0 ? 3.0f * std::pow(40.0f, amount)       // 3 .. 120
                               : mode == 1 ? 1.5f * std::pow(660.0f, amount)      // 1,5 .. 1000
                               :             4.0f * std::pow(30.0f, amount);      // 4 .. 120 per trap
        const float pi = 3.14159265f;
        const float preHp = onePole(mode == 0 ? 720.0f : mode == 1 ? 60.0f : 90.0f);
        // RAT: versterking maal bandbreedte is constant (trage opamp).
        const float slewLp = onePole(mode == 1 ? finiteClamp(1.2e6f / gainTarget, 1200, 18000, 6000) : 18000.0f);
        const float toneLp = onePole(mode == 0 ? 700.0f * std::pow(8.0f, tone_)             // 0,7 .. 5,6 kHz
                                   : mode == 1 ? 600.0f * std::pow(25.0f, tone_)            // 0,6 .. 15 kHz
                                   :             350.0f);                                    // laagtak van de Muff
        const float toneHp = onePole(1400.0f);                                               // hoogtak van de Muff
        const float interHp = 2 * pi * 120.0f / (sampleRate_ * Oversampler4::kFactor);
        // Uitgang: de clippers leveren ~±1; Level 0,5 is ongeveer eenheid.
        const float outGain = level_ * level_ * 4 * (mode == 2 ? 0.7f : mode == 1 ? 0.6f : 0.5f);
        for (int frame = 0; frame < frames; ++frame) {
            const float x = input ? finiteClamp(input[frame], -4, 4, 0) : 0;
            gain_ += smooth_ * (gainTarget - gain_);
            const float gain = gain_;
            // Voorfilter: wat de clipper in gaat.
            hp1_ += preHp * (x - hp1_);
            float driven = x - hp1_;
            lp1_ += slewLp * (driven - lp1_);
            driven = lp1_;
            const float dry = dry_.process(x);      // even lang onderweg als de clipper
            float wet;
            if (mode == 0) {
                wet = oversampler_.process(driven, [gain](float s) { return softAsym(s * gain); });
                wet = dry + wet;                     // schoon erbij: het laag blijft heel
            } else if (mode == 1) {
                wet = oversampler_.process(driven, [gain](float s) { return hardClip(s * gain); });
            } else {
                float& state = interStage_;
                wet = oversampler_.process(driven, [gain, interHp, &state](float s) {
                    const float first = softSym(s * gain);
                    state += interHp * (first - state);     // koppelcondensator tussen de trappen
                    return softSym((first - state) * gain * 0.5f);
                });
            }
            // Toonregeling.
            lp2_ += toneLp * (wet - lp2_);
            float toned = lp2_;
            if (mode == 2) {
                hp2_ += toneHp * (wet - hp2_);
                const float high = wet - hp2_;
                toned = lp2_ * (1 - tone_) * 1.6f + high * tone_ * 1.6f;   // midden op 0,5: gat rond 700 Hz
            }
            const float y = dry + (toned * outGain - dry) * mix_;
            out[0][frame] = y < -1 ? -1 : y > 1 ? 1 : y;
        }
    }

private:
    float onePole(float hz) const { return 1 - std::exp(-2 * 3.14159265f * hz / sampleRate_); }
    /** Zachte dioden, de negatieve kant iets eerder (even boventonen). */
    static float softAsym(float u) {
        return u >= 0 ? std::tanh(u) : 0.85f * std::tanh(u * (1 / 0.85f));
    }
    static float softSym(float u) { return std::tanh(u); }
    /** Harde dioden naar massa: recht tot vlak voor de knik, dan vast. */
    static float hardClip(float u) {
        const float a = std::fabs(u);
        const float y = a / std::sqrt(std::sqrt(1 + a * a * a * a));
        return u < 0 ? -y : y;
    }

    Oversampler4 oversampler_;
    DryDelay dry_;
    float sampleRate_ = 44100, smooth_ = 0.01f;
    float amount_ = 0.5f, tone_ = 0.5f, level_ = 0.5f, mix_ = 1, amountCv_ = 0;
    float gain_ = 10, hp1_ = 0, lp1_ = 0, lp2_ = 0, hp2_ = 0, interStage_ = 0;
    int mode_ = 0;
};

}  // namespace mmb_dsp
