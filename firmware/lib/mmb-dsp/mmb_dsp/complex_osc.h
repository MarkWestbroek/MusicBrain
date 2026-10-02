#pragma once
// Complex-oscillator naar de Buchla 259: twee oscillatoren in één module,
// waarvan de ene (de modulatie-oscillator) de andere (de hoofdoscillator) op
// drie manieren tegelijk kan bewerken, elk met een eigen index:
//
//   FM     - de toonhoogte van de hoofdoscillator (lineair, door nul heen:
//            de verhouding Ratio bepaalt of het harmonisch blijft)
//   AM     - de sterkte waarmee de sinus de vouwer in gaat
//   Timbre - hoe ver de vouwer open staat
//
// De hoofdoscillator is een sinus die door het timbre-circuit gaat: de vijf
// vouwcellen van de 259 (dezelfde vorm als FOLDER, stand 259), vier keer
// overbemonsterd. Timbre 0 is een zuivere sinus; verder open vouwt hij.
// Symmetry voegt even boventonen toe. Samen met een low-pass gate is dit de
// klassieke West Coast-stem: geen filter, de boventonen komen van FM en
// vouwen.
//
// Header-only; gedeeld door Teensy en browser.
#include "wavefolder.h"

namespace mmb_dsp {

class ComplexOsc {
public:
    enum Control { Pitch, Ratio, ModWave, Fm, Am, TimbreMod, Timbre, Symmetry, Level, kControls };
    enum CvIn { Voct, TimbreCv, FmCv, kCvIns };
    static constexpr int kCvOuts = 0;
    static constexpr float kDefaults[kControls] = {0.0f, 2.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.3f, 0.0f, 0.8f};

    void Init(float sampleRate) {
        *this = ComplexOsc();
        sampleRate_ = finiteClamp(sampleRate, 8000, 192000, 44100);
        oversampler_.Init();
        smooth_ = 1 - std::exp(-1 / (0.005f * sampleRate_));
    }

    void setControl(int control, float value) {
        switch (control) {
            case Pitch: pitch_ = finiteClamp(value, -48, 48, 0); break;
            case Ratio: ratio_ = finiteClamp(value, 0.01f, 16, 2); break;
            case ModWave: modWave_ = static_cast<int>(finiteClamp(value, 0, 2, 0) + 0.5f); break;
            case Fm: fm_ = finiteClamp(value, 0, 1, 0); break;
            case Am: am_ = finiteClamp(value, 0, 1, 0); break;
            case TimbreMod: timbreMod_ = finiteClamp(value, 0, 1, 0); break;
            case Timbre: timbre_ = finiteClamp(value, 0, 1, 0.3f); break;
            case Symmetry: symmetry_ = finiteClamp(value, -1, 1, 0); break;
            case Level: level_ = finiteClamp(value, 0, 1, 0.8f); break;
            default: break;
        }
    }
    void setCv(int input, float value) {
        if (input == Voct) voct_ = finiteClamp(value, -6, 6, 0);
        else if (input == TimbreCv) timbreCv_ = finiteClamp(value, -1, 1, 0);
        else if (input == FmCv) fmCv_ = finiteClamp(value, -1, 1, 0);
    }
    float cvOut(int) const { return 0; }

    /** out[0] = hoofdoscillator na het timbre-circuit, out[1] = modulatie-oscillator. */
    void Process(const float* const*, float* const* out, int frames) {
        const float base = finiteClamp(261.6256f * std::exp2(voct_ + pitch_ * (1 / 12.0f)), 1, 0.4f * sampleRate_, 261.6256f);
        const float modHz = finiteClamp(base * ratio_, 0.01f, 0.4f * sampleRate_, 100);
        const float fmDepth = finiteClamp(fm_ + fmCv_, 0, 1, 0);
        const float index = fmDepth * fmDepth * 6;                        // tot zes keer de grondtoon
        const float timbreBase = timbre_ + timbreCv_;
        const float biasTarget = symmetry_ * 2;
        const float modIncrement = modHz / sampleRate_;
        for (int frame = 0; frame < frames; ++frame) {
            // Modulatie-oscillator.
            modPhase_ += modIncrement;
            if (modPhase_ >= 1) modPhase_ -= 1;
            float mod, modOut;
            if (modWave_ == 0) mod = modOut = std::sin(6.2831853f * modPhase_);
            else if (modWave_ == 1) mod = modOut = modPhase_ < 0.5f ? 4 * modPhase_ - 1 : 3 - 4 * modPhase_;
            else { mod = 2 * modPhase_ - 1; modOut = mod - blep(modPhase_, modIncrement); }
            // Hoofdoscillator: sinus met lineaire FM door nul heen.
            phase_ += base / sampleRate_ * (1 + index * mod);
            phase_ -= std::floor(phase_);
            const float sine = std::sin(6.2831853f * phase_);
            const float amplitude = 1 - am_ * 0.5f * (1 - mod);
            const float timbre = finiteClamp(timbreBase + timbreMod_ * 0.5f * mod, 0, 1, 0);
            gain_ += smooth_ * (1 + timbre * timbre * 12 - gain_);
            bias_ += smooth_ * (biasTarget - bias_);
            const float gain = gain_, bias = bias_;
            float wet = oversampler_.process(sine * amplitude,
                [=](float sample) { return Wavefolder::shape(2, sample * gain + bias); });
            dc_ += dcCoefficient() * (wet - dc_);
            wet -= dc_;
            const float y = wet * level_;
            out[0][frame] = y < -1 ? -1 : y > 1 ? 1 : y;
            out[1][frame] = modOut * 0.8f * level_;
        }
    }

private:
    static float blep(float t, float dt) {
        if (dt <= 0) return 0;
        if (t < dt) { t /= dt; return t + t - t * t - 1; }
        if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
        return 0;
    }
    float dcCoefficient() const { return 2 * 3.14159265f * 12 / sampleRate_; }

    Oversampler4 oversampler_;
    float sampleRate_ = 44100, smooth_ = 0.01f;
    float pitch_ = 0, ratio_ = 2, fm_ = 0, am_ = 0, timbreMod_ = 0, timbre_ = 0.3f, symmetry_ = 0, level_ = 0.8f;
    float voct_ = 0, timbreCv_ = 0, fmCv_ = 0;
    float phase_ = 0, modPhase_ = 0, gain_ = 1, bias_ = 0, dc_ = 0;
    int modWave_ = 0;
};

}  // namespace mmb_dsp
