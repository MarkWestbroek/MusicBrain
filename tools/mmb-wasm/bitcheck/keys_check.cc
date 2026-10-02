// Invariantentest voor de complex-oscillator en de elektrische piano op vier
// samplefrequenties: de complex-oscillator is met Timbre 0 een zuivere sinus
// op de toonhoogte van V/Oct en vouwt oneven boventonen erbij; de piano
// klinkt op de toonhoogte, sterft uit, dempt bij loslaten, is harder
// aangeslagen luider en helderder, en twaalf toetsen blijven binnen ±1.
#include "kernel_check.h"
#include "mmb_dsp/complex_osc.h"
#include "mmb_dsp/epiano.h"

int main() {
    using namespace check;
    using mmb_dsp::ComplexOsc;
    using mmb_dsp::EPiano;
    const double f0 = 261.6256;
    for (const float rate : kRates) {
        const size_t from = static_cast<size_t>(0.2 * rate);
        // Complex: zuivere sinus, dan gevouwen, dan FM.
        ComplexOsc pure;
        pure.Init(rate);
        pure.setControl(ComplexOsc::Timbre, 0); pure.setControl(ComplexOsc::Level, 1);
        auto sineOut = run<ComplexOsc, 2>(pure, rate, 1, false, silence(), nothing())[0];
        assert(db(tone(sineOut, f0, rate, from)) > -0.5 && db(tone(sineOut, 3 * f0, rate, from)) < -70);
        pure.setControl(ComplexOsc::Timbre, 0.6f);
        auto folded = run<ComplexOsc, 2>(pure, rate, 1, false, silence(), nothing())[0];
        assert(db(tone(folded, 3 * f0, rate, from)) > -20 && db(tone(folded, 2 * f0, rate, from)) < -60);
        ComplexOsc fm;
        fm.Init(rate);
        fm.setControl(ComplexOsc::Timbre, 0); fm.setControl(ComplexOsc::Level, 1);
        fm.setControl(ComplexOsc::Fm, 0.5f); fm.setControl(ComplexOsc::Ratio, 2);
        auto both = run<ComplexOsc, 2>(fm, rate, 1, false, silence(), nothing());
        assert(db(tone(both[0], 3 * f0, rate, from)) > -20 && db(tone(both[0], 2 * f0, rate, from)) < -60);
        assert(db(tone(both[1], 2 * f0, rate, from)) > -3);
        ComplexOsc wild;
        wild.Init(rate);
        for (int control : {ComplexOsc::Fm, ComplexOsc::Am, ComplexOsc::TimbreMod, ComplexOsc::Timbre, ComplexOsc::Symmetry})
            wild.setControl(control, 1);
        wild.setControl(ComplexOsc::Ratio, 7.3f); wild.setControl(ComplexOsc::ModWave, 2);
        run<ComplexOsc, 2>(wild, rate, 1, false, silence(), [&](double t) { wild.setCv(ComplexOsc::Voct, t < 0.5 ? 4.0f : NAN); });

        // E-piano.
        const auto rmsOf = [&](const std::vector<float>& a, double start, double end) {
            double sum = 0; int n = 0;
            for (int i = static_cast<int>(start * rate); i < static_cast<int>(end * rate); ++i) { sum += a[i] * a[i]; ++n; }
            return std::sqrt(sum / n);
        };
        double loudness[2], brightness[2];
        for (int hard = 0; hard < 2; ++hard) {
            EPiano piano;
            piano.Init(rate);
            piano.setControl(EPiano::Tremolo, 0);
            auto out = run<EPiano, 2>(piano, rate, 2, false, silence(), [&](double t) {
                piano.setCv(0, 0);
                piano.setCv(EPiano::kVelBase, hard ? 1.0f : 0.25f);
                piano.setCv(EPiano::kGateBase, t < 1 ? 1.0f : 0.0f);
            })[0];
            std::vector<float> early(out.begin() + static_cast<int>(0.05 * rate), out.begin() + static_cast<int>(0.3 * rate));
            std::vector<float> late(out.begin() + static_cast<int>(0.7 * rate), out.begin() + static_cast<int>(0.95 * rate));
            assert(tone(early, f0, rate) > 0.01);
            assert(tone(late, f0, rate) < tone(early, f0, rate));                    // sterft uit
            assert(rmsOf(out, 1.4, 1.7) < rmsOf(out, 0.7, 0.95) * 0.02);             // demper
            loudness[hard] = rmsOf(out, 0.05, 0.3);
            brightness[hard] = db(tone(early, 3 * f0, rate) / tone(early, f0, rate));
        }
        assert(loudness[1] > loudness[0] * 3 && brightness[1] > brightness[0] + 15);

        EPiano full;
        full.Init(rate);
        full.setControl(EPiano::Drive, 1); full.setControl(EPiano::Bell, 1); full.setControl(EPiano::Level, 1);
        run<EPiano, 2>(full, rate, 1.5, false, silence(), [&](double t) {
            for (int cell = 0; cell < EPiano::kVoices; ++cell) {
                full.setCv(cell, cell == 3 ? NAN : -2 + cell * 0.3f);
                full.setCv(EPiano::kVelBase + cell, 1);
                full.setCv(EPiano::kGateBase + cell, t > 0.02 * cell && t < 1 ? 1.0f : 0.0f);
            }
        });
    }
    std::printf("PASS: complex osc pure sine / odd folds / harmonic FM, e-piano pitch, decay, damper, velocity, twelve keys bounded, four rates; complex %zu, e-piano %zu bytes\n",
                sizeof(ComplexOsc), sizeof(EPiano));
}
