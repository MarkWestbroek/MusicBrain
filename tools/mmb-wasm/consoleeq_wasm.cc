// tp_mmb_console_eq — Console-EQ in Britse klasse-A-stijl (Neve 1073) (spiegel van ConsoleEqModule.h;
// de DSP zelf is mmb_dsp::ConsoleEq, dezelfde header als de firmware).
// Native 44,1 kHz, blok 32. Zonder in_r krijgt R hetzelfde als L, zoals in de
// firmware.
#include "mmb_abi.h"
#include "mmb_dsp/console_eq.h"

const char* const MMB_TYPE_ID     = "tp_mmb_console_eq";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_L, IN_R };
MmbPort MMB_INPUTS[] = { { "in_l", MMB_AUDIO, 0, {} }, { "in_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_INPUTS = 2;
enum { OUT_L, OUT_R };
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

enum { C_HPF, C_LOW_FREQ, C_LOW_GAIN, C_MID_FREQ, C_MID_GAIN, C_HIGH_GAIN, C_OUTPUT, C_COLOR, C_BYPASS };
MmbControl MMB_CONTROLS[] = {
    { "hpf", 0.0f },
    { "low_freq", 1.0f },
    { "low_gain", 0.0f },
    { "mid_freq", 2.0f },
    { "mid_gain", 0.0f },
    { "high_gain", 0.0f },
    { "output", 0.0f },
    { "color", 1.0f },
    { "bypass", 0.0f },
};
const int MMB_NUM_CONTROLS = 9;

namespace { mmb_dsp::ConsoleEq g_comp; }

void mmb_setup() { g_comp.Init(MMB_NATIVE_RATE); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_HPF: g_comp.set_hpf(static_cast<int>(v + 0.5f)); break;
        case C_LOW_FREQ: g_comp.set_low_freq(static_cast<int>(v + 0.5f)); break;
        case C_LOW_GAIN: g_comp.set_low_gain(v); break;
        case C_MID_FREQ: g_comp.set_mid_freq(static_cast<int>(v + 0.5f)); break;
        case C_MID_GAIN: g_comp.set_mid_gain(v); break;
        case C_HIGH_GAIN: g_comp.set_high_gain(v); break;
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
