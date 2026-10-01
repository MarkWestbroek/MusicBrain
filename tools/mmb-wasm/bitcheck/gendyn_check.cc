// Invariantentest voor de GENDYN-kern: amplitudes binnen de grenzen,
// uitgang begrensd, het aantal cycli per seconde volgt de toonhoogte (de
// duurwandeling is symmetrisch), dezelfde seed geeft dezelfde samples en
// amp_step 0 met dur_step 0 geeft een stilstaande periodieke golf.
#include "mmb_dsp/gendyn.h"
#include <cassert>
#include <cmath>
#include <cstdio>
#include <initializer_list>

int main() {
    using Gendyn = mmb_dsp::Gendyn;
    static_assert(sizeof(Gendyn) < 512, "Gendyn must stay a small fixed-state kernel");
    for (const float rate : {32000.0f, 44100.0f, 48000.0f, 96000.0f}) {
        Gendyn gendyn;
        gendyn.Init(rate);
        gendyn.setControl(Gendyn::AmpStep, 1);
        gendyn.setControl(Gendyn::DurStep, 1);
        gendyn.setControl(Gendyn::Level, 1);
        float out, cycle;
        int cycles = 0;
        float previousCycle = 0;
        for (int sample = 0; sample < static_cast<int>(rate * 4); ++sample) {
            gendyn.Tick(0, 0, out, cycle);
            assert(std::isfinite(out) && std::fabs(out) <= 1);
            if (cycle >= 0.5f && previousCycle < 0.5f) ++cycles;
            previousCycle = cycle;
            for (int point = 0; point < gendyn.points(); ++point) {
                assert(std::fabs(gendyn.amplitude(point)) <= 1);
                assert(gendyn.duration(point) >= 0.5f && gendyn.duration(point) <= 1.5f);
            }
        }
        // 4 s op 261,6 Hz: ~1046 cycli; de duurwandeling mag dit maar weinig verschuiven.
        assert(cycles > 1000 && cycles < 1100);

        // Reproduceerbaar: dezelfde seed, dezelfde gate, dezelfde samples.
        Gendyn first, second;
        first.Init(rate); second.Init(rate);
        for (Gendyn* g : {&first, &second}) { g->setControl(Gendyn::Seed, 7); g->setControl(Gendyn::AmpStep, 0.8f); }
        float outFirst, outSecond, cycleFirst, cycleSecond;
        for (int sample = 0; sample < 20000; ++sample) {
            const float gate = sample < 100 ? 1 : 0;
            first.Tick(gate, 0, outFirst, cycleFirst);
            second.Tick(gate, 0, outSecond, cycleSecond);
            assert(outFirst == outSecond && cycleFirst == cycleSecond);
        }
        // Een andere seed geeft andere samples.
        Gendyn other;
        other.Init(rate);
        other.setControl(Gendyn::Seed, 8); other.setControl(Gendyn::AmpStep, 0.8f);
        float difference = 0;
        for (int sample = 0; sample < 20000; ++sample) {
            float outOther, cycleOther;
            other.Tick(sample < 100 ? 1 : 0, 0, outOther, cycleOther);
            first.Tick(0, 0, outFirst, cycleFirst);
            difference += std::fabs(outOther - outFirst);
        }
        assert(difference > 10);

        // Zonder stappen: stilstaande, periodieke golf.
        Gendyn still;
        still.Init(rate);
        still.setControl(Gendyn::AmpStep, 0);
        still.setControl(Gendyn::DurStep, 0);
        still.setControl(Gendyn::Settle, 0);
        const int period = static_cast<int>(rate / 261.625565f + 0.5f);
        float buffer[8192];
        for (int sample = 0; sample < 4000; ++sample) still.Tick(0, 0, out, cycle);
        for (int sample = 0; sample < period * 2; ++sample) still.Tick(0, 0, buffer[sample], cycle);
        float mismatch = 0, magnitude = 0;
        for (int sample = 0; sample < period; ++sample) {
            mismatch += std::fabs(buffer[sample] - buffer[sample + period]);
            magnitude += std::fabs(buffer[sample]);
        }
        assert(magnitude > 0 && mismatch < magnitude * 0.05f);
    }
    std::printf("PASS: barriers, bounded output, cycle rate follows pitch, seeded reproducibility, static waveform at 4 rates; kernel %zu bytes\n", sizeof(Gendyn));
}
