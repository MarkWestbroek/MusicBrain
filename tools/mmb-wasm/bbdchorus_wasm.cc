// tp_mmb_bbd_chorus — BBD-chorus/flanger, mono in → stereo uit (spiegel van
// BbdChorusModule.h; de DSP is mmb_dsp::BbdChorus, dezelfde header als de
// firmware). Native 44,1 kHz, blok 32. Zonder in_r krijgt R hetzelfde als L.
#include "mmb_abi.h"
#include "mmb_dsp/bbd_chorus.h"

const char* const MMB_TYPE_ID     = "tp_mmb_bbd_chorus";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_L, IN_R, IN_RATE, IN_DEPTH, IN_MIX };
MmbPort MMB_INPUTS[] = {
    { "in_l", MMB_AUDIO, 0, {} }, { "in_r", MMB_AUDIO, 0, {} },
    { "rate_cv", MMB_CV, 0, {} }, { "depth_cv", MMB_CV, 0, {} }, { "mix_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 5;
enum { OUT_L, OUT_R };
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

enum { C_RATE, C_DEPTH, C_DELAY, C_FEEDBACK, C_MIX, C_SPREAD, C_AGE, C_TONE };
MmbControl MMB_CONTROLS[] = {
    { "rate", 0.6f }, { "depth", 0.5f }, { "delay", 8.0f }, { "feedback", 0.0f },
    { "mix", 0.5f }, { "spread", 1.0f }, { "age", 0.3f }, { "tone", 0.6f },
};
const int MMB_NUM_CONTROLS = 8;

namespace {
mmb_dsp::BbdChorus g_chorus;
float g_knobRate = 0.6f, g_knobDepth = 0.5f, g_knobMix = 0.5f;
}

void mmb_setup() { g_chorus.Init(MMB_NATIVE_RATE); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_RATE:     g_knobRate = v;  g_chorus.set_rate(v); break;
        case C_DEPTH:    g_knobDepth = v; g_chorus.set_depth(v); break;
        case C_DELAY:    g_chorus.set_delay(v); break;
        case C_FEEDBACK: g_chorus.set_feedback(v); break;
        case C_MIX:      g_knobMix = v;   g_chorus.set_mix(v); break;
        case C_SPREAD:   g_chorus.set_spread(v); break;
        case C_AGE:      g_chorus.set_age(v); break;
        case C_TONE:     g_chorus.set_tone(v); break;
    }
}

void mmb_process(int frames) {
    g_chorus.set_rate(mmb_connected(IN_RATE) ? mmb_in0(IN_RATE) : g_knobRate);
    g_chorus.set_depth(mmb_connected(IN_DEPTH) ? mmb_in0(IN_DEPTH) : g_knobDepth);
    g_chorus.set_mix(mmb_connected(IN_MIX) ? mmb_in0(IN_MIX) : g_knobMix);
    const bool stereo = mmb_connected(IN_R);
    float x[2];
    for (int k = 0; k < frames; ++k) {
        x[0] = MMB_INPUTS[IN_L].buf[k];
        x[1] = MMB_INPUTS[IN_R].buf[k];
        g_chorus.Process(x, stereo);
        MMB_OUTPUTS[OUT_L].buf[k] = x[0] > 1.f ? 1.f : (x[0] < -1.f ? -1.f : x[0]);
        MMB_OUTPUTS[OUT_R].buf[k] = x[1] > 1.f ? 1.f : (x[1] < -1.f ? -1.f : x[1]);
    }
}
