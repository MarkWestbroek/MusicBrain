#pragma once
// Rungler: een chaotische stem naar de Benjolin van Rob Hordijk.
//
// Twee oscillatoren (A en B, elk driehoek en puls) en daartussen de rungler:
// een schuifregister van acht bits dat door de puls van B geklokt wordt en
// de puls van A als data neemt. De laatste drie bits vormen een 3-bits DAC,
// een getrapte spanning van acht niveaus. Die spanning stuurt de
// oscillatoren die hem maken: A en B bepalen het patroon, het patroon
// verstemt A en B. Dat is een kring zonder begin, en het gedrag loopt van
// vaste lussen via patronen die bijna herhalen tot ruis, afhankelijk van
// een paar knoppen. Hordijk noemde het "getrapte chaos".
//
// In de stand Chaos gaat het nieuwe bit door een XOR met het bit dat uit het
// register valt; in Loop wordt alleen dat laatste bit teruggevoerd en
// herhaalt het register (tot je weer naar Chaos schakelt).
//
// Geluid: een comparator (driehoek A > driehoek B) geeft een pulsgolf met
// wisselende breedte, door een state-variable filter waarvan de cutoff met
// de rungler mee kan springen. De rungler zelf is ook een uitgang: een
// getrapte CV die bij de klank hoort. Niet bandbegrensd; dat hoort bij het
// instrument. Header-only; gedeeld door Teensy en browser.
#include "oversample.h"
#include <cstdint>

namespace mmb_dsp {

class Rungler {
public:
    enum Control { FreqA, FreqB, RunA, RunB, CrossA, CrossB, Cutoff, Resonance, Sweep, Loop, Level, kControls };
    enum CvIn { Voct, RateCv, CutoffCv, kCvIns };
    enum CvOut { RunglerOut, TriB, PulseB, kCvOuts };
    static constexpr float kDefaults[kControls] = {110.0f, 3.0f, 0.4f, 0.3f, 0.0f, 0.0f, 900.0f, 0.5f, 0.5f, 0.0f, 0.7f};

    void Init(float sampleRate) {
        *this = Rungler();
        sampleRate_ = finiteClamp(sampleRate, 8000, 192000, 44100);
    }

    void setControl(int control, float value) {
        switch (control) {
            case FreqA: freqA_ = finiteClamp(value, 0.5f, 5000, 110); break;
            case FreqB: freqB_ = finiteClamp(value, 0.05f, 2000, 3); break;
            case RunA: runA_ = finiteClamp(value, 0, 1, 0.4f); break;
            case RunB: runB_ = finiteClamp(value, 0, 1, 0.3f); break;
            case CrossA: crossA_ = finiteClamp(value, 0, 1, 0); break;
            case CrossB: crossB_ = finiteClamp(value, 0, 1, 0); break;
            case Cutoff: cutoff_ = finiteClamp(value, 20, 12000, 900); break;
            case Resonance: resonance_ = finiteClamp(value, 0, 1, 0.5f); break;
            case Sweep: sweep_ = finiteClamp(value, 0, 1, 0.5f); break;
            case Loop: loop_ = value >= 0.5f; break;
            case Level: level_ = finiteClamp(value, 0, 1, 0.7f); break;
            default: break;
        }
    }
    void setCv(int input, float value) {
        if (input == Voct) voct_ = finiteClamp(value, -5, 5, 0);
        else if (input == RateCv) rateCv_ = finiteClamp(value, -2, 2, 0);
        else if (input == CutoffCv) cutoffCv_ = finiteClamp(value, -2, 2, 0);
    }
    float cvOut(int output) const {
        if (output == RunglerOut) return dac_;
        if (output == TriB) return triB_;
        if (output == PulseB) return phaseB_ < 0.5f ? 1.0f : 0.0f;
        return 0;
    }

    /** out[0] = filter, out[1] = de kale pulsgolf (comparator), out[2] = driehoek A. */
    void Process(const float* const*, float* const* out, int frames) {
        const float k = 2 - 1.9f * resonance_;          // demping: 2 = geen piek, 0,1 = zingt
        for (int frame = 0; frame < frames; ++frame) {
            // De rungler (0..1) en de driehoek van de ander verstemmen beide oscillatoren.
            const float centred = dac_ - 0.5f;
            const float hzA = freqA_ * std::exp2(voct_ + runA_ * centred * 5 + crossA_ * triB_ * 2);
            const float hzB = freqB_ * std::exp2(rateCv_ * 4 + runB_ * centred * 5 + crossB_ * triA_ * 2);
            phaseA_ += finiteClamp(hzA, 0.01f, 0.45f * sampleRate_, 110) / sampleRate_;
            if (phaseA_ >= 1) phaseA_ -= 1;
            const float previousB = phaseB_;
            phaseB_ += finiteClamp(hzB, 0.001f, 0.45f * sampleRate_, 3) / sampleRate_;
            if (phaseB_ >= 1) phaseB_ -= 1;
            triA_ = triangle(phaseA_);
            triB_ = triangle(phaseB_);
            if (phaseB_ < previousB) {                  // puls B gaat omhoog: klok
                const std::uint8_t last = (register_ >> 7) & 1u;
                const std::uint8_t data = phaseA_ < 0.5f ? 1u : 0u;
                const std::uint8_t bit = loop_ ? last : static_cast<std::uint8_t>(data ^ last);
                register_ = static_cast<std::uint8_t>((register_ << 1) | bit);
                dac_ = static_cast<float>((register_ >> 5) & 7u) * (1 / 7.0f);
            }
            const float pwm = triA_ > triB_ ? 1.0f : -1.0f;
            // Filter: de cutoff springt met de rungler mee.
            const float fc = finiteClamp(cutoff_ * std::exp2(sweep_ * centred * 6 + cutoffCv_ * 4), 20, 0.4f * sampleRate_, 900);
            const float g = std::tan(3.14159265f * fc / sampleRate_);
            const float a1 = 1 / (1 + g * (g + k));
            const float v1 = a1 * (ic1_ + g * (pwm * 0.4f - ic2_));
            const float v2 = ic2_ + g * v1;
            ic1_ = 2 * v1 - ic1_;
            ic2_ = 2 * v2 - ic2_;
            // De resonantie mag zingen maar niet opblazen.
            ic1_ = std::tanh(ic1_);
            out[0][frame] = std::tanh(v2 * 1.5f) * level_;
            out[1][frame] = pwm * 0.5f * level_;
            out[2][frame] = triA_ * 0.8f * level_;
        }
    }

private:
    static float triangle(float phase) { return phase < 0.5f ? 4 * phase - 1 : 3 - 4 * phase; }

    float sampleRate_ = 44100;
    float freqA_ = 110, freqB_ = 3, runA_ = 0.4f, runB_ = 0.3f, crossA_ = 0, crossB_ = 0;
    float cutoff_ = 900, resonance_ = 0.5f, sweep_ = 0.5f, level_ = 0.7f;
    float voct_ = 0, rateCv_ = 0, cutoffCv_ = 0;
    float phaseA_ = 0, phaseB_ = 0, triA_ = -1, triB_ = -1, dac_ = 0, ic1_ = 0, ic2_ = 0;
    std::uint8_t register_ = 0xA5;
    bool loop_ = false;
};

}  // namespace mmb_dsp
