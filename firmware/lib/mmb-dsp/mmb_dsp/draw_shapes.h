#pragma once
// Vaste vormen voor DRAW-VCO (Vorm-schakelaar): één single-cycle tabel per
// stand, dezelfde in de firmware (DrawVcoModule.h) en de wasm
// (drawvco_wasm.cc). Stand 0 is "Getekend": de tabel die de editor stuurt
// (tot er iets getekend is een driehoek).
//
// De vormen zijn zo gekozen dat ze op het oor verschillen en niet harder
// klinken dan de driehoek: piek ±1 (int16 volle schaal), behalve het orgel,
// dat genormaliseerd wordt op zijn eigen piek.
#include <cmath>
#include <cstdint>

namespace mmb_dsp {

enum DrawShape { kDrawDrawn = 0, kDrawSine, kDrawTriangle, kDrawSaw, kDrawSquare, kDrawPulse, kDrawOrgan, kDrawShapeCount };

/** Vult @p table (@p len punten) met vaste vorm @p shape (1 … kDrawShapeCount-1). */
inline void fillDrawShape(int shape, int16_t* table, int len) {
    constexpr float kTwoPi = 6.2831853f;
    float peak = 1.0f;
    if (shape == kDrawOrgan) {   // drawbars 8' 4' 2⅔' 2' (888 8000 0-achtig): grondtoon + 2, 3, 4
        peak = 0.0f;
        for (int i = 0; i < len; ++i) {
            const float x = kTwoPi * static_cast<float>(i) / static_cast<float>(len);
            const float v = std::sin(x) + 0.8f * std::sin(2 * x) + 0.6f * std::sin(3 * x) + 0.5f * std::sin(4 * x);
            peak = std::fabs(v) > peak ? std::fabs(v) : peak;
        }
    }
    for (int i = 0; i < len; ++i) {
        const float ph = static_cast<float>(i) / static_cast<float>(len);
        const float x = kTwoPi * ph;
        float v = 0.0f;
        switch (shape) {
            case kDrawSine:     v = std::sin(x); break;
            case kDrawTriangle: v = ph < 0.5f ? 4.0f * ph - 1.0f : 3.0f - 4.0f * ph; break;
            case kDrawSaw:      v = 1.0f - 2.0f * ph; break;
            case kDrawSquare:   v = ph < 0.5f ? 0.8f : -0.8f; break;   // iets zachter: blok klinkt luider
            case kDrawPulse:    v = ph < 0.25f ? 0.9f : -0.3f; break;   // 25 %, gemiddeld nul (geen DC)
            case kDrawOrgan:    v = (std::sin(x) + 0.8f * std::sin(2 * x) + 0.6f * std::sin(3 * x) + 0.5f * std::sin(4 * x)) / peak; break;
            default:            v = ph < 0.5f ? 4.0f * ph - 1.0f : 3.0f - 4.0f * ph; break;
        }
        table[i] = static_cast<int16_t>(v * 32767.0f);
    }
}

}  // namespace mmb_dsp
