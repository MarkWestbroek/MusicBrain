// Invariantentest voor de scanned-synthesis-kern (geen vergelijking met
// oude code): de vrije ring verliest energie, de uitgang blijft begrensd,
// een gehouden druk geeft een stilstaande vorm met de juiste periode, en
// reset wist alles. Op vier samplerates.
#include "mmb_dsp/scanned_string.h"
#include <cassert>
#include <cmath>
#include <cstdio>
#include <initializer_list>

int main() {
    using String = mmb_dsp::ScannedString;
    static_assert(sizeof(String) < 1024, "Scanned string must stay a small fixed-state kernel");
    for (const float rate : {32000.0f, 44100.0f, 48000.0f, 96000.0f}) {
        String string;
        string.Init(rate);
        string.setControl(String::Damping, 0);
        float out;
        // Aanslag, dan vrije beweging: zonder demping mag de mechanische
        // energie niet groeien (symplectische stap, harde grens neemt alleen weg).
        string.Tick(0, 1, 1, 0, 0, out);
        for (int sample = 0; sample < 64; ++sample) string.Tick(0, 1, 1, 0, 0, out);
        float previous = string.mechanicalEnergy();
        assert(previous > 0);
        float peak = 0;
        for (int sample = 0; sample < static_cast<int>(rate * 2); ++sample) {
            string.Tick(0, 0, 1, 0, 0, out);
            assert(std::isfinite(out) && std::fabs(out) <= 1);
            peak = std::fabs(out) > peak ? std::fabs(out) : peak;
            const float energy = string.mechanicalEnergy();
            assert(energy <= previous * 1.001f + 1e-6f);
            previous = energy;
        }
        assert(peak > 0.05f);

        // Met demping sterft de beweging uit.
        string.Init(rate);
        string.setControl(String::Damping, 1);
        string.setControl(String::Speed, 0.5f);
        string.Tick(0, 1, 1, 0, 0, out);
        for (int sample = 0; sample < static_cast<int>(rate * 3); ++sample) string.Tick(0, 0, 1, 0, 0, out);
        assert(string.mechanicalEnergy() < 1e-4f);

        // Gehouden druk: stilstaande vorm, periode = rate / 261,6 Hz.
        string.Init(rate);
        string.setControl(String::Damping, 1);
        string.setControl(String::Speed, 0.5f);
        for (int sample = 0; sample < static_cast<int>(rate * 2); ++sample) string.Tick(0, 0, 1, 1, 0, out);
        assert(string.energy() > 0.1f);
        const int period = static_cast<int>(rate / 261.625565f);
        float first[4096], second[4096];
        for (int sample = 0; sample < period; ++sample) string.Tick(0, 0, 1, 1, 0, first[sample]);
        for (int sample = 0; sample < period; ++sample) string.Tick(0, 0, 1, 1, 0, second[sample]);
        float difference = 0, magnitude = 0;
        for (int sample = 0; sample < period; ++sample) {
            difference += std::fabs(first[sample] - second[sample]);
            magnitude += std::fabs(first[sample]);
        }
        assert(magnitude > 0 && difference < magnitude * 0.05f);

        // Extremen: druk, audio en snelle aanslagen tegelijk blijven begrensd.
        string.Init(rate);
        string.setControl(String::Speed, 1);
        string.setControl(String::Tension, 1);
        string.setControl(String::Restore, 1);
        string.setControl(String::Level, 1);
        for (int sample = 0; sample < 20000; ++sample) {
            string.Tick(1, sample % 64 < 32, 1, 1, 0, out);
            assert(std::isfinite(out) && std::fabs(out) <= 1);
        }
        string.Tick(0, 0, 1, 0, 1, out);
        assert(string.mechanicalEnergy() == 0 && string.energy() == 0);
    }
    std::printf("PASS: energy non-increasing, damping, pressed shape periodic, bounded extremes, reset at 4 rates; kernel %zu bytes\n", sizeof(String));
}
