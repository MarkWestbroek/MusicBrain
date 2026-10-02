#pragma once
// Wavefolder: de West Coast-manier om boventonen te maken. Een filter haalt
// boventonen weg uit een rijke golf; een folder begint met een sinus of
// driehoek en vouwt de toppen terug zodra ze over een grens gaan. Hoe harder
// je erin stuurt, hoe vaker de golf vouwt en hoe meer boventonen, in een
// patroon dat op FM lijkt maar strak harmonisch blijft.
//
// Drie vouwvormen:
//   0 Sine  - de golf door een sinus (zacht, rond; de Serge-kant)
//   1 Tri   - hoekig terugvouwen tussen -1 en 1 (helder, scherp)
//   2 259   - vijf parallelle vouwcellen met dode zone, naar het
//             timbre-circuit van de Buchla 259 (stuksgewijs lineair model uit
//             Esqueda/Pöntynen/Parker/Bilbao, DAFx 2017); de bekende
//             holle, neuzige zwaai
// Symmetry schuift de golf voor het vouwen opzij: even boventonen erbij.
// Vier keer overbemonsterd (oversample.h); het droge signaal voor Mix is
// even lang vertraagd.
#include "oversample.h"

namespace mmb_dsp {

class Wavefolder {
public:
    enum Control { Fold, Symmetry, Type, Mix, Level, kControls };
    enum CvIn { FoldCv, SymCv, kCvIns };
    static constexpr int kCvOuts = 0;
    static constexpr float kDefaults[kControls] = {0.3f, 0.0f, 0.0f, 1.0f, 0.8f};

    void Init(float sampleRate) {
        *this = Wavefolder();
        sampleRate_ = finiteClamp(sampleRate, 8000, 192000, 44100);
        oversampler_.Init();
        smooth_ = 1 - std::exp(-1 / (0.005f * sampleRate_));
        dcCoefficient_ = 1 - 2 * 3.14159265f * 12 / sampleRate_;
    }

    void setControl(int control, float value) {
        switch (control) {
            case Fold: fold_ = finiteClamp(value, 0, 1, 0.3f); break;
            case Symmetry: symmetry_ = finiteClamp(value, -1, 1, 0); break;
            case Type: type_ = static_cast<int>(finiteClamp(value, 0, 2, 0) + 0.5f); break;
            case Mix: mix_ = finiteClamp(value, 0, 1, 1); break;
            case Level: level_ = finiteClamp(value, 0, 1, 0.8f); break;
            default: break;
        }
    }
    void setCv(int input, float value) {
        if (input == FoldCv) foldCv_ = finiteClamp(value, -1, 1, 0);
        else if (input == SymCv) symCv_ = finiteClamp(value, -1, 1, 0);
    }
    float cvOut(int) const { return 0; }

    static float shape(int type, float u) {
        if (type == 0) return std::sin(1.5707963f * u);
        if (type == 1) {                      // driehoekig vouwen, periode 4
            const float t = u * 0.25f + 0.25f;
            return 1 - 4 * std::fabs(t - std::floor(t) - 0.5f);
        }
        // 259: u = 1 komt overeen met 0,6 V, de rand van het lineaire gebied.
        const float v = u * 0.6f, a = std::fabs(v), sign = v < 0 ? -1.0f : 1.0f;
        const float c1 = a > 0.6f    ? sign * (0.8333f * a - 0.5f)    : 0;
        const float c2 = a > 2.994f  ? sign * (0.3768f * a - 1.1281f) : 0;
        const float c3 = a > 5.46f   ? sign * (0.2829f * a - 1.5446f) : 0;
        const float c4 = a > 1.8f    ? sign * (0.5743f * a - 1.0338f) : 0;
        const float c5 = a > 4.08f   ? sign * (0.2673f * a - 1.0907f) : 0;
        const float out = -12.0f * c1 - 27.777f * c2 - 21.428f * c3 + 17.647f * c4 + 36.363f * c5 + 5 * v;
        return out * (1 / 3.0f);
    }

    void Process(const float* const* in, float* const* out, int frames) {
        const float* input = in[0];
        // Fold 0 = net niet vouwen; 1 = ruim tien keer over de grens.
        const float foldTarget = finiteClamp(fold_ + foldCv_, 0, 1, 0);
        const float gainTarget = 1 + foldTarget * foldTarget * (type_ == 2 ? 12.0f : 11.0f);
        const float biasTarget = finiteClamp(symmetry_ + symCv_, -1, 1, 0) * (type_ == 2 ? 2.0f : 1.0f);
        const int type = type_;
        for (int frame = 0; frame < frames; ++frame) {
            const float x = input ? finiteClamp(input[frame], -4, 4, 0) : 0;
            gain_ += smooth_ * (gainTarget - gain_);
            bias_ += smooth_ * (biasTarget - bias_);
            const float gain = gain_, bias = bias_;
            float wet = oversampler_.process(x, [=](float sample) { return shape(type, sample * gain + bias); });
            // De bias zet een gelijkspanning op de uitgang: wegfilteren.
            dc_ += (1 - dcCoefficient_) * (wet - dc_);
            wet -= dc_;
            const float dry = dry_.process(x);
            float y = (dry + (wet - dry) * mix_) * level_;
            out[0][frame] = y < -1 ? -1 : y > 1 ? 1 : y;
        }
    }

private:
    Oversampler4 oversampler_;
    DryDelay dry_;
    float sampleRate_ = 44100, smooth_ = 0.01f, dcCoefficient_ = 0.998f;
    float fold_ = 0.3f, symmetry_ = 0, mix_ = 1, level_ = 0.8f, foldCv_ = 0, symCv_ = 0;
    float gain_ = 1, bias_ = 0, dc_ = 0;
    int type_ = 0;
};

}  // namespace mmb_dsp
