// tp_mmb_harmonizer — pitch-shifter/harmonizer, mono in → stereo uit (spiegel
// van HarmonizerModule.h; de DSP is mmb_dsp::Harmonizer, dezelfde header als
// de firmware). Native 44,1 kHz, blok 32.
#include "mmb_abi.h"
#include "mmb_dsp/pitch_shift.h"

const char* const MMB_TYPE_ID     = "tp_mmb_harmonizer";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_AUDIO, IN_VOCT_A, IN_VOCT_B, IN_MIX };
MmbPort MMB_INPUTS[] = {
    { "in", MMB_AUDIO, 0, {} }, { "voct_a", MMB_CV, 0, {} }, { "voct_b", MMB_CV, 0, {} }, { "mix_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
enum { OUT_L, OUT_R };
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

enum { C_SEMI_A, C_CENT_A, C_LVL_A, C_SEMI_B, C_CENT_B, C_LVL_B, C_WINDOW, C_FEEDBACK, C_SPREAD, C_MIX };
MmbControl MMB_CONTROLS[] = {
    { "semi_a", 0.0f }, { "cent_a", 0.0f }, { "lvl_a", 1.0f }, { "semi_b", 7.0f }, { "cent_b", 0.0f }, { "lvl_b", 0.0f },
    { "window", 40.0f }, { "feedback", 0.0f }, { "spread", 0.5f }, { "mix", 0.5f },
};
const int MMB_NUM_CONTROLS = 10;

namespace {
mmb_dsp::Harmonizer g_h;
float g_knobMix = 0.5f;
}

void mmb_setup() { g_h.Init(MMB_NATIVE_RATE); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_SEMI_A: g_h.set_semitones(0, v); break;
        case C_CENT_A: g_h.set_cents(0, v); break;
        case C_LVL_A:  g_h.set_level(0, v); break;
        case C_SEMI_B: g_h.set_semitones(1, v); break;
        case C_CENT_B: g_h.set_cents(1, v); break;
        case C_LVL_B:  g_h.set_level(1, v); break;
        case C_WINDOW: g_h.set_window(v); break;
        case C_FEEDBACK: g_h.set_feedback(v); break;
        case C_SPREAD: g_h.set_spread(v); break;
        case C_MIX:    g_knobMix = v; g_h.set_mix(v); break;
    }
}

void mmb_process(int frames) {
    g_h.set_voct(0, mmb_connected(IN_VOCT_A) ? mmb_in0(IN_VOCT_A) : 0.f);
    g_h.set_voct(1, mmb_connected(IN_VOCT_B) ? mmb_in0(IN_VOCT_B) : 0.f);
    g_h.set_mix(mmb_connected(IN_MIX) ? mmb_in0(IN_MIX) : g_knobMix);
    for (int k = 0; k < frames; ++k) {
        float l, r;
        g_h.Process(MMB_INPUTS[IN_AUDIO].buf[k], &l, &r);
        MMB_OUTPUTS[OUT_L].buf[k] = l > 1.f ? 1.f : (l < -1.f ? -1.f : l);
        MMB_OUTPUTS[OUT_R].buf[k] = r > 1.f ? 1.f : (r < -1.f ? -1.f : r);
    }
}
