// tp_mmb_octa_vca — acht VCA-cellen met één gedeelde Level (spiegel van
// OctaVcaModule.h). Er zit geen gevendorde DSP in: in de firmware is het
// `AudioEffectMultiply` met per cel een `AudioSynthWaveformDc` als geslewde
// gain, en dat is een vermenigvuldiging met een lineaire ramp. Precies dat
// staat hier. Native 44,1 kHz, blok 32.
#include "mmb_abi.h"

const char* const MMB_TYPE_ID     = "tp_mmb_octa_vca";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

constexpr int kCells = 8;

// Poorten: in_1..8, cv_1..8, uit: out_1..8 — zoals de catalogus.
MmbPort MMB_INPUTS[] = {
    { "in_1", MMB_AUDIO, 0, {} }, { "in_2", MMB_AUDIO, 0, {} }, { "in_3", MMB_AUDIO, 0, {} }, { "in_4", MMB_AUDIO, 0, {} },
    { "in_5", MMB_AUDIO, 0, {} }, { "in_6", MMB_AUDIO, 0, {} }, { "in_7", MMB_AUDIO, 0, {} }, { "in_8", MMB_AUDIO, 0, {} },
    { "cv_1", MMB_CV, 0, {} }, { "cv_2", MMB_CV, 0, {} }, { "cv_3", MMB_CV, 0, {} }, { "cv_4", MMB_CV, 0, {} },
    { "cv_5", MMB_CV, 0, {} }, { "cv_6", MMB_CV, 0, {} }, { "cv_7", MMB_CV, 0, {} }, { "cv_8", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 16;
MmbPort MMB_OUTPUTS[] = {
    { "out_1", MMB_AUDIO, 0, {} }, { "out_2", MMB_AUDIO, 0, {} }, { "out_3", MMB_AUDIO, 0, {} }, { "out_4", MMB_AUDIO, 0, {} },
    { "out_5", MMB_AUDIO, 0, {} }, { "out_6", MMB_AUDIO, 0, {} }, { "out_7", MMB_AUDIO, 0, {} }, { "out_8", MMB_AUDIO, 0, {} },
};
const int MMB_NUM_OUTPUTS = 8;

enum { C_LEVEL };
MmbControl MMB_CONTROLS[] = { { "level", 1.0f } };
const int MMB_NUM_CONTROLS = 1;

namespace {
/** `AudioSynthWaveformDc::amplitude(v, ms)`: lineair naar het doel in `ms`. */
constexpr float kCvSlewMs = 2.0f;
float g_level = 1.0f;
float g_gain[kCells]   = {};   // huidige, geslewde gain per cel
float g_target[kCells] = {};
float g_step[kCells]   = {};
int   g_left[kCells]   = {};   // resterende samples van de ramp

void retarget(int c, float target) {
    if (target == g_target[c]) return;
    g_target[c] = target;
    const int n = static_cast<int>(kCvSlewMs * 0.001f * MMB_NATIVE_RATE);
    g_left[c] = n > 0 ? n : 1;
    g_step[c] = (target - g_gain[c]) / static_cast<float>(g_left[c]);
}
}  // namespace

void mmb_setup() {}

void mmb_on_control(int idx, float v) {
    if (idx == C_LEVEL) g_level = v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v);
}

void mmb_process(int frames) {
    for (int c = 0; c < kCells; ++c) {
        // Zonder kabel op cv_N krijgt de cel nooit een CV-waarde en blijft hij
        // dicht — net als op de Teensy, waar de DC-proxy op 0 begint.
        const float cv = mmb_connected(kCells + c) ? mmb_in0(kCells + c) : 0.0f;
        retarget(c, cv * g_level);
        const float* in = MMB_INPUTS[c].buf;
        float* out = MMB_OUTPUTS[c].buf;
        for (int k = 0; k < frames; ++k) {
            if (g_left[c] > 0) { g_gain[c] += g_step[c]; if (--g_left[c] == 0) g_gain[c] = g_target[c]; }
            out[k] = in[k] * g_gain[c];
        }
    }
}
