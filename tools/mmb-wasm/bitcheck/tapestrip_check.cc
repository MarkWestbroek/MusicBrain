// Invariantentest voor de tape-strip-kern (zonder bank): een bandje loopt
// met de klok mee en stopt op Length, een losgelaten toets loopt in Return
// seconden terug, snel opnieuw indrukken start waar het bandje staat, het
// kopcontact geeft een pitch-dip die wegtrekt, de motor zakt met meer
// stemmen, en de bewerking van het signaal blijft begrensd.
#include "mmb_dsp/tape_strip.h"
#include <cassert>
#include <cmath>
#include <cstdio>
#include <initializer_list>

int main() {
    using Strip = mmb_dsp::TapeStrip;
    static_assert(sizeof(Strip) < 2048, "Tape strip must stay a small fixed-state kernel");
    for (const float rate : {32000.0f, 44100.0f, 48000.0f, 96000.0f}) {
        const int block = 32;
        const int blocksPerSecond = static_cast<int>(rate / block);
        Strip strip;
        strip.Init(rate);
        strip.setControl(Strip::Length, 4);
        strip.setControl(Strip::Return, 1);
        strip.setControl(Strip::Wow, 0);
        strip.setControl(Strip::Flutter, 0);
        strip.setControl(Strip::Motor, 0);
        // Toets 60 op stem 0 vanaf het begin; na 2 s staat het bandje op 2 s.
        assert(strip.noteOn(0, 60) == 0);
        for (int b = 0; b < 2 * blocksPerSecond; ++b) strip.PrepareBlock(block);
        assert(std::fabs(strip.keyPosition(60) - 2.0f) < 0.02f);
        assert(!strip.ending(0));
        // Loslaten: in 0,5 s loopt een halve strip (2 s) terug -> ~0 s... nee:
        // Return 1 s per volle strip van 4 s, dus 2 s bandje in 0,5 s terug.
        strip.noteOff(0);
        for (int b = 0; b < blocksPerSecond / 4; ++b) strip.PrepareBlock(block);
        assert(std::fabs(strip.keyPosition(60) - 1.0f) < 0.05f);
        // Opnieuw indrukken terwijl het bandje terugloopt: start op ~1 s.
        const float resumed = strip.noteOn(1, 60);
        assert(resumed > 0.9f && resumed < 1.1f);
        // Kopcontact laten opkomen (gain beweegt alleen in Process).
        strip.PrepareBlock(block);
        for (int s = 0; s < 8000; ++s) { float io[2] = {0.5f, 0.5f}; strip.Process(1, io, 2); }
        // Doorspelen tot het einde: na 3 s meer is de strip op.
        for (int b = 0; b < 3 * blocksPerSecond + 10; ++b) strip.PrepareBlock(block);
        assert(strip.ending(1));
        float io[2] = {0.5f, 0.5f};
        int fade = 0;
        while (!strip.stopped(1) && fade < 2000) { strip.Process(1, io, 2); io[0] = io[1] = 0.5f; ++fade; }
        assert(strip.stopped(1) && fade > 10);
        strip.noteOff(1);
        // Volledig terug naar nul in Return seconden.
        for (int b = 0; b < blocksPerSecond + 10; ++b) strip.PrepareBlock(block);
        assert(strip.keyPosition(60) == 0);

        // Kopcontact: pitch-dip bij de start die binnen 200 ms wegtrekt.
        Strip contact;
        contact.Init(rate);
        contact.setControl(Strip::Contact, 1);
        contact.setControl(Strip::Wow, 0);
        contact.setControl(Strip::Flutter, 0);
        contact.setControl(Strip::Motor, 0);
        contact.noteOn(0, 64);
        contact.PrepareBlock(block);
        const float dip = contact.voctOffset(0);
        assert(dip < -0.02f);
        for (int b = 0; b < blocksPerSecond / 5; ++b) contact.PrepareBlock(block);
        assert(contact.voctOffset(0) > dip * 0.1f);
        // Opkomst: gain van 0 naar 1 binnen ~60 ms.
        float level[2] = {1, 1};
        contact.Process(0, level, 2);
        assert(std::fabs(level[0]) < 0.2f);
        for (int s = 0; s < static_cast<int>(rate * 0.08f); ++s) { level[0] = level[1] = 1; contact.Process(0, level, 2); }
        assert(level[0] > 0.5f);

        // Motor: acht stemmen trekken meer dan een; zonder Motor geen effect.
        Strip single, octet, none;
        for (Strip* s : {&single, &octet, &none}) {
            s->Init(rate);
            s->setControl(Strip::Wow, 0); s->setControl(Strip::Flutter, 0); s->setControl(Strip::Contact, 0);
        }
        single.setControl(Strip::Motor, 1); octet.setControl(Strip::Motor, 1); none.setControl(Strip::Motor, 0);
        single.noteOn(0, 60);
        for (int v = 0; v < 8; ++v) { octet.noteOn(v, 48 + v); none.noteOn(v, 48 + v); }
        for (int b = 0; b < blocksPerSecond; ++b) { single.PrepareBlock(block); octet.PrepareBlock(block); none.PrepareBlock(block); }
        assert(octet.voctOffset(0) < single.voctOffset(0) - 0.01f);
        assert(single.voctOffset(0) < 0);
        assert(none.voctOffset(0) == 0);
        assert(octet.load() > 0.9f && single.load() > 0.1f && single.load() < 0.15f);

        // Bewerking begrensd, ook met volle slijtage en hard ingangssignaal.
        Strip worn;
        worn.Init(rate);
        worn.setControl(Strip::Wear, 1);
        worn.setControl(Strip::Level, 1);
        worn.noteOn(0, 60);
        for (int b = 0; b < 10; ++b) worn.PrepareBlock(block);
        for (int s = 0; s < 20000; ++s) {
            float hot[2] = {s % 2 ? 4.0f : -4.0f, 1.0f};
            worn.Process(0, hot, 2);
            const float hiss = worn.hiss();
            assert(std::isfinite(hot[0]) && std::fabs(hot[0]) <= 1 && std::fabs(hot[1]) <= 1);
            assert(std::isfinite(hiss) && std::fabs(hiss) < 0.01f);
        }
        // Reset wist alle bandjes.
        worn.clear();
        assert(worn.keyPosition(60) == 0 && worn.load() == 0 && worn.tapePosition() == 0);
    }
    std::printf("PASS: strip timing, spring return with memory, end-of-strip fade, head contact, motor load, bounded processing at 4 rates; kernel %zu bytes\n", sizeof(Strip));
}
