// tp_mmb_wt_vco — wavetable-oscillator met zes additieve banken (spiegel van
// WtVcoModule.h). Native 44,1 kHz, blok 32. De oscillator is
// `AudioSynthWaveform` in arbitrary-modus (teensy_waveform.h); de banken
// worden gevuld met dezelfde `fillBank()` als de firmware.
#include <cmath>

#include "mmb_abi.h"
#include "teensy_waveform.h"

const char* const MMB_TYPE_ID     = "tp_mmb_wt_vco";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_VOCT, IN_TUNE };
MmbPort MMB_INPUTS[] = { { "voct", MMB_CV, 0, {} }, { "tune", MMB_CV, 0, {} } };
const int MMB_NUM_INPUTS = 2;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_BANK, C_COARSE, C_FINE, C_LEVEL };
MmbControl MMB_CONTROLS[] = { { "bank", 0.0f }, { "coarse", 0.0f }, { "fine", 0.0f }, { "level", 0.8f } };
const int MMB_NUM_CONTROLS = 4;

namespace {
constexpr int kTableLen = 256, kBanks = 6;
constexpr float kPi = 3.14159265358979323846f;   // M_PI zoals de firmware hem als float gebruikt
TeensyWaveform g_osc;
int16_t g_table[kTableLen];
int   g_bank = 0;
float g_voct = 0.0f, g_tune = 0.0f, g_coarse = 0.0f, g_fine = 0.0f;
float g_last[2] = { -1e9f, -1e9f };

void recomputeHz() {
    g_osc.frequency(261.6256f * powf(2.0f, g_voct + g_tune + g_coarse / 12.0f + g_fine / 1200.0f));
}

/** WtVcoModule::fillBank, letterlijk. */
void fillBank(int bank) {
    float acc[kTableLen] = { 0.0f };
    const int maxH = 48;
    for (int n = 1; n <= maxH; ++n) {
        float amp = 0.0f;
        switch (bank) {
            case 0: amp = 1.0f / n; break;
            case 1: amp = (n % 2) ? 1.0f / n : 0.0f; break;
            case 2: amp = (n % 2) ? (((n / 2) % 2 ? -1.0f : 1.0f) / (n * n)) : 0.0f; break;
            case 3: { int p = 1; bool oct = false;
                      for (; p <= n; p <<= 1) if (p == n) { oct = true; break; }
                      amp = oct ? 1.0f / n : 0.0f; break; }
            case 4: amp = (2.0f / (n * kPi)) * sinf(n * kPi * 0.25f); break;
            case 5: { const float f = n / 6.0f;
                      amp = (1.0f / n) * expf(-(f - 1.0f) * (f - 1.0f) * 2.0f); break; }
            default: amp = 1.0f / n; break;
        }
        if (amp == 0.0f) continue;
        for (int i = 0; i < kTableLen; ++i) {
            const float ph = (2.0f * kPi * n * i) / kTableLen;
            acc[i] += amp * sinf(ph);
        }
    }
    float peak = 1e-6f;
    for (int i = 0; i < kTableLen; ++i) { const float a = fabsf(acc[i]); if (a > peak) peak = a; }
    const float scale = 32767.0f / peak;
    for (int i = 0; i < kTableLen; ++i) g_table[i] = static_cast<int16_t>(acc[i] * scale);
}
}  // namespace

void mmb_setup() {
    fillBank(g_bank);
    g_osc.arbitraryWaveform(g_table);
    g_osc.begin(TW_ARBITRARY);
    g_osc.amplitude(0.8f);
    recomputeHz();
}

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_BANK: {
            int b = static_cast<int>(v);
            if (b < 0) b = 0;
            if (b >= kBanks) b = kBanks - 1;
            if (b != g_bank) { g_bank = b; fillBank(g_bank); }
            break;
        }
        case C_COARSE: g_coarse = v; recomputeHz(); break;
        case C_FINE:   g_fine = v; recomputeHz(); break;
        case C_LEVEL:  g_osc.amplitude(v); break;
    }
}

void mmb_process(int frames) {
    for (int i = IN_VOCT; i <= IN_TUNE; ++i) {
        if (!mmb_connected(i)) { g_last[i] = -1e9f; continue; }
        const float v = mmb_in0(i);
        if (v == g_last[i]) continue;
        g_last[i] = v;
        if (i == IN_VOCT) g_voct = v; else g_tune = v;
        recomputeHz();
    }
    for (int k = 0; k < frames; ++k) MMB_OUTPUTS[0].buf[k] = g_osc.next() * (1.0f / 32768.0f);
}
