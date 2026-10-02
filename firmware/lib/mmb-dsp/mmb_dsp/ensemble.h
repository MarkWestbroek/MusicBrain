#pragma once
// Ensemble: het driefasige chorus van de string machines (Solina-familie).
//
// Een gewone chorus is één vertragingslijn met één LFO: je hoort de zweving
// op en neer gaan. De string machines gebruikten er drie, elk gemoduleerd
// door dezelfde twee LFO's (een trage van ~0,6 Hz en een snelle van ~6 Hz)
// maar steeds een derde slag verschoven. Omdat de drie fasen elkaar altijd
// aanvullen is er geen moment waarop de modulatie stilvalt of omkeert: de
// klank wordt breed en dik zonder hoorbaar te golven. Een kale zaag wordt
// een strijkorkest.
//
// Eén vertragingslijn met drie leeskoppen (dat is hetzelfde als drie lijnen
// met dezelfde ingang); links krijgt kop 1 en een deel van kop 2, rechts kop
// 3 en een deel van kop 2. Tone is de bandbreedte van de emmertjesgeheugens.
// Header-only; gedeeld door Teensy en browser.
#include "oversample.h"

namespace mmb_dsp {

class Ensemble {
public:
    enum Control { Depth, Slow, Fast, Tone, Mix, Level, kControls };
    enum CvIn { DepthCv, kCvIns };
    static constexpr int kCvOuts = 0;
    static constexpr float kDefaults[kControls] = {0.7f, 0.6f, 6.0f, 0.6f, 0.8f, 0.8f};

    void Init(float sampleRate) {
        *this = Ensemble();
        sampleRate_ = finiteClamp(sampleRate, 8000, 192000, 44100);
    }

    void setControl(int control, float value) {
        switch (control) {
            case Depth: depth_ = finiteClamp(value, 0, 1, 0.7f); break;
            case Slow: slow_ = finiteClamp(value, 0.1f, 3, 0.6f); break;
            case Fast: fast_ = finiteClamp(value, 2, 12, 6); break;
            case Tone: tone_ = finiteClamp(value, 0, 1, 0.6f); break;
            case Mix: mix_ = finiteClamp(value, 0, 1, 0.8f); break;
            case Level: level_ = finiteClamp(value, 0, 1, 0.8f); break;
            default: break;
        }
    }
    void setCv(int input, float value) { if (input == DepthCv) depthCv_ = finiteClamp(value, -1, 1, 0); }
    float cvOut(int) const { return 0; }

    /** in[0]/in[1] = L/R (mono gesommeerd), out[0]/out[1] = L/R. */
    void Process(const float* const* in, float* const* out, int frames) {
        const float* left = in[0];
        const float* right = in[1];
        const float depth = finiteClamp(depth_ + depthCv_, 0, 1, 0.7f);
        const float perMs = sampleRate_ * 0.001f;
        const float toneCoefficient = 1 - std::exp(-2 * 3.14159265f * 2000.0f * std::pow(6.0f, tone_) / sampleRate_);
        for (int frame = 0; frame < frames; ++frame) {
            float x = 0;
            if (left && right) x = 0.5f * (left[frame] + right[frame]);
            else if (left) x = left[frame];
            else if (right) x = right[frame];
            x = finiteClamp(x, -4, 4, 0);
            line_[write_] = x;
            slowPhase_ += slow_ / sampleRate_;
            if (slowPhase_ >= 1) slowPhase_ -= 1;
            fastPhase_ += fast_ / sampleRate_;
            if (fastPhase_ >= 1) fastPhase_ -= 1;
            float tap[3];
            for (int head = 0; head < 3; ++head) {
                const float shift = head * (1 / 3.0f);
                // 5 ms rust, de trage LFO ±1,3 ms en de snelle ±0,13 ms bij volle Depth.
                const float delayMs = 5.0f + depth * (1.3f * std::sin(6.2831853f * (slowPhase_ + shift))
                                                    + 0.13f * std::sin(6.2831853f * (fastPhase_ + shift)));
                const float read = static_cast<float>(write_) - delayMs * perMs;
                const float floored = std::floor(read);
                const int base = static_cast<int>(floored);
                const float fraction = read - floored;
                const float a = line_[(base + kLength) & (kLength - 1)], b = line_[(base + 1 + kLength) & (kLength - 1)];
                lowpass_[head] += toneCoefficient * (a + (b - a) * fraction - lowpass_[head]);
                tap[head] = lowpass_[head];
            }
            write_ = (write_ + 1) & (kLength - 1);
            const float wetLeft = (tap[0] + 0.6f * tap[1]) * (1 / 1.6f);
            const float wetRight = (tap[2] + 0.6f * tap[1]) * (1 / 1.6f);
            const float l = (x + (wetLeft - x) * mix_) * level_, r = (x + (wetRight - x) * mix_) * level_;
            out[0][frame] = l < -1 ? -1 : l > 1 ? 1 : l;
            out[1][frame] = r < -1 ? -1 : r > 1 ? 1 : r;
        }
    }

private:
    static constexpr int kLength = 4096;      // ruim 20 ms op 192 kHz
    float line_[kLength] = {};
    float lowpass_[3] = {};
    float sampleRate_ = 44100;
    float depth_ = 0.7f, slow_ = 0.6f, fast_ = 6, tone_ = 0.6f, mix_ = 0.8f, level_ = 0.8f, depthCv_ = 0;
    float slowPhase_ = 0, fastPhase_ = 0;
    int write_ = 0;
};

}  // namespace mmb_dsp
