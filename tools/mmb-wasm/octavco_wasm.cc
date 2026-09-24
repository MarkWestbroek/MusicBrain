// tp_mmb_octa_vco — acht oscillatoren met één gedeelde control-set (spiegel
// van OctaVcoModule.h). Native 44,1 kHz, blok 32. De oscillator is
// `AudioSynthWaveform`, overgeschreven in teensy_waveform.h.
#include <cmath>

#include "mmb_abi.h"
#include "teensy_waveform.h"

const char* const MMB_TYPE_ID     = "tp_mmb_octa_vco";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

constexpr int kCells = 8;

MmbPort MMB_INPUTS[] = {
    { "voct_1", MMB_CV, 0, {} }, { "voct_2", MMB_CV, 0, {} }, { "voct_3", MMB_CV, 0, {} }, { "voct_4", MMB_CV, 0, {} },
    { "voct_5", MMB_CV, 0, {} }, { "voct_6", MMB_CV, 0, {} }, { "voct_7", MMB_CV, 0, {} }, { "voct_8", MMB_CV, 0, {} },
    { "tune", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 9;
constexpr int IN_TUNE = 8;
MmbPort MMB_OUTPUTS[] = {
    { "out_1", MMB_AUDIO, 0, {} }, { "out_2", MMB_AUDIO, 0, {} }, { "out_3", MMB_AUDIO, 0, {} }, { "out_4", MMB_AUDIO, 0, {} },
    { "out_5", MMB_AUDIO, 0, {} }, { "out_6", MMB_AUDIO, 0, {} }, { "out_7", MMB_AUDIO, 0, {} }, { "out_8", MMB_AUDIO, 0, {} },
};
const int MMB_NUM_OUTPUTS = 8;

// Beginstanden van de firmware (constructor): zaagtand, amplitude 0,8.
enum { C_WAVE, C_COARSE, C_FINE, C_DETUNE, C_LEVEL };
MmbControl MMB_CONTROLS[] = {
    { "wave", 2.0f }, { "coarse", 0.0f }, { "fine", 0.0f }, { "detune", 0.0f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 5;

namespace {
TeensyWaveform g_osc[kCells];
float g_voct[kCells] = {}, g_tune = 0.0f, g_coarse = 0.0f, g_fine = 0.0f, g_detune = 0.0f;
float g_last[MMB_NUM_INPUTS];

/** OctaVcoModule::detuneOffsetCents — cel 1 laagst, cel 8 hoogst. */
float detuneOffsetCents(int i) { return ((static_cast<float>(i) / (kCells - 1)) - 0.5f) * g_detune; }

void recomputeHz(int i) {
    const float cents = g_fine + detuneOffsetCents(i);
    g_osc[i].frequency(261.6256f * powf(2.0f, g_voct[i] + g_tune + g_coarse / 12.0f + cents / 1200.0f));
}
void recomputeAll() { for (int i = 0; i < kCells; ++i) recomputeHz(i); }
}  // namespace

void mmb_setup() {
    for (int i = 0; i < kCells; ++i) { g_osc[i].begin(TW_SAWTOOTH); g_osc[i].amplitude(0.8f); recomputeHz(i); }
    for (float& v : g_last) v = -1e9f;
}

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_WAVE: {
            static const short kWaves[] = { TW_SINE, TW_TRIANGLE, TW_SAWTOOTH, TW_SQUARE };
            const int w = static_cast<int>(v);
            if (w >= 0 && w < 4) for (TeensyWaveform& o : g_osc) o.begin(kWaves[w]);
            break;
        }
        case C_COARSE: g_coarse = v; recomputeAll(); break;
        case C_FINE:   g_fine = v; recomputeAll(); break;
        case C_DETUNE: g_detune = v; recomputeAll(); break;
        case C_LEVEL:  for (TeensyWaveform& o : g_osc) o.amplitude(v); break;
    }
}

void mmb_process(int frames) {
    // CV-brug: alleen bij een nieuwe waarde, zoals de CvGraph.
    for (int i = 0; i < MMB_NUM_INPUTS; ++i) {
        if (!mmb_connected(i)) { g_last[i] = -1e9f; continue; }
        const float v = mmb_in0(i);
        if (v == g_last[i]) continue;
        g_last[i] = v;
        if (i == IN_TUNE) { g_tune = v; recomputeAll(); }
        else { g_voct[i] = v; recomputeHz(i); }
    }
    for (int c = 0; c < kCells; ++c)
        for (int k = 0; k < frames; ++k)
            MMB_OUTPUTS[c].buf[k] = g_osc[c].next() * (1.0f / 32768.0f);
}
