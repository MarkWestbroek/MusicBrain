// tp_mmb_noise — wit/roze/bruin (spiegel van NoiseModule.h). De DSP is
// mmb_dsp::Noise, dezelfde kernel en dezelfde seed als de firmware. Native
// 44,1 kHz, blok 32.
#include "mmb_abi.h"
#include "mmb_dsp/noise.h"

const char* const MMB_TYPE_ID     = "tp_mmb_noise";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[1] = {};
const int MMB_NUM_INPUTS = 0;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_COLOR, C_LEVEL };
MmbControl MMB_CONTROLS[] = { { "color", 0.0f }, { "level", 0.6f } };
const int MMB_NUM_CONTROLS = 2;

namespace { mmb_dsp::Noise g_k; }

void mmb_setup() { g_k.Init(); }

void mmb_on_control(int idx, float v) {
    if (idx == C_COLOR) g_k.color(static_cast<int>(v));
    else if (idx == C_LEVEL) g_k.level(v);
}

void mmb_process(int frames) {
    for (int k = 0; k < frames; ++k) MMB_OUTPUTS[0].buf[k] = g_k.Tick();
}
