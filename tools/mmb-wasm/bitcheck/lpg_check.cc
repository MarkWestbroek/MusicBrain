// Invariantentest voor de low-pass gate op vier samplefrequenties: dicht
// zonder sturing, een ping komt vlug op en sterft traag uit (de vactrol blijft
// in 0..1 en daalt monotoon), en in de stand Both wordt de klank doffer
// naarmate hij uitsterft.
#include "kernel_check.h"
#include "mmb_dsp/lpg.h"

int main() {
    using namespace check;
    using mmb_dsp::Lpg;
    static_assert(sizeof(Lpg) < 128, "Lpg must stay a tiny kernel");
    for (const float rate : kRates) {
        Lpg lpg;
        lpg.Init(rate);
        lpg.setControl(Lpg::Decay, 0.25f);
        // Zaag van 110 Hz, ping op 0,1 s.
        double phase = 0;
        float previousEnv = 0, peakEnv = 0;
        bool falling = false;
        auto out = run<Lpg, 1>(lpg, rate, 1.5, true,
            [&](double) { phase += 110.0 / rate; phase -= std::floor(phase); return static_cast<float>(0.8 * (2 * phase - 1)); },
            [&](double t) {
                lpg.setCv(Lpg::Trig, t > 0.1 && t < 0.11 ? 1.0f : 0.0f);
                const float env = lpg.cvOut(Lpg::Env);
                assert(env >= 0 && env <= 1);
                if (env > peakEnv) peakEnv = env;
                if (t > 0.13) { assert(env <= previousEnv + 1e-6f); falling = true; }   // na de flits alleen nog omlaag
                previousEnv = env;
            })[0];
        assert(falling && peakEnv > 0.85f);
        const auto segment = [&](double from, double to) {
            double sum = 0; int n = 0;
            for (int i = static_cast<int>(from * rate); i < static_cast<int>(to * rate); ++i) { sum += out[i] * out[i]; ++n; }
            return std::sqrt(sum / n);
        };
        assert(segment(0, 0.09) < 1e-4);                       // dicht
        assert(segment(0.105, 0.14) > 0.1);                    // de tik
        assert(segment(0.3, 0.4) < segment(0.105, 0.14) * 0.5);
        assert(segment(1.2, 1.5) < segment(0.105, 0.14) * 0.02);
        // Doffer: hoog/laag zakt.
        const auto brightness = [&](double from, double to) {
            std::vector<float> part(out.begin() + static_cast<int>(from * rate), out.begin() + static_cast<int>(to * rate));
            return db(tone(part, 2200, rate) / tone(part, 110, rate));
        };
        assert(brightness(0.2, 0.3) < brightness(0.105, 0.15) - 10);
    }
    std::printf("PASS: closed at rest, ping rise/monotone decay, darker while decaying, four rates; kernel %zu bytes\n", sizeof(Lpg));
}
