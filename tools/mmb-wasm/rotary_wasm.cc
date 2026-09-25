// tp_mmb_rotary — draaiende luidspreker, Leslie-stijl (spiegel van
// RotaryModule.h; de DSP is mmb_dsp::Leslie, dezelfde header als de firmware).
// Native 44,1 kHz, blok 32. Mono in (L+R), stereo uit.
#include "mmb_abi.h"
#include "mmb_dsp/leslie.h"

const char* const MMB_TYPE_ID     = "tp_mmb_rotary";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_L, IN_R, IN_FAST, IN_DRIVE };
MmbPort MMB_INPUTS[] = {
    { "in_l", MMB_AUDIO, 0, {} }, { "in_r", MMB_AUDIO, 0, {} },
    { "fast", MMB_GATE, 0, {} }, { "drive_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
enum { OUT_L, OUT_R };
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

enum { C_SPEED, C_SLOW, C_FAST, C_INERTIA, C_DRIVE, C_BALANCE, C_SPREAD, C_NOISE, C_LEVEL };
MmbControl MMB_CONTROLS[] = {
    { "speed", 0.0f }, { "slow_rate", 0.8f }, { "fast_rate", 6.7f }, { "inertia", 1.0f }, { "drive", 0.2f },
    { "balance", 0.5f }, { "spread", 0.8f }, { "noise", 0.3f }, { "level", 1.0f },
};
const int MMB_NUM_CONTROLS = 9;

namespace {
mmb_dsp::Leslie g_rot;
int   g_speed = 0;
bool  g_gate = false;
float g_knobDrive = 0.2f;
}

void mmb_setup() { g_rot.Init(MMB_NATIVE_RATE); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_SPEED:   g_speed = static_cast<int>(v + 0.5f); g_rot.set_speed(g_speed); break;
        case C_SLOW:    g_rot.set_slow_rate(v); break;
        case C_FAST:    g_rot.set_fast_rate(v); break;
        case C_INERTIA: g_rot.set_inertia(v); break;
        case C_DRIVE:   g_knobDrive = v; g_rot.set_drive(v); break;
        case C_BALANCE: g_rot.set_balance(v); break;
        case C_SPREAD:  g_rot.set_spread(v); break;
        case C_NOISE:   g_rot.set_noise(v); break;
        case C_LEVEL:   g_rot.set_level(v); break;
    }
}

void mmb_process(int frames) {
    // Gate: flank, geen niveau — zoals in de firmware.
    if (mmb_connected(IN_FAST)) {
        const bool hi = mmb_gate_in(IN_FAST);
        if (hi != g_gate) { g_gate = hi; if (g_speed != 2) { g_speed = hi ? 1 : 0; g_rot.set_speed(g_speed); } }
    }
    g_rot.set_drive(mmb_connected(IN_DRIVE) ? mmb_in0(IN_DRIVE) : g_knobDrive);
    const bool stereo = mmb_connected(IN_R);
    for (int k = 0; k < frames; ++k) {
        const float l = MMB_INPUTS[IN_L].buf[k];
        const float r = stereo ? MMB_INPUTS[IN_R].buf[k] : l;
        float yl, yr;
        g_rot.Process(0.5f * (l + r), &yl, &yr);
        MMB_OUTPUTS[OUT_L].buf[k] = yl > 1.f ? 1.f : (yl < -1.f ? -1.f : yl);
        MMB_OUTPUTS[OUT_R].buf[k] = yr > 1.f ? 1.f : (yr < -1.f ? -1.f : yr);
    }
}
