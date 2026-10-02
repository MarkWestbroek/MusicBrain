#pragma once
// Frequency shifter (Bode): schuift elke frequentie hetzelfde aantal hertz
// op. Dat is iets anders dan een pitch-shifter, die vermenigvuldigt: bij
// +100 Hz wordt 200/400/600 Hz niet 300/600/900 maar 300/500/700. De
// boventonen staan dan niet meer in een hele verhouding en de klank wordt
// klokachtig, metalig; bij een paar hertz is het een trage, eindeloos
// doorlopende zweving, en met feedback een spiraal van zijbanden.
//
// Werking: enkelzijbandmodulatie. Twee all-pass-ketens maken van de ingang
// twee kopieën met 90 graden faseverschil (een Hilbert-paar; de ketens zijn
// het ontwerp van Olli Niemitalo, vier tweede-orde all-passes per tak;
// gemeten op 44,1 kHz blijft de ongewenste zijband van 40 Hz tot 18 kHz
// meer dan 44 dB onder de gewenste).
// Die twee vermenigvuldigd met cosinus en sinus van de schuiffrequentie en
// opgeteld of afgetrokken geven alleen de bovenste of alleen de onderste
// zijband: een ringmodulator zonder de spiegelkant.
//
// Header-only; gedeeld door Teensy en browser.
#include "oversample.h"

namespace mmb_dsp {

class FreqShifter {
public:
    enum Control { Shift, Range, Feedback, Mix, Level, kControls };
    enum CvIn { ShiftCv, kCvIns };
    static constexpr int kCvOuts = 0;
    static constexpr float kDefaults[kControls] = {0.2f, 1.0f, 0.0f, 1.0f, 0.8f};

    void Init(float sampleRate) {
        *this = FreqShifter();
        sampleRate_ = finiteClamp(sampleRate, 8000, 192000, 44100);
        smooth_ = 1 - std::exp(-1 / (0.01f * sampleRate_));
    }

    void setControl(int control, float value) {
        switch (control) {
            case Shift: shift_ = finiteClamp(value, -1, 1, 0.2f); break;
            case Range: range_ = static_cast<int>(finiteClamp(value, 0, 3, 1) + 0.5f); break;
            case Feedback: feedback_ = finiteClamp(value, 0, 0.95f, 0); break;
            case Mix: mix_ = finiteClamp(value, 0, 1, 1); break;
            case Level: level_ = finiteClamp(value, 0, 1, 0.8f); break;
            default: break;
        }
    }
    void setCv(int input, float value) { if (input == ShiftCv) shiftCv_ = finiteClamp(value, -2, 2, 0); }
    float cvOut(int) const { return 0; }

    /** out[0] = droog/omhoog-mix, out[1] = alleen de andere zijband. */
    void Process(const float* const* in, float* const* out, int frames) {
        static constexpr float kRanges[4] = {5.0f, 50.0f, 500.0f, 5000.0f};
        const float* input = in[0];
        const float hzTarget = finiteClamp(shift_ + shiftCv_, -2, 2, 0) * kRanges[range_];
        for (int frame = 0; frame < frames; ++frame) {
            const float x = input ? finiteClamp(input[frame], -4, 4, 0) : 0;
            hz_ += smooth_ * (hzTarget - hz_);
            // Feedback van de omhoog geschoven kant, zacht begrensd.
            const float fed = x + feedback_ * std::tanh(lastUp_);
            float i = fed, q = fed;
            for (int stage = 0; stage < 4; ++stage) {
                i = a_[stage].process(i, kCoefficientsA[stage]);
                q = b_[stage].process(q, kCoefficientsB[stage]);
            }
            const float iDelayed = delay_;      // tak A loopt één sample achter
            delay_ = i;
            phase_ += hz_ / sampleRate_;
            phase_ -= std::floor(phase_);
            const float c = std::cos(6.2831853f * phase_), s = std::sin(6.2831853f * phase_);
            const float up = iDelayed * c + q * s;
            const float down = iDelayed * c - q * s;
            lastUp_ = up;
            const float mixed = (x + (up - x) * mix_) * level_;
            const float other = down * level_;
            out[0][frame] = mixed < -1 ? -1 : mixed > 1 ? 1 : mixed;
            out[1][frame] = other < -1 ? -1 : other > 1 ? 1 : other;
        }
    }

private:
    // Kwadraten van Niemitalo's coëfficiënten; elke trap is
    // y[n] = c (x[n] + y[n-2]) - x[n-2].
    static constexpr float kCoefficientsA[4] = {0.47940086f, 0.87621849f, 0.97659758f, 0.99749925f};
    static constexpr float kCoefficientsB[4] = {0.16175850f, 0.73302893f, 0.94534970f, 0.99059915f};
    struct AllPass {
        float x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        float process(float x, float c) {
            const float y = c * (x + y2) - x2;
            x2 = x1; x1 = x; y2 = y1; y1 = y;
            return y;
        }
    };

    AllPass a_[4], b_[4];
    float sampleRate_ = 44100, smooth_ = 0.002f;
    float shift_ = 0.2f, feedback_ = 0, mix_ = 1, level_ = 0.8f, shiftCv_ = 0;
    float hz_ = 0, phase_ = 0, delay_ = 0, lastUp_ = 0;
    int range_ = 1;
};

}  // namespace mmb_dsp
