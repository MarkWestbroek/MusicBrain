#pragma once
/**
 * @file biquad.h
 * @brief Biquad-bouwstenen (RBJ-cookbook) voor de EQ-modules: coëfficiënten,
 *        toestand, één sample-stap en de amplituderespons voor tests.
 * @details
 * Alle EQ's (Program EQ, Console EQ, Para EQ) rekenen met dezelfde filters,
 * zodat "een shelf van 6 dB" overal hetzelfde betekent. Transposed direct
 * form II. Header-only, zonder heap.
 */
#include <cmath>

namespace mmb_dsp {

struct BiquadCoef { float b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0; };
struct BiquadState { float z1 = 0, z2 = 0; };

inline float biquadTick(const BiquadCoef& k, BiquadState& s, float x) {
    const float y = k.b0 * x + s.z1;
    s.z1 = k.b1 * x - k.a1 * y + s.z2;
    s.z2 = k.b2 * x - k.a2 * y;
    return y;
}

/** |H| in dB op `hz` — voor tests en curve-plots, niet voor de audioloop. */
inline float biquadResponseDb(const BiquadCoef& k, float hz, float sr) {
    const float w = 2.0f * 3.14159265f * hz / sr;
    const float cr = std::cos(w), ci = -std::sin(w), c2r = std::cos(2 * w), c2i = -std::sin(2 * w);
    const float nr = k.b0 + k.b1 * cr + k.b2 * c2r, ni = k.b1 * ci + k.b2 * c2i;
    const float dr = 1.0f + k.a1 * cr + k.a2 * c2r, di = k.a1 * ci + k.a2 * c2i;
    return 10.0f * std::log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

namespace rbj {

inline BiquadCoef norm(float b0, float b1, float b2, float a0, float a1, float a2) {
    BiquadCoef k;
    k.b0 = b0 / a0; k.b1 = b1 / a0; k.b2 = b2 / a0; k.a1 = a1 / a0; k.a2 = a2 / a0;
    return k;
}
/** Hoekfrequentie, weggehouden van Nyquist. */
inline float w0(float f, float sr) {
    const float fmax = 0.45f * sr;
    return 2.0f * 3.14159265f * (f < fmax ? f : fmax) / sr;
}
/** Shelf-alpha uit de slope S (1 = steilst zonder bult; > 1 geeft een bult). */
inline float shelfAlpha(float A, float w, float S) {
    const float sn = std::sin(w);
    return 0.5f * sn * std::sqrt((A + 1.0f / A) * (1.0f / S - 1.0f) + 2.0f);
}

inline BiquadCoef lowShelf(float f, float db, float S, float sr) {
    const float A = std::pow(10.0f, db / 40.0f), w = w0(f, sr), cs = std::cos(w);
    const float al = shelfAlpha(A, w, S), sa = 2 * std::sqrt(A) * al;
    return norm(A * ((A + 1) - (A - 1) * cs + sa), 2 * A * ((A - 1) - (A + 1) * cs),
                A * ((A + 1) - (A - 1) * cs - sa),
                (A + 1) + (A - 1) * cs + sa, -2 * ((A - 1) + (A + 1) * cs), (A + 1) + (A - 1) * cs - sa);
}
inline BiquadCoef highShelf(float f, float db, float S, float sr) {
    const float A = std::pow(10.0f, db / 40.0f), w = w0(f, sr), cs = std::cos(w);
    const float al = shelfAlpha(A, w, S), sa = 2 * std::sqrt(A) * al;
    return norm(A * ((A + 1) + (A - 1) * cs + sa), -2 * A * ((A - 1) + (A + 1) * cs),
                A * ((A + 1) + (A - 1) * cs - sa),
                (A + 1) - (A - 1) * cs + sa, 2 * ((A - 1) - (A + 1) * cs), (A + 1) - (A - 1) * cs - sa);
}
inline BiquadCoef peak(float f, float db, float q, float sr) {
    const float A = std::pow(10.0f, db / 40.0f), w = w0(f, sr), cs = std::cos(w), al = std::sin(w) / (2 * q);
    return norm(1 + al * A, -2 * cs, 1 - al * A, 1 + al / A, -2 * cs, 1 - al / A);
}
inline BiquadCoef highPass(float f, float q, float sr) {
    const float w = w0(f, sr), cs = std::cos(w), al = std::sin(w) / (2 * q);
    return norm((1 + cs) / 2, -(1 + cs), (1 + cs) / 2, 1 + al, -2 * cs, 1 - al);
}
inline BiquadCoef lowPass(float f, float q, float sr) {
    const float w = w0(f, sr), cs = std::cos(w), al = std::sin(w) / (2 * q);
    return norm((1 - cs) / 2, 1 - cs, (1 - cs) / 2, 1 + al, -2 * cs, 1 - al);
}
/** Eerste-orde hoogdoorlaat als biquad (b2 = a2 = 0). */
inline BiquadCoef highPass1(float f, float sr) {
    const float k = std::tan(0.5f * w0(f, sr));
    return norm(1, -1, 0, 1 + k, k - 1, 0);
}
inline BiquadCoef flat() { return BiquadCoef{}; }

}  // namespace rbj
}  // namespace mmb_dsp
