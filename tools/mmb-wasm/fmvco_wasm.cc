// tp_mmb_fm_vco — VCO met een audio-FM-ingang (spiegel van FmVcoModule.h).
// Native 44,1 kHz, blok 32. De oscillator is `AudioSynthWaveformModulated`
// (teensy_waveform.h): de fase loopt per sample 2^(fm × fm_amt) sneller.
// Zonder kabel op `fm` krijgt de oscillator op de Teensy geen blok op zijn
// modulatie-ingang, en dat is een ander pad dan een blok met nullen.
#include <cmath>

#include "mmb_abi.h"
#include "teensy_waveform.h"

const char* const MMB_TYPE_ID     = "tp_mmb_fm_vco";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_VOCT, IN_TUNE, IN_FM };
MmbPort MMB_INPUTS[] = {
    { "voct", MMB_CV, 0, {} }, { "tune", MMB_CV, 0, {} }, { "fm", MMB_AUDIO, 0, {} },
};
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_WAVE, C_COARSE, C_FINE, C_FM_AMT, C_LEVEL };
MmbControl MMB_CONTROLS[] = {
    { "wave", 0.0f }, { "coarse", 0.0f }, { "fine", 0.0f }, { "fm_amt", 1.0f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 5;

namespace {
TeensyWaveformModulated g_osc;
float g_voct = 0.0f, g_tune = 0.0f, g_coarse = 0.0f, g_fine = 0.0f;
float g_last[2] = { -1e9f, -1e9f };

void recomputeHz() {
    g_osc.frequency(261.6256f * powf(2.0f, g_voct + g_tune + g_coarse / 12.0f + g_fine / 1200.0f));
}
int16_t toInt16(float x) {
    const float s = x * 32768.0f;
    return static_cast<int16_t>(s > 32767.0f ? 32767.0f : (s < -32768.0f ? -32768.0f : s));
}
}  // namespace

void mmb_setup() {
    g_osc.begin(TW_SINE);
    g_osc.amplitude(0.8f);
    g_osc.frequencyModulation(1.0f);
    recomputeHz();
}

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_WAVE: {
            static const short kWaves[] = { TW_SINE, TW_TRIANGLE, TW_SAWTOOTH, TW_SQUARE };
            const int w = static_cast<int>(v);
            if (w >= 0 && w < 4) g_osc.begin(kWaves[w]);
            break;
        }
        case C_COARSE: g_coarse = v; recomputeHz(); break;
        case C_FINE:   g_fine = v; recomputeHz(); break;
        case C_FM_AMT: g_osc.frequencyModulation(v); break;
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
    const bool fm = mmb_connected(IN_FM);
    for (int k = 0; k < frames; ++k)
        MMB_OUTPUTS[0].buf[k] = g_osc.nextFm(fm, fm ? toInt16(MMB_INPUTS[IN_FM].buf[k]) : 0) * (1.0f / 32768.0f);
}
