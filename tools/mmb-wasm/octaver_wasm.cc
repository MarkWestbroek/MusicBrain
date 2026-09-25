// tp_mmb_octaver — analoge octaver, OC-2-stijl (spiegel van OctaverModule.h;
// de DSP is mmb_dsp::Octaver, dezelfde header als de firmware). Native
// 44,1 kHz, blok 32. Een kabel op oct1/oct2/up vervangt de knop.
#include "mmb_abi.h"
#include "mmb_dsp/octaver.h"

const char* const MMB_TYPE_ID     = "tp_mmb_octaver";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_AUDIO, IN_OCT1, IN_OCT2, IN_UP };
MmbPort MMB_INPUTS[] = {
    { "in", MMB_AUDIO, 0, {} },
    { "oct1_cv", MMB_CV, 0, {} }, { "oct2_cv", MMB_CV, 0, {} }, { "up_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_DRY, C_OCT1, C_OCT2, C_UP, C_TONE };
MmbControl MMB_CONTROLS[] = {
    { "dry", 1.0f }, { "oct1", 0.7f }, { "oct2", 0.0f }, { "up", 0.0f }, { "tone", 0.5f },
};
const int MMB_NUM_CONTROLS = 5;

namespace {
mmb_dsp::Octaver g_oct;
float g_knobOct1 = 0.7f, g_knobOct2 = 0.0f, g_knobUp = 0.0f;
}

void mmb_setup() { g_oct.Init(MMB_NATIVE_RATE); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_DRY:  g_oct.set_dry(v); break;
        case C_OCT1: g_knobOct1 = v; g_oct.set_oct1(v); break;
        case C_OCT2: g_knobOct2 = v; g_oct.set_oct2(v); break;
        case C_UP:   g_knobUp = v;   g_oct.set_up(v); break;
        case C_TONE: g_oct.set_tone(v); break;
    }
}

void mmb_process(int frames) {
    g_oct.set_oct1(mmb_connected(IN_OCT1) ? mmb_in0(IN_OCT1) : g_knobOct1);
    g_oct.set_oct2(mmb_connected(IN_OCT2) ? mmb_in0(IN_OCT2) : g_knobOct2);
    g_oct.set_up(mmb_connected(IN_UP) ? mmb_in0(IN_UP) : g_knobUp);
    for (int k = 0; k < frames; ++k) {
        float y = g_oct.Process(MMB_INPUTS[IN_AUDIO].buf[k]);
        if (y > 1.f) y = 1.f; else if (y < -1.f) y = -1.f;
        MMB_OUTPUTS[0].buf[k] = y;
    }
}
