// tp_mmb_pump — VCA-compressor met sidechain en gate, 3630-stijl (spiegel van
// PumpModule.h; de DSP is mmb_dsp::PumpComp, dezelfde header als de firmware).
// Rekent op elke rate (MMB_RATE_FLEX); de browser blijft op 44,1 kHz. Blok 32.
// Zonder in_r krijgt R hetzelfde als L; zonder kabel op sc luistert de
// detector naar de eigen ingang.
#define MMB_RATE_FLEX 1
#include "mmb_abi.h"
#include "mmb_dsp/pump_comp.h"

// "+"-ingang thresh_cv telt bij de knop op (mmb_knob_cv, fw 0.5.110).
const char* const MMB_TYPE_ID     = "tp_mmb_pump";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_L, IN_R, IN_SC, IN_THRESH };
MmbPort MMB_INPUTS[] = {
    { "in_l", MMB_AUDIO, 0, {} }, { "in_r", MMB_AUDIO, 0, {} }, { "sc", MMB_AUDIO, 0, {} }, { "thresh_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
enum { OUT_L, OUT_R, OUT_GR, OUT_GATE };
MmbPort MMB_OUTPUTS[] = {
    { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} }, { "gr", MMB_CV, 0, {} }, { "gate", MMB_GATE, 0, {} },
};
const int MMB_NUM_OUTPUTS = 4;

enum { C_THRESHOLD, C_RATIO, C_ATTACK, C_RELEASE, C_MODE, C_KNEE, C_OUTPUT, C_GATE, C_GATE_RATE, C_SC_HP, C_LISTEN, C_MIX, C_BYPASS };
MmbControl MMB_CONTROLS[] = {
    { "threshold", -10.0f }, { "ratio", 4.0f }, { "attack", 1.0f }, { "release", 150.0f },
    { "mode", 0.0f }, { "knee", 0.0f }, { "output", 0.0f }, { "gate", -70.0f }, { "gate_rate", 200.0f },
    { "sc_hp", 0.0f }, { "listen", 0.0f }, { "mix", 1.0f }, { "bypass", 0.0f },
};
const int MMB_NUM_CONTROLS = 13;

namespace {
mmb_dsp::PumpComp g_comp;
float g_knobThresh = -10.0f;
}

void mmb_setup() { g_comp.Init(mmb_rate()); g_comp.set_threshold_db(g_knobThresh); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_THRESHOLD: g_knobThresh = v; g_comp.set_threshold_db(v); break;
        case C_RATIO:     g_comp.set_ratio(v); break;
        case C_ATTACK:    g_comp.set_attack_ms(v); break;
        case C_RELEASE:   g_comp.set_release_ms(v); break;
        case C_MODE:      g_comp.set_rms(v >= 0.5f); break;
        case C_KNEE:      g_comp.set_soft_knee(v >= 0.5f); break;
        case C_OUTPUT:    g_comp.set_output_db(v); break;
        case C_GATE:      g_comp.set_gate_db(v); break;
        case C_GATE_RATE: g_comp.set_gate_rate_ms(v); break;
        case C_SC_HP:     g_comp.set_sc_hp(static_cast<int>(v + 0.5f)); break;
        case C_LISTEN:    g_comp.set_listen(v >= 0.5f); break;
        case C_MIX:       g_comp.set_mix(v); break;
        case C_BYPASS:    g_comp.set_bypass(v >= 0.5f); break;
    }
}

void mmb_process(int frames) {
    g_comp.set_threshold_db(mmb_knob_cv(g_knobThresh, IN_THRESH, -40.0f, 20.0f));
    const bool stereo = mmb_connected(IN_R);
    const bool scOn = mmb_connected(IN_SC);
    float x[2];
    for (int k = 0; k < frames; ++k) {
        x[0] = MMB_INPUTS[IN_L].buf[k];
        x[1] = stereo ? MMB_INPUTS[IN_R].buf[k] : x[0];
        g_comp.Process(x, MMB_INPUTS[IN_SC].buf[k], scOn);
        MMB_OUTPUTS[OUT_L].buf[k] = x[0] > 1.f ? 1.f : (x[0] < -1.f ? -1.f : x[0]);
        MMB_OUTPUTS[OUT_R].buf[k] = x[1] > 1.f ? 1.f : (x[1] < -1.f ? -1.f : x[1]);
        MMB_OUTPUTS[OUT_GR].buf[k] = g_comp.gr();
        MMB_OUTPUTS[OUT_GATE].buf[k] = g_comp.gate_open() ? 1.f : 0.f;
    }
}
