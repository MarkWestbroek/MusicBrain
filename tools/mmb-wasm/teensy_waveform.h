// `AudioSynthWaveform` uit de Teensy Audio Library, zonder AudioStream: de
// oscillator achter de octa-, wavetable- en draw-VCO van de firmware.
// Overgeschreven zijn de vormen die de firmware gebruikt — sine, triangle,
// sawtooth, square en arbitrary (256 punten), níét de bandbegrensde — in hun
// eigen integer-rekenkunde. ARM-instructies (smmul, smulwt, ssat) staan
// uitgeschreven; wat op ARM stil overloopt (de triangle bij hoge amplitude),
// wikkelt hier ook om.
//
// Bron: synth_waveform.cpp/.h en data_waveforms.c uit de Teensy Audio
// Library, Copyright (c) 2018 John-Michael Reed en (c) 2014 Paul Stoffregen,
// PJRC.COM, LLC. MIT-licentie; zie de bron voor de volledige tekst.
#pragma once
#include <cstdint>

enum TeensyWave : short { TW_SINE, TW_SAWTOOTH, TW_SQUARE, TW_TRIANGLE, TW_ARBITRARY };

inline const int16_t kTeensySine[257] = {
     0,   804,  1608,  2410,  3212,  4011,  4808,  5602,  6393,  7179,
  7962,  8739,  9512, 10278, 11039, 11793, 12539, 13279, 14010, 14732,
 15446, 16151, 16846, 17530, 18204, 18868, 19519, 20159, 20787, 21403,
 22005, 22594, 23170, 23731, 24279, 24811, 25329, 25832, 26319, 26790,
 27245, 27683, 28105, 28510, 28898, 29268, 29621, 29956, 30273, 30571,
 30852, 31113, 31356, 31580, 31785, 31971, 32137, 32285, 32412, 32521,
 32609, 32678, 32728, 32757, 32767, 32757, 32728, 32678, 32609, 32521,
 32412, 32285, 32137, 31971, 31785, 31580, 31356, 31113, 30852, 30571,
 30273, 29956, 29621, 29268, 28898, 28510, 28105, 27683, 27245, 26790,
 26319, 25832, 25329, 24811, 24279, 23731, 23170, 22594, 22005, 21403,
 20787, 20159, 19519, 18868, 18204, 17530, 16846, 16151, 15446, 14732,
 14010, 13279, 12539, 11793, 11039, 10278,  9512,  8739,  7962,  7179,
  6393,  5602,  4808,  4011,  3212,  2410,  1608,   804,     0,  -804,
 -1608, -2410, -3212, -4011, -4808, -5602, -6393, -7179, -7962, -8739,
 -9512,-10278,-11039,-11793,-12539,-13279,-14010,-14732,-15446,-16151,
-16846,-17530,-18204,-18868,-19519,-20159,-20787,-21403,-22005,-22594,
-23170,-23731,-24279,-24811,-25329,-25832,-26319,-26790,-27245,-27683,
-28105,-28510,-28898,-29268,-29621,-29956,-30273,-30571,-30852,-31113,
-31356,-31580,-31785,-31971,-32137,-32285,-32412,-32521,-32609,-32678,
-32728,-32757,-32767,-32757,-32728,-32678,-32609,-32521,-32412,-32285,
-32137,-31971,-31785,-31580,-31356,-31113,-30852,-30571,-30273,-29956,
-29621,-29268,-28898,-28510,-28105,-27683,-27245,-26790,-26319,-25832,
-25329,-24811,-24279,-23731,-23170,-22594,-22005,-21403,-20787,-20159,
-19519,-18868,-18204,-17530,-16846,-16151,-15446,-14732,-14010,-13279,
-12539,-11793,-11039,-10278, -9512, -8739, -7962, -7179, -6393, -5602,
 -4808, -4011, -3212, -2410, -1608,  -804,     0
};

struct TeensyWaveform {
    uint32_t phase_accumulator = 0, phase_increment = 0, phase_offset = 0;
    int32_t  magnitude = 0;
    const int16_t* arbdata = nullptr;
    short    tone_type = TW_SINE;

    void frequency(float freq) {
        if (freq < 0.0f) freq = 0.0f;
        else if (freq > 44100.0f / 2.0f) freq = 44100.0f / 2.0f;
        phase_increment = static_cast<uint32_t>(freq * (4294967296.0f / 44100.0f));
        if (phase_increment > 0x7FFE0000u) phase_increment = 0x7FFE0000;
    }
    void amplitude(float n) {
        if (n < 0) n = 0; else if (n > 1.0f) n = 1.0f;
        magnitude = static_cast<int32_t>(n * 65536.0f);
    }
    void begin(short t) { phase_offset = 0; tone_type = t; }
    void arbitraryWaveform(const int16_t* data) { arbdata = data; }

    /** Eén sample van `update()`; 0 als de amplitude nul is (geen blok). */
    int16_t next() {
        const uint32_t ph = phase_accumulator + phase_offset;
        phase_accumulator += phase_increment;
        if (magnitude == 0) return 0;
        switch (tone_type) {
            case TW_SINE: case TW_ARBITRARY: {
                const int16_t* tab = tone_type == TW_SINE ? kTeensySine : arbdata;
                if (!tab) return 0;
                const uint32_t index = ph >> 24;
                uint32_t index2 = index + 1;
                if (tone_type == TW_ARBITRARY && index2 >= 256) index2 = 0;
                int32_t val1 = tab[index], val2 = tab[index2];
                const uint32_t scale = (ph >> 8) & 0xFFFF;
                val2 = static_cast<int32_t>(static_cast<uint32_t>(val2) * scale);
                val1 = static_cast<int32_t>(static_cast<uint32_t>(val1) * (0x10000 - scale));
                const int32_t sum = static_cast<int32_t>(static_cast<uint32_t>(val1) + static_cast<uint32_t>(val2));
                return static_cast<int16_t>((static_cast<int64_t>(sum) * magnitude) >> 32);   // smmul
            }
            case TW_SQUARE: {
                int32_t m15 = magnitude >> 1;                                                   // ssat #16, asr #1
                m15 = m15 > 32767 ? 32767 : (m15 < -32768 ? -32768 : m15);
                return static_cast<int16_t>((ph & 0x80000000u) ? -m15 : m15);
            }
            case TW_SAWTOOTH:                                                                   // smulwt
                return static_cast<int16_t>((static_cast<int64_t>(magnitude) * static_cast<int16_t>(ph >> 16)) >> 16);
            case TW_TRIANGLE: {
                const uint32_t phtop = ph >> 30;
                if (phtop == 1 || phtop == 2) {
                    const uint32_t v = (0xFFFFu - (ph >> 15)) * static_cast<uint32_t>(magnitude);
                    return static_cast<int16_t>(v >> 16);
                }
                const int32_t v = static_cast<int32_t>(static_cast<uint32_t>(static_cast<int32_t>(ph) >> 15)
                                                      * static_cast<uint32_t>(magnitude));
                return static_cast<int16_t>(v >> 16);
            }
        }
        return 0;
    }
};
