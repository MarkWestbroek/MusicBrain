// tp_mmb_diode_comp — Diodebrug-compressor in Neve-33609-stijl (spiegel van DiodeCompModule.h;
// de DSP zelf is mmb_dsp::DiodeComp, dezelfde header als de firmware).
// Native 44,1 kHz, blok 32. Zonder in_r krijgt R hetzelfde als L, zoals in de
// firmware.
#include "mmb_abi.h"
#include "mmb_dsp/diode_comp.h"

const char* const MMB_TYPE_ID     = "tp_mmb_diode_comp";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_L, IN_R };
MmbPort MMB_INPUTS[] = { { "in_l", MMB_AUDIO, 0, {} }, { "in_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_INPUTS = 2;
enum { OUT_L, OUT_R, OUT_GR };
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} }, { "gr", MMB_CV, 0, {} } };
const int MMB_NUM_OUTPUTS = 3;

enum { C_THRESHOLD, C_RATIO, C_ATTACK, C_RELEASE, C_MAKEUP, C_COLOR, C_MIX, C_BYPASS };
MmbControl MMB_CONTROLS[] = {
    { "threshold", -20.0f },
    { "ratio", 1.0f },
    { "attack", 1.0f },
    { "release", 4.0f },
    { "makeup", 0.0f },
    { "color", 1.0f },
    { "mix", 1.0f },
    { "bypass", 0.0f },
};
const int MMB_NUM_CONTROLS = 8;

namespace { mmb_dsp::DiodeComp g_comp; }

void mmb_setup() { g_comp.Init(MMB_NATIVE_RATE); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_THRESHOLD: g_comp.set_threshold_db(v); break;
        case C_RATIO: g_comp.set_ratio(static_cast<int>(v + 0.5f)); break;
        case C_ATTACK: g_comp.set_attack(static_cast<int>(v + 0.5f)); break;
        case C_RELEASE: g_comp.set_release(static_cast<int>(v + 0.5f)); break;
        case C_MAKEUP: g_comp.set_makeup_db(v); break;
        case C_COLOR: g_comp.set_color(v); break;
        case C_MIX: g_comp.set_mix(v); break;
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
        MMB_OUTPUTS[OUT_GR].buf[k] = g_comp.gr();
    }
}
