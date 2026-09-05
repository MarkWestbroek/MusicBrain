// tp_mmb_warps — Mutable Instruments Warps (spiegel van WarpsModule.h).
// Native 44,1 kHz zoals de firmware (Modulator oversampled zelf), blok 32.
#include "mmb_abi.h"
#include "warps/dsp/modulator.h"

const char* const MMB_TYPE_ID     = "tp_mmb_warps";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_1, IN_2, IN_VOCT, IN_ALGO, IN_TIMBRE };
MmbPort MMB_INPUTS[] = {
    { "in1", MMB_AUDIO, 0, {} }, { "in2", MMB_AUDIO, 0, {} }, { "voct", MMB_CV, 0, {} },
    { "algo_cv", MMB_CV, 0, {} }, { "timbre_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 5;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} }, { "aux", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

enum { C_ALGO, C_TIMBRE, C_SHAPE, C_DRIVE1, C_DRIVE2, C_COARSE, C_LEVEL };
MmbControl MMB_CONTROLS[] = {
    { "algo", 0.f }, { "timbre", 0.5f }, { "shape", 0.f }, { "drive1", 1.f }, { "drive2", 1.f },
    { "coarse", 0.f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 7;

namespace {
warps::Modulator g_mod;
float g_algoBase = 0.f, g_timbreBase = 0.5f, g_coarse = 0.f, g_level = 0.8f;
warps::ShortFrame g_in[MMB_MAX_BLOCK], g_out[MMB_MAX_BLOCK];
float clamp02(float v) { return v < 0.f ? 0.f : (v > 2.f ? 2.f : v); }
}

void mmb_setup() {
    g_mod.Init(MMB_NATIVE_RATE);
    auto* p = g_mod.mutable_parameters();
    p->channel_drive[0] = 1.f; p->channel_drive[1] = 1.f;
    p->modulation_algorithm = 0.f; p->modulation_parameter = 0.5f;
    p->carrier_shape = 0; p->note = 48.f;
    p->frequency_shift_pot = 0.f; p->frequency_shift_cv = 0.f; p->phase_shift = 0.f;
}

void mmb_on_control(int idx, float v) {
    auto* p = g_mod.mutable_parameters();
    switch (idx) {
        case C_ALGO:   g_algoBase = v < 0.f ? 0.f : (v > 8.f ? 8.f : v); p->modulation_algorithm = g_algoBase; break;
        case C_TIMBRE: g_timbreBase = mmb_clamp01(v); p->modulation_parameter = g_timbreBase; break;
        case C_SHAPE:  { int s = static_cast<int>(v); if (s < 0) s = 0; if (s > 5) s = 5; p->carrier_shape = s; break; }
        case C_DRIVE1: p->channel_drive[0] = clamp02(v); break;
        case C_DRIVE2: p->channel_drive[1] = clamp02(v); break;
        case C_COARSE: g_coarse = v; p->note = 60.f + g_coarse; break;
        case C_LEVEL:  g_level = mmb_clamp01(v); break;
    }
}

void mmb_process(int frames) {
    auto* p = g_mod.mutable_parameters();
    p->note = 60.f + 12.f * mmb_in0(IN_VOCT) + g_coarse;
    if (mmb_connected(IN_ALGO)) { float a = g_algoBase + 4.f * mmb_in0(IN_ALGO); if (a < 0.f) a = 0.f; if (a > 8.f) a = 8.f; p->modulation_algorithm = a; }
    if (mmb_connected(IN_TIMBRE)) { p->modulation_parameter = mmb_clamp01(g_timbreBase + mmb_in0(IN_TIMBRE)); }
    for (int k = 0; k < frames; ++k) {
        float a = MMB_INPUTS[IN_1].buf[k], b = MMB_INPUTS[IN_2].buf[k];
        if (a > 1.f) a = 1.f; else if (a < -1.f) a = -1.f;
        if (b > 1.f) b = 1.f; else if (b < -1.f) b = -1.f;
        g_in[k].l = static_cast<int16_t>(a * 32767.f);
        g_in[k].r = static_cast<int16_t>(b * 32767.f);
    }
    g_mod.Process(g_in, g_out, static_cast<size_t>(frames));
    for (int k = 0; k < frames; ++k) {
        float m = g_out[k].l * (1.f / 32768.f) * g_level, x = g_out[k].r * (1.f / 32768.f) * g_level;
        if (m > 1.f) m = 1.f; else if (m < -1.f) m = -1.f;
        if (x > 1.f) x = 1.f; else if (x < -1.f) x = -1.f;
        MMB_OUTPUTS[0].buf[k] = m;
        MMB_OUTPUTS[1].buf[k] = x;
    }
}
