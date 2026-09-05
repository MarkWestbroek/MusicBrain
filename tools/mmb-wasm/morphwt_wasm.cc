// tp_mmb_morph_wt — Morphing-wavetable-VCO (spiegel van MorphWtModule.h v2:
// 8 frames per bank, 3 mip-levels). Native 44,1 kHz zoals de firmware.
#include "mmb_abi.h"
#include <cmath>

const char* const MMB_TYPE_ID     = "tp_mmb_morph_wt";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_VOCT, IN_MORPH };
MmbPort MMB_INPUTS[] = { { "voct", MMB_CV, 0, {} }, { "morph_cv", MMB_CV, 0, {} } };
const int MMB_NUM_INPUTS = 2;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_BANK, C_MORPH, C_COARSE, C_FINE, C_LEVEL, C_WSLOT };
MmbControl MMB_CONTROLS[] = {
    { "bank", 0.f }, { "morph", 0.f }, { "coarse", 0.f }, { "fine", 0.f }, { "level", 0.8f }, { "wslot", 0.f },
};
const int MMB_NUM_CONTROLS = 6;

namespace {
constexpr int kFrames = 8, kSamples = 256, kBanks = 5, kMips = 3;
int16_t g_tables[kMips][kBanks][kFrames][kSamples];
float g_phase = 0.f, g_phaseInc = 0.f;
float g_voct = 0.f, g_coarse = 0.f, g_fine = 0.f, g_morph = 0.f, g_morphCv = 0.f, g_level = 0.8f;
int   g_bank = 0;

float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
void recomputeHz() {
    const float hz = 261.6256f * std::pow(2.0f, g_voct + g_coarse / 12.0f + g_fine / 1200.0f);
    g_phaseInc = hz / MMB_NATIVE_RATE;
}

float g_work[kSamples];
void add(int h, float amp, float phase = 0.f) {
    for (int i = 0; i < kSamples; ++i)
        g_work[i] += amp * std::sin(6.2831853f * (h * i / float(kSamples)) + phase);
}
void store(int mip, int bank, int fr) {
    float mx = 0.f;
    for (int i = 0; i < kSamples; ++i) { const float a = g_work[i] < 0 ? -g_work[i] : g_work[i]; if (a > mx) mx = a; }
    const float g = mx > 0.0001f ? 0.95f / mx : 0.f;
    for (int i = 0; i < kSamples; ++i) g_tables[mip][bank][fr][i] = static_cast<int16_t>(g_work[i] * g * 32767.0f);
}
void clearWork() { for (int i = 0; i < kSamples; ++i) g_work[i] = 0.f; }

void buildBanks() {
    static constexpr int kMaxH[kMips] = { 24, 8, 2 };
    for (int mip = 0; mip < kMips; ++mip) {
        const int maxH = kMaxH[mip];
        // Bank 0 — Analog: sin → tri → saw → sqr/puls.
        for (int fr = 0; fr < kFrames; ++fr) {
            clearWork();
            const float t = fr / 7.0f;
            for (int h = 1; h <= maxH; ++h) {
                const bool odd = h & 1;
                float amp = 0.f;
                if (t < 0.33f) {
                    const float u = t / 0.33f;
                    if (h == 1) amp = 1.f;
                    else if (odd) amp = u / float(h * h) * ((h / 2) % 2 ? -1.f : 1.f);
                } else if (t < 0.66f) {
                    const float u = (t - 0.33f) / 0.33f;
                    const float tri = odd ? 1.f / float(h * h) : 0.f;
                    const float saw = 1.f / float(h);
                    amp = tri + (saw - tri) * u;
                } else {
                    const float u = (t - 0.66f) / 0.34f;
                    const float saw = 1.f / float(h);
                    const float sqr = odd ? 1.f / float(h) : 0.f;
                    amp = saw + (sqr - saw) * u;
                }
                if (amp != 0.f) add(h, amp);
            }
            store(mip, 0, fr);
        }
        // Bank 1 — Vocal.
        for (int fr = 0; fr < kFrames; ++fr) {
            clearWork();
            const float f1 = 2.f + fr * 0.9f, f2 = 6.f + fr * 2.f;
            for (int h = 1; h <= maxH; ++h) {
                const float d1 = (h - f1) / 1.2f, d2 = (h - f2) / 2.f;
                add(h, std::exp(-d1 * d1) + 0.6f * std::exp(-d2 * d2) + 0.15f / float(h));
            }
            store(mip, 1, fr);
        }
        // Bank 2 — Harmonics (drawbars).
        for (int fr = 0; fr < kFrames; ++fr) {
            clearWork();
            static constexpr int kBars[] = { 1, 2, 3, 4, 6, 8, 10, 12 };
            for (int k = 0; k <= fr; ++k) if (kBars[k] <= maxH) add(kBars[k], 1.f / (k + 1));
            store(mip, 2, fr);
        }
        // Bank 3 — Digital.
        for (int fr = 0; fr < kFrames; ++fr) {
            clearWork();
            for (int h = 1; h <= maxH; ++h) {
                if (((h * (fr + 2)) % (fr + 3)) == 0) continue;
                add(h, 1.f / float(1 + ((h * 7) % (fr + 2))), (h % 3) * 2.f);
            }
            store(mip, 3, fr);
        }
        // Bank 4 — USER: sinus.
        for (int fr = 0; fr < kFrames; ++fr) { clearWork(); add(1, 1.f); store(mip, 4, fr); }
    }
}
}

void mmb_setup() { buildBanks(); recomputeHz(); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_BANK:   { int b = static_cast<int>(v); if (b < 0) b = 0; if (b >= kBanks) b = kBanks - 1; g_bank = b; break; }
        case C_MORPH:  g_morph = clampf(v, 0.f, 7.f); break;
        case C_COARSE: g_coarse = v; recomputeHz(); break;
        case C_FINE:   g_fine = v; recomputeHz(); break;
        case C_LEVEL:  g_level = clampf(v, 0.f, 1.f); break;
        case C_WSLOT:  break;
    }
}

void mmb_process(int frames) {
    const float voct = mmb_in0(IN_VOCT);
    if (voct != g_voct) { g_voct = voct; recomputeHz(); }
    g_morphCv = mmb_connected(IN_MORPH) ? clampf(mmb_in0(IN_MORPH), -1.f, 1.f) * 7.f : 0.f;

    const float allowed = g_phaseInc > 0.f ? 0.5f / g_phaseInc : 24.f;
    const int mip = allowed >= 24.f ? 0 : (allowed >= 8.f ? 1 : 2);
    const float m = clampf(g_morph + g_morphCv, 0.f, 6.999f);
    const int f0 = static_cast<int>(m);
    const float fMix = m - static_cast<float>(f0);
    const int16_t* a = g_tables[mip][g_bank][f0];
    const int16_t* b = g_tables[mip][g_bank][f0 + 1];
    constexpr float kInv = 1.f / 32768.f;
    for (int i = 0; i < frames; ++i) {
        const float pos = g_phase * kSamples;
        const int i0 = static_cast<int>(pos) & (kSamples - 1);
        const int i1 = (i0 + 1) & (kSamples - 1);
        const float sf = pos - std::floor(pos);
        const float sa = a[i0] + (a[i1] - a[i0]) * sf;
        const float sb = b[i0] + (b[i1] - b[i0]) * sf;
        float y = (sa + (sb - sa) * fMix) * kInv * g_level;
        if (y > 1.f) y = 1.f; else if (y < -1.f) y = -1.f;
        MMB_OUTPUTS[0].buf[i] = y;
        g_phase += g_phaseInc;
        if (g_phase >= 1.f) g_phase -= 1.f;
    }
}
