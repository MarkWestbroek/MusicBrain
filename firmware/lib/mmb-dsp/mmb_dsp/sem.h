#pragma once
// SEM-filter: het tweepolige state-variable filter van de Oberheim SEM.
//
// Waar een ladder (Moog, 303) steil is en bij resonantie het laag wegdrukt,
// is dit filter mild: 12 dB per octaaf, een resonantie die kleurt maar niet
// zelf gaat zingen, en het laag blijft staan. Het bijzondere is de
// Mode-knop: die loopt traploos van laagdoorlaat via een notch
// (laag en hoog samen, met een gat op de cutoff) naar hoogdoorlaat. De
// bandpass komt er apart uit.
//
// Model: state-variable filter (TPT), twee deelstappen per sample, met een
// zachte begrenzing op de bandpass-toestand (de OTA's van het origineel
// verzadigen daar het eerst). Drive stuurt het filter harder aan.
// Header-only; gedeeld door Teensy en browser.
#include "oversample.h"

namespace mmb_dsp {

class Sem {
public:
    enum Control { Cutoff, Resonance, Mode, Drive, CvAmount, Level, kControls };
    enum CvIn { CutoffCv, ModeCv, kCvIns };
    static constexpr int kCvOuts = 0;
    static constexpr float kDefaults[kControls] = {1000.0f, 0.3f, 0.0f, 0.2f, 4.0f, 0.8f};

    void Init(float sampleRate) {
        *this = Sem();
        sampleRate_ = finiteClamp(sampleRate, 8000, 192000, 44100);
        smooth_ = 1 - std::exp(-1 / (0.002f * sampleRate_));
    }

    void setControl(int control, float value) {
        switch (control) {
            case Cutoff: cutoff_ = finiteClamp(value, 20, 18000, 1000); break;
            case Resonance: resonance_ = finiteClamp(value, 0, 1, 0.3f); break;
            case Mode: mode_ = finiteClamp(value, 0, 1, 0); break;
            case Drive: drive_ = finiteClamp(value, 0, 1, 0.2f); break;
            case CvAmount: cvAmount_ = finiteClamp(value, 0, 7, 4); break;
            case Level: level_ = finiteClamp(value, 0, 1, 0.8f); break;
            default: break;
        }
    }
    void setCv(int input, float value) {
        if (input == CutoffCv) cutoffCv_ = finiteClamp(value, -2, 2, 0);
        else if (input == ModeCv) modeCv_ = finiteClamp(value, -1, 1, 0);
    }
    float cvOut(int) const { return 0; }

    /** out[0] = LP→notch→HP volgens Mode, out[1] = bandpass. */
    void Process(const float* const* in, float* const* out, int frames) {
        const float* input = in[0];
        const float target = finiteClamp(cutoff_ * std::exp2(cutoffCv_ * cvAmount_), 16, 18000, 1000);
        const float mode = finiteClamp(mode_ + modeCv_, 0, 1, 0);
        const float lowWeight = mode < 0.5f ? 1.0f : 2 * (1 - mode);
        const float highWeight = mode > 0.5f ? 1.0f : 2 * mode;
        const float k = 1 / (0.5f + resonance_ * resonance_ * 14.0f);     // Q 0,5 .. 14,5
        const float gain = 1 + 3 * drive_, makeup = level_ / (1 + 1.2f * drive_);
        if (fc_ <= 0) fc_ = target;
        for (int frame = 0; frame < frames; ++frame) {
            const float x = (input ? finiteClamp(input[frame], -4, 4, 0) : 0) * gain;
            fc_ += smooth_ * (target - fc_);
            const float g = std::tan(3.14159265f * fc_ / (2 * sampleRate_));
            const float a1 = 1 / (1 + g * (g + k));
            float low = 0, band = 0, high = 0;
            for (int step = 0; step < 2; ++step) {
                const float v1 = a1 * (ic1_ + g * (x - ic2_));
                const float v2 = ic2_ + g * v1;
                ic1_ = 2 * v1 - ic1_;
                ic2_ = 2 * v2 - ic2_;
                ic1_ = 3 * std::tanh(ic1_ * (1 / 3.0f));                 // OTA-verzadiging
                low += v2; band += v1; high += x - k * v1 - v2;
            }
            const float y = 0.5f * (low * lowWeight + high * highWeight) * makeup;
            const float b = 0.5f * band * k * makeup;                     // genormeerd: piek = 1
            out[0][frame] = y < -1 ? -1 : y > 1 ? 1 : y;
            out[1][frame] = b < -1 ? -1 : b > 1 ? 1 : b;
        }
    }

private:
    float sampleRate_ = 44100, smooth_ = 0.01f;
    float cutoff_ = 1000, resonance_ = 0.3f, mode_ = 0, drive_ = 0.2f, cvAmount_ = 4, level_ = 0.8f;
    float cutoffCv_ = 0, modeCv_ = 0;
    float fc_ = 0, ic1_ = 0, ic2_ = 0;
};

}  // namespace mmb_dsp
