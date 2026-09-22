// tp_mmb_program_eq — Passieve program-EQ in Pultec-EQP-1A-stijl (spiegel van ProgramEqModule.h;
// de DSP zelf is mmb_dsp::ProgramEq, dezelfde header als de firmware).
// Native 44,1 kHz, blok 32. Zonder in_r krijgt R hetzelfde als L, zoals in de
// firmware.
#include "mmb_abi.h"
#include "mmb_dsp/program_eq.h"

const char* const MMB_TYPE_ID     = "tp_mmb_program_eq";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_L, IN_R };
MmbPort MMB_INPUTS[] = { { "in_l", MMB_AUDIO, 0, {} }, { "in_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_INPUTS = 2;
enum { OUT_L, OUT_R };
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

enum { C_LOW_FREQ, C_LOW_BOOST, C_LOW_ATTEN, C_HIGH_FREQ, C_HIGH_BOOST, C_BANDWIDTH, C_ATTEN_FREQ, C_HIGH_ATTEN, C_OUTPUT, C_COLOR, C_BYPASS };
MmbControl MMB_CONTROLS[] = {
    { "low_freq", 2.0f },
    { "low_boost", 0.0f },
    { "low_atten", 0.0f },
    { "high_freq", 4.0f },
    { "high_boost", 0.0f },
    { "bandwidth", 5.0f },
    { "atten_freq", 1.0f },
    { "high_atten", 0.0f },
    { "output", 0.0f },
    { "color", 1.0f },
    { "bypass", 0.0f },
};
const int MMB_NUM_CONTROLS = 11;

namespace { mmb_dsp::ProgramEq g_comp; }

void mmb_setup() { g_comp.Init(MMB_NATIVE_RATE); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_LOW_FREQ: g_comp.set_low_freq(static_cast<int>(v + 0.5f)); break;
        case C_LOW_BOOST: g_comp.set_low_boost(v); break;
        case C_LOW_ATTEN: g_comp.set_low_atten(v); break;
        case C_HIGH_FREQ: g_comp.set_high_freq(static_cast<int>(v + 0.5f)); break;
        case C_HIGH_BOOST: g_comp.set_high_boost(v); break;
        case C_BANDWIDTH: g_comp.set_bandwidth(v); break;
        case C_ATTEN_FREQ: g_comp.set_atten_freq(static_cast<int>(v + 0.5f)); break;
        case C_HIGH_ATTEN: g_comp.set_high_atten(v); break;
        case C_OUTPUT: g_comp.set_output_db(v); break;
        case C_COLOR: g_comp.set_color(v); break;
        case C_BYPASS: g_comp.set_bypass(v >= 0.5f); break;
    }
}

void mmb_process(int frames) {
    const bool stereo = mmb_connected(IN_R);
    float x[2];
    for (int k = 0; k < frames; ++k) {
        x[0] = MMB_INPUTS[IN_L].buf[k];
        x[1] = stereo ? MMB_INPUTS[IN_R].buf[k] : x[0];
        g_comp.Process(x, 2);
        MMB_OUTPUTS[OUT_L].buf[k] = x[0] > 1.f ? 1.f : (x[0] < -1.f ? -1.f : x[0]);
        MMB_OUTPUTS[OUT_R].buf[k] = x[1] > 1.f ? 1.f : (x[1] < -1.f ? -1.f : x[1]);
    }
}
