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
        // Per fase de taps achter elkaar, met de ×4 van het opvullen erin.
        for (int phase = 0; phase < kFactor; ++phase)
            for (int k = 0; k < kPhaseTaps; ++k) phaseTaps_[phase][k] = taps_[k * kFactor + phase] * kFactor;
        clear();
    }

    void clear() {
        for (float& v : upHistory_) v = 0;
        for (float& v : downHistory_) v = 0;
        upIndex_ = downIndex_ = 0;
    }

    // Snelheid (2026-10-11, doc/dsp-check-2026-10.md §7): de geschiedenis staat
    // twee keer achter elkaar, zodat elke FIR-som een aaneengesloten stuk leest
    // (geen modulo per tap), en de sommen lopen in vier onafhankelijke ketens
    // die de FPU van de Cortex-M7 kan overlappen. Eerst was het één keten van 68
    // vermenigvuldig-optellingen met een modulo per tap: 1650 cycli per sample
    // op de Teensy (12 % cpu per oversampler).

    /** Eén sample erin, vier eruit (versterking 1). */
    void up(float input, float* out4) {
        upIndex_ = upIndex_ == 0 ? kPhaseTaps - 1 : upIndex_ - 1;
        upHistory_[upIndex_] = input;
        upHistory_[upIndex_ + kPhaseTaps] = input;
        const float* h = upHistory_ + upIndex_;      // h[0] = nieuwste
        const float *p0 = phaseTaps_[0], *p1 = phaseTaps_[1], *p2 = phaseTaps_[2], *p3 = phaseTaps_[3];
        float a0 = 0, a1 = 0, a2 = 0, a3 = 0;
        for (int k = 0; k < kPhaseTaps; ++k) {
            const float x = h[k];
            a0 += p0[k] * x; a1 += p1[k] * x; a2 += p2[k] * x; a3 += p3[k] * x;
        }
        out4[0] = a0; out4[1] = a1; out4[2] = a2; out4[3] = a3;
    }

    /** Vier samples erin, één eruit. */
    float down(const float* in4) {
        // Uitlezen op het eerste van de vier samples: dan valt de totale
        // vertraging (2 x 32 hoge samples) precies op 16 basissamples.
        pushDown(in4[0]);
        const float* h = downHistory_ + downIndex_;  // h[0] = nieuwste
        float a0 = 0, a1 = 0, a2 = 0, a3 = 0;
        for (int k = 0; k < kTaps; k += 4) {
            a0 += taps_[k] * h[k];
            a1 += taps_[k + 1] * h[k + 1];
            a2 += taps_[k + 2] * h[k + 2];
            a3 += taps_[k + 3] * h[k + 3];
        }
        pushDown(in4[1]); pushDown(in4[2]); pushDown(in4[3]);
        return (a0 + a1) + (a2 + a3);
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
        downIndex_ = downIndex_ == 0 ? kTaps - 1 : downIndex_ - 1;
        downHistory_[downIndex_] = value;
        downHistory_[downIndex_ + kTaps] = value;
    }
    static double bessel0(double x) {
        double sum = 1, term = 1;
        for (int k = 1; k < 30; ++k) { term *= (x / (2 * k)) * (x / (2 * k)); sum += term; }
        return sum;
    }

    float taps_[kTaps] = {};
    float phaseTaps_[kFactor][kPhaseTaps] = {};
    float upHistory_[2 * kPhaseTaps] = {};           // twee keer achter elkaar
    float downHistory_[2 * kTaps] = {};
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
