// Invariantentest voor de buizenoverdrive op vier samplefrequenties: eindig
// en binnen ±1 bij ruis op vol, de studiotrap geeft vooral de tweede
// harmonische, de Fender-stack heeft het diepste gat rond 400 Hz, en een
// losse rechteringang speelt de linker op beide kanten.
#include "kernel_check.h"
#include "mmb_dsp/tube.h"

using mmb_dsp::Tube;

/** Stereo-render: `input(t)` op L, R los (nullptr). Geeft L en R terug. */
template <class Input>
static std::vector<std::vector<float>> render(Tube& tube, float rate, double seconds, Input input) {
    const int total = static_cast<int>(rate * seconds);
    std::vector<std::vector<float>> result(2, std::vector<float>(total));
    float in[32], left[32], right[32];
    const float* ins[2] = {in, nullptr};
    float* outs[2] = {left, right};
    for (int start = 0; start < total; start += 32) {
        const int frames = total - start < 32 ? total - start : 32;
        for (int k = 0; k < frames; ++k) in[k] = input((start + k) / static_cast<double>(rate));
        tube.Process(ins, outs, frames);
        for (int k = 0; k < frames; ++k) {
            assert(std::isfinite(left[k]) && std::fabs(left[k]) <= 1.0f);
            assert(left[k] == right[k]);
            result[0][start + k] = left[k];
            result[1][start + k] = right[k];
        }
    }
    return result;
}

static double rmsFrom(const std::vector<float>& signal, size_t from) {
    double sum = 0;
    for (size_t i = from; i < signal.size(); ++i) sum += signal[i] * signal[i];
    return std::sqrt(sum / (signal.size() - from));
}

int main() {
    using namespace check;
    for (const float rate : kRates) {
        // Ruis op vol, alles open.
        {
            Tube tube;
            tube.Init(rate);
            for (int c : {Tube::Drive, Tube::Bass, Tube::Mid, Tube::Treble, Tube::Presence, Tube::Level, Tube::Bias}) tube.setControl(c, 1);
            unsigned seed = 1;
            render(tube, rate, 0.5, [&](double) { seed = seed * 1664525u + 1013904223u; return 4.0f * (static_cast<float>(seed >> 8) / 8388608.0f - 1.0f); });
        }
        // Studio: tweede harmonische boven de derde.
        {
            Tube tube;
            tube.Init(rate);
            tube.setControl(Tube::Mode, 0);
            const auto out = render(tube, rate, 0.5, sine(220, 0.3))[0];
            const size_t from = static_cast<size_t>(0.25 * rate);
            assert(tone(out, 440, rate, from) > tone(out, 660, rate, from) * 1.25);
        }
        // Stacks: kleine sinus, gat rond 400 Hz ten opzichte van 100 Hz en 1 kHz.
        double scoop[3];
        for (int stack = 0; stack < 3; ++stack) {
            double level[3];
            const double hz[3] = {100, 400, 1000};
            for (int k = 0; k < 3; ++k) {
                Tube tube;
                tube.Init(rate);
                tube.setControl(Tube::Drive, 0);
                tube.setControl(Tube::Cab, 0);
                tube.setControl(Tube::Stack, static_cast<float>(stack));
                level[k] = db(rmsFrom(render(tube, rate, 0.3, sine(hz[k], 0.01))[0], static_cast<size_t>(0.15 * rate)));
            }
            scoop[stack] = level[1] - (level[0] + level[2]) / 2;
        }
        assert(scoop[0] < scoop[1] - 3 && scoop[0] < scoop[2] - 3);
    }
    std::printf("PASS: bounded under full-scale noise, studio 2nd > 3rd, Fender scoop deepest, mono to both, four rates; kernel %zu bytes\n", sizeof(Tube));
}
