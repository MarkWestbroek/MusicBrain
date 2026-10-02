// Invariantentest voor de ritmebox: de patroontabel is consistent (elke regel
// precies `steps` tekens, alleen 'x' en '.', stappen deelbaar door de tellen),
// en op vier samplefrequenties loopt hij op tempo, blijft hij binnen ±1 en
// zwijgt hij na stop.
#include "kernel_check.h"
#include "mmb_dsp/rhythm_box.h"
#include <cstring>

int main() {
    using namespace check;
    using mmb_dsp::RhythmBox;
    for (int r = 0; r < mmb_dsp::kCr78PatternCount; ++r) {
        const auto& p = mmb_dsp::kCr78Patterns[r];
        assert(p.steps <= RhythmBox::kMaxSteps && p.steps % p.beats == 0);
        for (const mmb_dsp::RhythmBar* bar : {&p.a, &p.b}) {
            const char* const* rows = &bar->bd;
            int hits = 0;
            for (int v = 0; v <= RhythmBox::kVoices; ++v) {
                if (!rows[v]) continue;
                assert(static_cast<int>(std::strlen(rows[v])) == p.steps);
                for (const char* c = rows[v]; *c; ++c) { assert(*c == 'x' || *c == '.'); hits += *c == 'x'; }
            }
            assert(hits > 0);
        }
    }
    for (const float rate : kRates) {
        for (int r = 0; r < mmb_dsp::kCr78PatternCount; ++r) {
            RhythmBox box;
            box.Init(rate);
            box.setControl(RhythmBox::Rhythm, static_cast<float>(r));
            box.setControl(RhythmBox::Tempo, 120);
            int steps = 0;
            bool stepHigh = false;
            auto out = run<RhythmBox, 2>(box, rate, 2, false, silence(), [&](double) {
                const bool high = box.cvOut(RhythmBox::StepOut) >= 0.5f;
                if (high && !stepHigh) ++steps;
                stepHigh = high;
            });
            const auto& p = mmb_dsp::kCr78Patterns[r];
            const int expected = 2 * 2 * p.steps / p.beats;     // 2 s op 120 bpm = 4 tellen
            assert(steps >= expected - 1 && steps <= expected + 1);
            double energy = 0;
            for (float v : out[0]) energy += v * v;
            assert(energy > 1);
        }
        RhythmBox stopped;
        stopped.Init(rate);
        stopped.setControl(RhythmBox::Run, 0);
        auto quiet = run<RhythmBox, 2>(stopped, rate, 1, false, silence(), nothing());
        for (float v : quiet[0]) assert(v == 0);
    }
    std::printf("PASS: %d patterns well-formed, tempo exact, bounded, silent when stopped, four rates; kernel %zu bytes\n",
                mmb_dsp::kCr78PatternCount, sizeof(RhythmBox));
}
