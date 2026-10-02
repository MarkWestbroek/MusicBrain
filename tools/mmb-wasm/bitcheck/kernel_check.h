// Gedeelde hulpjes voor de invariantentests van de kernels met de uniforme
// interface (Init / setControl / setCv / cvOut / Process): een kernel in
// blokken laten lopen met een sinus op de ingang, en de sterkte van één
// frequentie in het resultaat meten.
#pragma once
#include <cassert>
#include <cmath>
#include <cstdio>
#include <initializer_list>
#include <vector>

namespace check {

constexpr float kRates[4] = {32000.0f, 44100.0f, 48000.0f, 96000.0f};
constexpr double kPi = 3.14159265358979;

/** Amplitude van `hz` in `signal` vanaf `from` (Hann-venster). */
inline double tone(const std::vector<float>& signal, double hz, double rate, size_t from = 0) {
    double re = 0, im = 0;
    const size_t n = signal.size() - from;
    for (size_t i = 0; i < n; ++i) {
        const double w = 0.5 - 0.5 * std::cos(2 * kPi * i / n);
        re += signal[from + i] * w * std::cos(2 * kPi * hz * i / rate);
        im += signal[from + i] * w * std::sin(2 * kPi * hz * i / rate);
    }
    return 4 * std::sqrt(re * re + im * im) / n;
}
inline double db(double x) { return 20 * std::log10(x < 1e-12 ? 1e-12 : x); }

/** Rendert `seconds` in blokken van 32; `input(t)` levert de ingang (of laat
 *  `withInput` false voor een bron), `eachBlock(t)` mag CV's zetten. Geeft de
 *  audio-uitgangen terug en controleert dat alles eindig en binnen ±1 blijft. */
template <class Kernel, int Outs, class Input, class Block>
std::vector<std::vector<float>> run(Kernel& kernel, float rate, double seconds, bool withInput, Input input, Block eachBlock) {
    const int total = static_cast<int>(rate * seconds);
    std::vector<std::vector<float>> result(Outs, std::vector<float>(total));
    float in[32], out[Outs][32];
    const float* ins[1] = {withInput ? in : nullptr};
    float* outs[Outs];
    for (int channel = 0; channel < Outs; ++channel) outs[channel] = out[channel];
    for (int start = 0; start < total; start += 32) {
        const int frames = total - start < 32 ? total - start : 32;
        eachBlock(start / static_cast<double>(rate));
        for (int k = 0; k < frames; ++k) in[k] = input((start + k) / static_cast<double>(rate));
        kernel.Process(ins, outs, frames);
        for (int channel = 0; channel < Outs; ++channel)
            for (int k = 0; k < frames; ++k) {
                assert(std::isfinite(out[channel][k]) && std::fabs(out[channel][k]) <= 1.0f);
                result[channel][start + k] = out[channel][k];
            }
    }
    return result;
}

inline auto sine(double hz, double amplitude) {
    return [=](double t) { return static_cast<float>(amplitude * std::sin(2 * kPi * hz * t)); };
}
inline auto silence() { return [](double) { return 0.0f; }; }
inline auto nothing() { return [](double) {}; }

}  // namespace check
