// Invariantentest voor de excitable-media-kern: stil zonder pacemaker, het
// medium dooft na loslaten, de pulsfrequentie bij de linker pickup volgt
// V/Oct, een korte periode tegenover een lange refractaire tijd geeft een
// subharmoniek (elke tweede puls geblokkeerd), de uitgang blijft begrensd en
// reset wist alles. Op vier samplerates.
#include "mmb_dsp/excitable.h"
#include <cassert>
#include <cmath>
#include <cstdio>
#include <initializer_list>

namespace {
int countPulses(mmb_dsp::ExcitableMedium& medium, float seconds, float rate, bool gateA, bool gateB) {
    int pulses = 0;
    bool above = false;
    float left, right;
    for (int sample = 0; sample < static_cast<int>(seconds * rate); ++sample) {
        medium.Tick(gateA, gateB, 0, left, right);
        assert(std::isfinite(left) && std::isfinite(right) && std::fabs(left) <= 1 && std::fabs(right) <= 1);
        const bool now = left > 0.15f;
        if (now && !above) ++pulses;
        above = now;
    }
    return pulses;
}
}

int main() {
    using Medium = mmb_dsp::ExcitableMedium;
    static_assert(sizeof(Medium) < 4096, "Excitable medium must stay a small fixed-state kernel");
    for (const float rate : {32000.0f, 44100.0f, 48000.0f, 96000.0f}) {
        Medium medium;
        medium.Init(rate);
        medium.setControl(Medium::Level, 1);
        medium.setControl(Medium::Pickup, 0);
        float left, right;
        for (int sample = 0; sample < 2000; ++sample) {
            medium.Tick(0, 0, 0, left, right);
            assert(left == 0 && right == 0 && medium.activity() == 0);
        }
        // Pacemaker A op C4: ~261,6 pulsen per seconde bij de linker pickup.
        countPulses(medium, 0.2f, rate, true, false);
        const int pulses = countPulses(medium, 1, rate, true, false);
        assert(pulses > 250 && pulses < 275);
        // Loslaten: binnen 20 ms stil en leeg.
        for (int sample = 0; sample < static_cast<int>(rate * 0.02f); ++sample) medium.Tick(0, 0, 0, left, right);
        assert(medium.activity() == 0);
        for (int sample = 0; sample < 1000; ++sample) { medium.Tick(0, 0, 0, left, right); assert(std::fabs(left) < 0.02f); }

        // Subharmoniek: periode korter dan actief + refractair blokkeert elke
        // tweede prikkel. Pitch +24 (1046 Hz), Refract 60 bij Speed 2.
        Medium blocked;
        blocked.Init(rate);
        blocked.setControl(Medium::Level, 1);
        blocked.setControl(Medium::Pickup, 0);
        blocked.setControl(Medium::Pitch, 24);
        blocked.setControl(Medium::Refract, 60);
        countPulses(blocked, 0.2f, rate, true, false);
        const int blockedPulses = countPulses(blocked, 1, rate, true, false);
        assert(blockedPulses < 700);
        blocked.setControl(Medium::Refract, 2);
        countPulses(blocked, 0.2f, rate, true, false);
        const int freePulses = countPulses(blocked, 1, rate, true, false);
        assert(freePulses > 1000);

        // Twee bronnen: het medium vernietigt botsende fronten, dus de
        // middelste pickup hoort minder pulsen dan de som van beide bronnen.
        Medium duet;
        duet.Init(rate);
        duet.setControl(Medium::Level, 1);
        duet.setControl(Medium::Pickup, 1);
        duet.setControl(Medium::Detune, 7);
        countPulses(duet, 0.2f, rate, true, true);
        const int duetPulses = countPulses(duet, 1, rate, true, true);
        assert(duetPulses > 100 && duetPulses < 262 + 392);

        // Reset wist het medium onmiddellijk.
        duet.Tick(1, 1, 1, left, right);
        assert(duet.activity() == 0);
        // Extremen: Speed 1, Excite 8, Thresh 3 en hoge toonhoogte blijven begrensd.
        Medium extreme;
        extreme.Init(rate);
        extreme.setControl(Medium::Speed, 1);
        extreme.setControl(Medium::Excite, 8);
        extreme.setControl(Medium::Thresh, 3);
        extreme.setControl(Medium::Pitch, 36);
        extreme.setControl(Medium::Level, 1);
        countPulses(extreme, 0.5f, rate, true, true);
    }
    std::printf("PASS: silence, pulse rate follows pitch, release empties, refractory block, collision loss, reset, extremes at 4 rates; kernel %zu bytes\n", sizeof(Medium));
}
