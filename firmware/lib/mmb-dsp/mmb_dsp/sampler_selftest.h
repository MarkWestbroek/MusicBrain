#pragma once
/**
 * @file sampler_selftest.h
 * @brief Eén vaste proef voor de samplerstem met MS-20 en auto-wah — zelfde
 *        code op de Teensy en op de pc, om te zien of het rekenwerk verschilt.
 * @details
 * Aanleiding: op de Teensy tikte een resonante MS-20 in de samplercel met
 * auto-wah (~50 breuken per seconde), in de simulator niet. Dezelfde kern,
 * dus: rekent de ARM anders (afronding, fused multiply-add, tanhf), of
 * ontstaan de tikken pas in de audiostroom onder zware last? Deze proef
 * draait buiten de audioroutine om, zonder uitgang, en telt breuken in de
 * golfvorm. Op de pc (tools/, wasm) draait precies dezelfde functie.
 *
 * Het scenario: drie stemmen C-E-G, hard aangeslagen (1,2 s), los (0,8 s),
 * zacht (1,2 s), los (0,8 s). Filter MS-20, cutoff 300 Hz, drive, cv_amt 4
 * octaven, env_rel 150 ms, env_sens +12 dB; elke 32 samples cutoff := env en
 * PrepareBlock() — zoals de SamplerStream sinds fw 0.5.54 en de sampler-wasm.
 */
#include <cmath>
#include "sample_player.h"

namespace mmb_dsp {

/** Telt breuken: waar de tweede afgeleide ver boven zijn lopend gemiddelde uitschiet. */
struct BreakCounter {
    float x1 = 0.0f, x2 = 0.0f, ms = 1e-12f;
    long  n = 0;
    int   count = 0;
    float worst = 0.0f;       ///< grootste uitschieter, in σ
    long  firstAt = -1;       ///< sample van de eerste breuk

    void push(float x) {
        const float d2 = x - 2.0f * x1 + x2;
        x2 = x1; x1 = x;
        const float a = d2 * d2;
        if (n > 2000 && ms > 1e-14f) {
            const float sigma = std::sqrt(a / ms);
            if (sigma > worst) worst = sigma;
            if (sigma > 8.0f) { ++count; if (firstAt < 0) firstAt = n; }
        }
        ms += 0.002f * (a - ms);
        ++n;
    }
};

/**
 * Speel het scenario op drie stemmen die al Init() en bind() hebben gehad.
 * @return aantal gerenderde samples.
 */
/**
 * @param tick    optioneel: elke 32 samples aangeroepen (de "hoofdlus" van
 *                een streamende bank: vult de ringen); nullptr = niets.
 * @param capture optioneel: de uitgang als int16 (geklemd), voor een
 *                sample-exacte vergelijking tussen twee runs; nullptr = niet.
 */
inline long samplerSelfTest(SamplePlayer* v, float sr, float q, float drive, BreakCounter& bc,
                            void (*tick)(void*) = nullptr, void* tickArg = nullptr,
                            int16_t* capture = nullptr, long captureMax = 0) {
    constexpr int kVoices = 3, kSub = 32;
    const int notes[kVoices] = { 60, 64, 67 };
    for (int k = 0; k < kVoices; ++k) {
        v[k].set_level(0.8f);
        v[k].set_filter_type(2);
        v[k].set_filter_cutoff(300.0f);
        v[k].set_filter_resonance(q);
        v[k].set_filter_mode(0);
        v[k].set_filter_drive(drive);
        v[k].set_cutoff_cv_amount(4.0f);
        v[k].set_env_times(2.0f, 150.0f);
        v[k].set_env_sens_db(12.0f);
    }
    long n = 0;
    auto segment = [&](float secs, int vel, bool on) {
        if (on) for (int k = 0; k < kVoices; ++k) {
            v[k].set_voct((notes[k] - 60) / 12.0f);
            v[k].noteOn(notes[k], vel);
        } else for (int k = 0; k < kVoices; ++k) v[k].noteOff(-1);
        const long total = static_cast<long>(secs * sr);
        for (long i = 0; i < total; ++i, ++n) {
            if (n % kSub == 0) {
                if (tick) tick(tickArg);
                for (int k = 0; k < kVoices; ++k) {
                    v[k].set_cutoff_cv(v[k].env());
                    v[k].PrepareBlock();
                }
            }
            float mix[kMaxChannels] = {};
            for (int k = 0; k < kVoices; ++k) v[k].Process(mix, 4);
            float y = mix[0];
            if (!(y == y)) y = 0.0f;
            y = y > 1.0f ? 1.0f : (y < -1.0f ? -1.0f : y);   // zoals de uitgang van de stream
            bc.push(y);
            if (capture && n < captureMax) capture[n] = static_cast<int16_t>(y * 32767.0f);
        }
    };
    segment(1.2f, 127, true); segment(0.8f, 0, false);
    segment(1.2f, 64, true);  segment(0.8f, 0, false);
    return n;
}

}  // namespace mmb_dsp
