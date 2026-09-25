// tp_mmb_stereo_phaser — stereo phaser (spiegel van StereoPhaserModule.h; de
// DSP is mmb_dsp::StereoPhaser op de mono Phaser-kern, dezelfde header als
// de firmware). Native 44,1 kHz, blok 32. Zonder in_r krijgt R hetzelfde als L.
#include "mmb_abi.h"
#include "mmb_dsp/stereo_phaser.h"

const char* const MMB_TYPE_ID     = "tp_mmb_stereo_phaser";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_L, IN_R, IN_RATE, IN_DEPTH };
MmbPort MMB_INPUTS[] = {
    { "in_l", MMB_AUDIO, 0, {} }, { "in_r", MMB_AUDIO, 0, {} }, { "rate_cv", MMB_CV, 0, {} }, { "depth_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
enum { OUT_L, OUT_R };
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

enum { C_RATE, C_DEPTH, C_FEEDBACK, C_MIX, C_SPREAD };
MmbControl MMB_CONTROLS[] = {
    { "rate", 0.4f }, { "depth", 0.7f }, { "feedback", 0.3f }, { "mix", 0.5f }, { "spread", 0.5f },
};
const int MMB_NUM_CONTROLS = 5;

namespace {
mmb_dsp::StereoPhaser g_ph;
float g_knobRate = 0.4f, g_knobDepth = 0.7f;
}

void mmb_setup() { g_ph.Init(MMB_NATIVE_RATE); g_ph.set_rate(g_knobRate); g_ph.set_depth(g_knobDepth); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_RATE:     g_knobRate = v;  g_ph.set_rate(v); break;
        case C_DEPTH:    g_knobDepth = v; g_ph.set_depth(v); break;
        case C_FEEDBACK: g_ph.set_feedback(v); break;
        case C_MIX:      g_ph.set_mix(v); break;
        case C_SPREAD:   g_ph.set_spread(v); break;
    }
}

void mmb_process(int frames) {
    g_ph.set_rate(mmb_connected(IN_RATE) ? mmb_in0(IN_RATE) : g_knobRate);
    g_ph.set_depth(mmb_connected(IN_DEPTH) ? mmb_in0(IN_DEPTH) : g_knobDepth);
    const bool stereo = mmb_connected(IN_R);
    float x[2];
    for (int k = 0; k < frames; ++k) {
        x[0] = MMB_INPUTS[IN_L].buf[k];
        x[1] = MMB_INPUTS[IN_R].buf[k];
        g_ph.Process(x, stereo);
        MMB_OUTPUTS[OUT_L].buf[k] = x[0];
        MMB_OUTPUTS[OUT_R].buf[k] = x[1];
    }
}
