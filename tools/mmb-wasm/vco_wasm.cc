// tp_mmb_vco — de gewone VCO (spiegel van VcoModule.h). Native 44,1 kHz,
// blok 32. De oscillator is `AudioSynthWaveform` (teensy_waveform.h).
//
// Twee eigenaardigheden van de firmware doen we na, want pariteit:
//  * `coarse` en `fine` worden opgeslagen maar pas verrekend bij de volgende
//    schrijf op `voct` of `tune` — aan Coarse draaien tijdens een noot doet
//    niets tot de volgende noot.
//  * `fm`, `sync` en `fm_amt` doen niets ("not yet implemented").
#include <cmath>

#include "mmb_abi.h"
#include "teensy_waveform.h"

const char* const MMB_TYPE_ID     = "tp_mmb_vco";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_VOCT, IN_TUNE, IN_FM, IN_SYNC };
MmbPort MMB_INPUTS[] = {
    { "voct", MMB_CV, 0, {} }, { "tune", MMB_CV, 0, {} },
    { "fm", MMB_CV, 0, {} }, { "sync", MMB_GATE, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_WAVE, C_COARSE, C_FINE, C_FM_AMT, C_LEVEL };
MmbControl MMB_CONTROLS[] = {
    { "wave", 2.0f }, { "coarse", 0.0f }, { "fine", 0.0f }, { "fm_amt", 0.0f }, { "level", 0.9f },
};
const int MMB_NUM_CONTROLS = 5;

namespace {
TeensyWaveform g_osc;
float g_voct = 0.0f, g_tune = 0.0f, g_coarse = 0.0f, g_fine = 0.0f;
float g_last[2] = { -1e9f, -1e9f };

void recomputeHz() {
    g_osc.frequency(261.6256f * powf(2.0f, g_voct + g_tune + g_coarse / 12.0f + g_fine / 1200.0f));
}
}  // namespace

void mmb_setup() {
    g_osc.begin(TW_SAWTOOTH);
    g_osc.amplitude(0.9f);
    g_osc.frequency(261.626f);
}

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_WAVE: {
            static const short kWaves[] = { TW_SINE, TW_TRIANGLE, TW_SAWTOOTH, TW_SQUARE };
            const int w = static_cast<int>(v);
            if (w >= 0 && w < 4) g_osc.begin(kWaves[w]);
            break;
        }
        case C_COARSE: g_coarse = v; break;     // pas bij de volgende voct/tune
        case C_FINE:   g_fine = v; break;
        case C_LEVEL:  g_osc.amplitude(v); break;
        default: break;                          // fm_amt: firmware doet er niets mee
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
