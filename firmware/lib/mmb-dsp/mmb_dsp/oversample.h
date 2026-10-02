#pragma once
// Vier keer overbemonsteren rond een geheugenloze vervormer.
//
// Een vervormer maakt boventonen; boven de halve samplefrequentie vouwen die
// terug als valse, niet-harmonische tonen. Vier keer zo snel rekenen schuift
// die grens op: wat er dan nog terugvouwt is 12 dB of meer zwakker en ligt
// grotendeels boven het gehoor.
//
// Eén FIR-laagdoorlaat van 65 taps (Kaiser-venster, afsnijding op de
// oorspronkelijke halve samplefrequentie) doet beide kanten: als
// polyfasefilter omhoog (17 taps per fase) en als decimatiefilter omlaag.
// 65 taps is zo gekozen dat de totale vertraging precies kLatency = 16
// samples op de basisfrequentie is: een droog signaal dat ermee gemengd
// wordt, vertraag je met DryDelay hieronder en dan klopt de fase.
//
// Vlak tot ~16 kHz, -6 dB per filter op 22 kHz. Header-only; gedeeld door
// Teensy en browser.
#include <cmath>

namespace mmb_dsp {

class Oversampler4 {
public:
    static constexpr int kFactor = 4;
    static constexpr int kTaps = 68;          // 65 echte taps, aangevuld tot 4 x 17
    static constexpr int kPhaseTaps = kTaps / kFactor;
    static constexpr int kLatency = 16;       // samples op de basisfrequentie

    void Init() {
        // Laagdoorlaat op 1/8 van de hoge samplefrequentie (= de oude Nyquist).
        const double cutoff = 0.125, beta = 7.0, centre = 32.0;
        double sum = 0;
        for (int n = 0; n < kTaps; ++n) {
            double value = 0;
            if (n < 65) {
                const double t = n - centre;
                const double sinc = t == 0 ? 2 * cutoff : std::sin(2 * 3.14159265358979 * cutoff * t) / (3.14159265358979 * t);
                const double r = t / centre;
                value = sinc * bessel0(beta * std::sqrt(1 - r * r)) / bessel0(beta);
            }
            taps_[n] = static_cast<float>(value);
            sum += value;
        }
        for (float& tap : taps_) tap = static_cast<float>(tap / sum);
        clear();
    }

    void clear() {
        for (float& v : upHistory_) v = 0;
        for (float& v : downHistory_) v = 0;
        upIndex_ = downIndex_ = 0;
    }

    /** Eén sample erin, vier eruit (versterking 1). */
    void up(float input, float* out4) {
        upIndex_ = (upIndex_ + kPhaseTaps - 1) % kPhaseTaps;
        upHistory_[upIndex_] = input;
        for (int phase = 0; phase < kFactor; ++phase) {
            float acc = 0;
            for (int k = 0; k < kPhaseTaps; ++k)
                acc += taps_[k * kFactor + phase] * upHistory_[(upIndex_ + k) % kPhaseTaps];
            out4[phase] = acc * kFactor;
        }
    }

    /** Vier samples erin, één eruit. */
    float down(const float* in4) {
        // Uitlezen op het eerste van de vier samples: dan valt de totale
        // vertraging (2 x 32 hoge samples) precies op 16 basissamples.
        pushDown(in4[0]);
        float acc = 0;
        int index = downIndex_;
        for (int k = 0; k < kTaps; ++k) {
            acc += taps_[k] * downHistory_[index];
            if (++index == kTaps) index = 0;
        }
        pushDown(in4[1]); pushDown(in4[2]); pushDown(in4[3]);
        return acc;
    }

    /** `shaper` op vier keer de samplefrequentie toepassen. */
    template <class Shaper>
    float process(float input, Shaper&& shaper) {
        float buffer[kFactor];
        up(input, buffer);
        for (float& v : buffer) v = shaper(v);
        return down(buffer);
    }

private:
    void pushDown(float value) {
        downIndex_ = (downIndex_ + kTaps - 1) % kTaps;
        downHistory_[downIndex_] = value;
    }
    static double bessel0(double x) {
        double sum = 1, term = 1;
        for (int k = 1; k < 30; ++k) { term *= (x / (2 * k)) * (x / (2 * k)); sum += term; }
        return sum;
    }

    float taps_[kTaps] = {};
    float upHistory_[kPhaseTaps] = {};
    float downHistory_[kTaps] = {};
    int upIndex_ = 0, downIndex_ = 0;
};

/** Vertraagt het droge signaal net zo lang als de oversampler het natte. */
class DryDelay {
public:
    float process(float input) {
        const float delayed = line_[index_];
        line_[index_] = input;
        if (++index_ == Oversampler4::kLatency) index_ = 0;
        return delayed;
    }
    void clear() { for (float& v : line_) v = 0; index_ = 0; }
private:
    float line_[Oversampler4::kLatency] = {};
    int index_ = 0;
};

inline float finiteClamp(float value, float low, float high, float fallback) {
    return !std::isfinite(value) ? fallback : value < low ? low : value > high ? high : value;
}

}  // namespace mmb_dsp
