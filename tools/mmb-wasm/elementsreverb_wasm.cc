// tp_mmb_elements_reverb — de stereo-Dattorro-galm uit Mutable Instruments
// Elements (spiegel van ElementsReverbModule.h; de DSP is `elements::Reverb`
// uit de gevendorde mi-elements, dezelfde bron als de firmware). Native
// 44,1 kHz, blok 32 — de gevendorde versie heeft zijn LFO's al van 32 kHz
// naar 44,1 kHz herschaald, dus dit is de rate waarop hij hoort te lopen.
#include <cstring>

#include "mmb_abi.h"
#include "elements/dsp/fx/reverb.h"

const char* const MMB_TYPE_ID     = "tp_mmb_elements_reverb";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_L, IN_R };
MmbPort MMB_INPUTS[] = { { "in_l", MMB_AUDIO, 0, {} }, { "in_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_INPUTS = 2;
enum { OUT_L, OUT_R };
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

// Defaults gelijk aan de moduledefinitie in seedModules.ts.
enum { C_AMOUNT, C_TIME, C_DIFFUSION, C_LP };
MmbControl MMB_CONTROLS[] = {
    { "amount", 0.5f }, { "time", 0.5f }, { "diffusion", 0.625f }, { "lp", 0.7f },
};
const int MMB_NUM_CONTROLS = 4;

namespace {
// Platte globals (geen constructor-machinerie in deze -nostartfiles-build).
// Zelfde buffergrootte als de firmware: 32768 × uint16 = 64 KB.
uint16_t g_buf[32768];
elements::Reverb g_reverb;
float g_l[MMB_MAX_BLOCK], g_r[MMB_MAX_BLOCK];
}  // namespace

void mmb_setup() {
    std::memset(g_buf, 0, sizeof(g_buf));
    g_reverb.Init(g_buf);
}

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_AMOUNT:    g_reverb.set_amount(v); break;
        case C_TIME:      g_reverb.set_time(v); break;
        case C_DIFFUSION: g_reverb.set_diffusion(v); break;
        case C_LP:        g_reverb.set_lp(v); break;
    }
}

void mmb_process(int frames) {
    for (int k = 0; k < frames; ++k) {
        g_l[k] = MMB_INPUTS[IN_L].buf[k];
        g_r[k] = MMB_INPUTS[IN_R].buf[k];
    }
    g_reverb.Process(g_l, g_r, static_cast<size_t>(frames));
    for (int k = 0; k < frames; ++k) {
        float l = g_l[k], r = g_r[k];
        if (l > 1.0f) l = 1.0f; else if (l < -1.0f) l = -1.0f;
        if (r > 1.0f) r = 1.0f; else if (r < -1.0f) r = -1.0f;
        MMB_OUTPUTS[OUT_L].buf[k] = l;
        MMB_OUTPUTS[OUT_R].buf[k] = r;
    }
}
