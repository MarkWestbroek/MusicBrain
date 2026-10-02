// Invariantentest voor de frequency shifter op vier samplefrequenties: de
// gewenste zijband komt op volle sterkte door, de andere ligt minstens 40 dB
// lager van 60 Hz tot 12 kHz, de richting keert om met het teken, en met
// maximale feedback blijft de uitgang begrensd.
#include "kernel_check.h"
#include "mmb_dsp/freq_shifter.h"

int main() {
    using namespace check;
    using mmb_dsp::FreqShifter;
    static_assert(sizeof(FreqShifter) < 256, "FreqShifter must stay a small kernel");
    double worst = -200;
    for (const float rate : kRates) {
        for (const double hz : {60.0, 1000.0, 12000.0}) {
            for (const float direction : {1.0f, -1.0f}) {
                FreqShifter shifter;
                shifter.Init(rate);
                shifter.setControl(FreqShifter::Shift, 0.2f * direction);   // 0,2 x 500 = 100 Hz
                shifter.setControl(FreqShifter::Range, 2);
                shifter.setControl(FreqShifter::Level, 1);
                auto out = run<FreqShifter, 2>(shifter, rate, 1.5, true, sine(hz, 0.5), nothing());
                const size_t from = static_cast<size_t>(rate * 0.5);
                const double wanted = hz + 100 * direction, mirror = hz - 100 * direction;
                const double up = tone(out[0], std::fabs(wanted), rate, from), upLeak = tone(out[0], std::fabs(mirror), rate, from);
                const double down = tone(out[1], std::fabs(mirror), rate, from), downLeak = tone(out[1], std::fabs(wanted), rate, from);
                assert(std::fabs(db(up / 0.5)) < 0.5 && std::fabs(db(down / 0.5)) < 0.5);
                assert(db(upLeak / up) < -40 && db(downLeak / down) < -40);
                if (db(upLeak / up) > worst) worst = db(upLeak / up);
            }
        }
        FreqShifter loop;
        loop.Init(rate);
        loop.setControl(FreqShifter::Shift, 1); loop.setControl(FreqShifter::Range, 2);
        loop.setControl(FreqShifter::Feedback, 5);                           // wordt begrensd op 0,95
        loop.setCv(FreqShifter::ShiftCv, NAN);
        run<FreqShifter, 2>(loop, rate, 2, true, sine(220, 0.9), nothing());  // run() controleert eindig en ±1
    }
    std::printf("PASS: single sideband both directions, mirror below %.1f dB (60 Hz..12 kHz), bounded with feedback, four rates; kernel %zu bytes\n",
                worst, sizeof(FreqShifter));
}
