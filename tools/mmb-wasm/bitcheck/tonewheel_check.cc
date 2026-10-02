// Invariantentest voor het tonewheel-orgel op vier samplefrequenties: een
// toets tapt per trekstang één zuivere sinus af op de juiste voetmaat, twee
// toetsen op hetzelfde wiel tellen in fase op, de hoogste voetmaat vouwt
// terug, percussie slaat alleen op de eerste toets aan, loslaten is stil, en
// twaalf toetsen met alles open blijven binnen ±1.
#include "kernel_check.h"
#include "mmb_dsp/tonewheel.h"

namespace {
using mmb_dsp::Tonewheel;

/** Orgel met alle trekstangen dicht, zonder click en lek, zacht. */
void bare(Tonewheel& organ, float rate) {
    organ.Init(rate);
    for (int bar = Tonewheel::Bar16; bar <= Tonewheel::Bar1; ++bar) organ.setControl(bar, 0);
    organ.setControl(Tonewheel::Click, 0);
    organ.setControl(Tonewheel::Leak, 0);
    organ.setControl(Tonewheel::Level, 0.3f);
}
void key(Tonewheel& organ, int cell, float voct, bool down) {
    organ.setCv(cell, voct);
    organ.setCv(Tonewheel::kGateBase + cell, down ? 1.0f : 0.0f);
}
}  // namespace

int main() {
    using namespace check;
    for (const float rate : kRates) {
        const size_t from = static_cast<size_t>(0.2 * rate);
        // A4 met 16', 8' en 4'.
        Tonewheel organ;
        bare(organ, rate);
        organ.setControl(Tonewheel::Bar16, 8); organ.setControl(Tonewheel::Bar8, 8); organ.setControl(Tonewheel::Bar4, 8);
        auto out = run<Tonewheel, 1>(organ, rate, 1, false, silence(), [&](double) { key(organ, 0, 0.75f, true); })[0];
        const double base = tone(out, 440, rate, from);
        assert(base > 0.03);
        assert(std::fabs(tone(out, 220, rate, from) / base - 1) < 0.02 && std::fabs(tone(out, 880, rate, from) / base - 1) < 0.02);
        assert(db(tone(out, 660, rate, from) / base) < -50);

        // Zelfde wiel uit twee toetsen: precies twee keer zo sterk.
        Tonewheel one, two;
        bare(one, rate); bare(two, rate);
        one.setControl(Tonewheel::Bar8, 8); two.setControl(Tonewheel::Bar8, 8);
        auto a = run<Tonewheel, 1>(one, rate, 1, false, silence(), [&](double) { key(one, 0, 0.75f, true); })[0];
        auto b = run<Tonewheel, 1>(two, rate, 1, false, silence(), [&](double) { key(two, 0, 0.75f, true); key(two, 5, 0.75f, true); })[0];
        assert(tone(b, 440, rate, from) / tone(a, 440, rate, from) > 1.95);

        // Foldback: C7 met 1' klinkt op C8 (4186 Hz), niet op C10.
        Tonewheel top;
        bare(top, rate);
        top.setControl(Tonewheel::Bar1, 8);
        auto folded = run<Tonewheel, 1>(top, rate, 1, false, silence(), [&](double) { key(top, 0, 3, true); })[0];
        assert(tone(folded, 4186.01, rate, from) > 0.03);

        // Percussie: eerste toets wel, legato tweede niet, na loslaten weer wel; daarna stil.
        Tonewheel perc;
        bare(perc, rate);
        perc.setControl(Tonewheel::Bar8, 8); perc.setControl(Tonewheel::Percussion, 1); perc.setControl(Tonewheel::PercSoft, 1);
        auto played = run<Tonewheel, 1>(perc, rate, 2.2, false, silence(), [&](double t) {
            key(perc, 0, 0, t >= 0.1 && t < 0.9);
            key(perc, 1, 0.25f, t >= 0.5 && t < 0.9);
            key(perc, 2, 0.5f, t >= 1.2 && t < 1.8);
        })[0];
        const auto part = [&](double start, double end) {
            return std::vector<float>(played.begin() + static_cast<int>(start * rate), played.begin() + static_cast<int>(end * rate));
        };
        const double first = tone(part(0.1, 0.16), 523.2511, rate);
        assert(first > 0.01);
        assert(tone(part(0.5, 0.56), 622.254, rate) < first * 0.25);
        assert(tone(part(1.2, 1.26), 739.9888, rate) > first * 0.7);
        for (int i = static_cast<int>(1.9 * rate); i < static_cast<int>(2.2 * rate); ++i) assert(std::fabs(played[i]) < 1e-5f);

        // Vol orgel: run() controleert eindig en ±1.
        Tonewheel full;
        full.Init(rate);
        for (int bar = Tonewheel::Bar16; bar <= Tonewheel::Bar1; ++bar) full.setControl(bar, 8);
        full.setControl(Tonewheel::Percussion, 2); full.setControl(Tonewheel::Vibrato, 6);
        full.setControl(Tonewheel::Level, 1); full.setControl(Tonewheel::Click, 1); full.setControl(Tonewheel::Leak, 1);
        run<Tonewheel, 1>(full, rate, 1, false, silence(), [&](double t) {
            for (int cell = 0; cell < Tonewheel::kVoices; ++cell) key(full, cell, -2 + cell * 0.25f, t > 0.05 * cell && t < 0.9);
            full.setCv(Tonewheel::kSwell, t < 0.5 ? 1.0f : NAN);
        });
    }
    std::printf("PASS: drawbar footages are pure sines, shared wheels add in phase, foldback, single-trigger percussion, silent when released, four rates; kernel %zu bytes\n",
                sizeof(mmb_dsp::Tonewheel));
}
