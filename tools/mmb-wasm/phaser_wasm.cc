// tp_mmb_phaser — zestraps all-pass-phaser (spiegel van PhaserModule.h). De
// DSP is mmb_dsp::Phaser, dezelfde kernel als de firmware (bit-identiek
// bewezen in bitcheck/phaser_check.cc). Native 44,1 kHz, blok 32.
//
// CV en knop schrijven hetzelfde veld, bij verandering (CvGraph-stijl): wie
// het laatst iets nieuws zegt, wint — zoals op de Teensy.
#include "mmb_abi.h"
#include "mmb_dsp/phaser.h"

const char* const MMB_TYPE_ID     = "tp_mmb_phaser";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_AUDIO, IN_RATE, IN_DEPTH };
MmbPort MMB_INPUTS[] = {
    { "in", MMB_AUDIO, 0, {} }, { "rate_cv", MMB_CV, 0, {} }, { "depth_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_RATE, C_DEPTH, C_FEEDBACK, C_MIX };
MmbControl MMB_CONTROLS[] = {
    { "rate", 0.5f }, { "depth", 0.7f }, { "feedback", 0.3f }, { "mix", 0.5f },
};
const int MMB_NUM_CONTROLS = 4;

namespace {
mmb_dsp::Phaser g_k;
float g_lastRate = -1e9f, g_lastDepth = -1e9f;
}  // namespace

void mmb_setup() { g_k.Init(MMB_NATIVE_RATE); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_RATE:     g_k.rate(v); break;
        case C_DEPTH:    g_k.depth(v); break;
        case C_FEEDBACK: g_k.feedback(v); break;
        case C_MIX:      g_k.mix(v); break;
    }
}

void mmb_process(int frames) {
    if (!mmb_connected(IN_RATE)) g_lastRate = -1e9f;
    else if (mmb_in0(IN_RATE) != g_lastRate) g_k.rate(g_lastRate = mmb_in0(IN_RATE));
    if (!mmb_connected(IN_DEPTH)) g_lastDepth = -1e9f;
    else if (mmb_in0(IN_DEPTH) != g_lastDepth) g_k.depth(g_lastDepth = mmb_in0(IN_DEPTH));
    for (int k = 0; k < frames; ++k)
        MMB_OUTPUTS[0].buf[k] = g_k.Tick(MMB_INPUTS[IN_AUDIO].buf[k]);
}
