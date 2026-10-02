// Invariantentest voor de rungler op vier samplefrequenties: in Loop herhaalt
// het register elke acht klokken, in Chaos komen (bijna) alle acht niveaus
// voor en herhaalt het niet, en met alles open blijft elke uitgang eindig en
// binnen ±1.
#include "kernel_check.h"
#include "mmb_dsp/rungler.h"
#include <set>

int main() {
    using namespace check;
    using mmb_dsp::Rungler;
    static_assert(sizeof(Rungler) < 128, "Rungler must stay a tiny kernel");
    for (const float rate : kRates) {
        for (int loop = 0; loop < 2; ++loop) {
            Rungler rungler;
            rungler.Init(rate);
            rungler.setControl(Rungler::Loop, static_cast<float>(loop));
            rungler.setControl(Rungler::FreqB, 20);
            std::vector<int> steps;
            float previousPulse = 0;
            run<Rungler, 3>(rungler, rate, 6, false, silence(), [&](double) {
                const float pulse = rungler.cvOut(Rungler::PulseB);
                if (pulse >= 0.5f && previousPulse < 0.5f)
                    steps.push_back(static_cast<int>(rungler.cvOut(Rungler::RunglerOut) * 7 + 0.5f));
                previousPulse = pulse;
                assert(rungler.cvOut(Rungler::RunglerOut) >= 0 && rungler.cvOut(Rungler::RunglerOut) <= 1);
                assert(std::fabs(rungler.cvOut(Rungler::TriB)) <= 1);
            });
            assert(steps.size() > 60);
            bool periodic = true;
            for (size_t k = 20; k + 8 < 60; ++k) periodic = periodic && steps[k] == steps[k + 8];
            const std::set<int> levels(steps.begin(), steps.end());
            if (loop) assert(periodic && levels.size() > 2);
            else assert(!periodic && levels.size() >= 6);
        }
        Rungler wild;
        wild.Init(rate);
        for (int control : {Rungler::RunA, Rungler::RunB, Rungler::CrossA, Rungler::CrossB, Rungler::Sweep, Rungler::Resonance})
            wild.setControl(control, 1);
        wild.setControl(Rungler::FreqA, 5000); wild.setControl(Rungler::FreqB, 2000);
        run<Rungler, 3>(wild, rate, 2, false, silence(), [&](double t) {
            wild.setCv(Rungler::Voct, 5); wild.setCv(Rungler::RateCv, 2);
            wild.setCv(Rungler::CutoffCv, t < 1 ? 2.0f : NAN);
        });
    }
    std::printf("PASS: loop repeats every 8 clocks, chaos does not, all outputs bounded, four rates; kernel %zu bytes\n", sizeof(Rungler));
}
