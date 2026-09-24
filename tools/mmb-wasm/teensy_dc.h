// `AudioSynthWaveformDc` uit de Teensy Audio Library, zonder AudioStream: de
// DC-proxy waarmee de firmware een CV-waarde (1 kHz) als audiosignaal op de
// modulatie-ingang van een filter zet, met een lineaire slew in int32.
// Overgeschreven uit synth_dc.h (Copyright (c) Paul Stoffregen, PJRC.COM,
// LLC — MIT-licentie, zie de bron voor de volledige tekst).
#pragma once
#include <cstdint>

struct TeensyDc {
    int32_t magnitude = 0, target = 0, increment = 0;
    bool ramping = false;

    /** `amplitude(n, ms)`: lineair naar `n` (±1) in `ms` milliseconden. */
    void amplitude(float n, float ms) {
        if (n > 1.0f) n = 1.0f; else if (n < -1.0f) n = -1.0f;
        const int32_t c = static_cast<int32_t>(ms * (44100.0f / 1000.0f));
        const int32_t t = static_cast<int32_t>(n * 2147418112.0f);
        if (c == 0) { magnitude = target = t; ramping = false; return; }
        target = t;
        if (target == magnitude) { ramping = false; return; }
        increment = static_cast<int32_t>((static_cast<int64_t>(target) - magnitude) / c);
        if (increment == 0) increment = (target > magnitude) ? 1 : -1;
        ramping = true;
    }
    /** Eén sample, als int16 zoals het blok dat de ontvanger krijgt. */
    int16_t next() {
        if (ramping) {
            const int64_t m = static_cast<int64_t>(magnitude) + increment;
            if ((increment > 0 && m >= target) || (increment < 0 && m <= target)) {
                magnitude = target; ramping = false;
            } else {
                magnitude = static_cast<int32_t>(m);
            }
        }
        return static_cast<int16_t>(magnitude >> 16);
    }
};
