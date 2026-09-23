// tp_mmb_para_eq — Vierbands parametrische EQ in SSL/API-stijl (spiegel van ParamEqModule.h;
// de DSP zelf is mmb_dsp::ParamEq, dezelfde header als de firmware).
// Native 44,1 kHz, blok 32. Zonder in_r krijgt R hetzelfde als L, zoals in de
// firmware.
#include "mmb_abi.h"
#include "mmb_dsp/param_eq.h"

const char* const MMB_TYPE_ID     = "tp_mmb_para_eq";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_L, IN_R };
MmbPort MMB_INPUTS[] = { { "in_l", MMB_AUDIO, 0, {} }, { "in_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_INPUTS = 2;
enum { OUT_L, OUT_R };
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

enum { C_HPF, C_LPF, C_LF_FREQ, C_LF_GAIN, C_LF_SHELF, C_LMF_FREQ, C_LMF_GAIN, C_LMF_Q, C_HMF_FREQ, C_HMF_GAIN, C_HMF_Q, C_HF_FREQ, C_HF_GAIN, C_HF_SHELF, C_PROP_Q, C_OUTPUT, C_BYPASS };
MmbControl MMB_CONTROLS[] = {
    { "hpf", 16.0f },
    { "lpf", 20000.0f },
    { "lf_freq", 100.0f },
    { "lf_gain", 0.0f },
    { "lf_shelf", 1.0f },
    { "lmf_freq", 600.0f },
    { "lmf_gain", 0.0f },
    { "lmf_q", 1.0f },
    { "hmf_freq", 2500.0f },
    { "hmf_gain", 0.0f },
    { "hmf_q", 1.0f },
    { "hf_freq", 8000.0f },
    { "hf_gain", 0.0f },
    { "hf_shelf", 1.0f },
    { "prop_q", 0.0f },
    { "output", 0.0f },
    { "bypass", 0.0f },
};
const int MMB_NUM_CONTROLS = 17;

namespace { mmb_dsp::ParamEq g_comp; }

void mmb_setup() { g_comp.Init(MMB_NATIVE_RATE); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_HPF: g_comp.set_hpf(v); break;
        case C_LPF: g_comp.set_lpf(v); break;
        case C_LF_FREQ: g_comp.set_lf_freq(v); break;
        case C_LF_GAIN: g_comp.set_lf_gain(v); break;
        case C_LF_SHELF: g_comp.set_lf_shelf(v >= 0.5f); break;
        case C_LMF_FREQ: g_comp.set_lmf_freq(v); break;
        case C_LMF_GAIN: g_comp.set_lmf_gain(v); break;
        case C_LMF_Q: g_comp.set_lmf_q(v); break;
        case C_HMF_FREQ: g_comp.set_hmf_freq(v); break;
        case C_HMF_GAIN: g_comp.set_hmf_gain(v); break;
        case C_HMF_Q: g_comp.set_hmf_q(v); break;
        case C_HF_FREQ: g_comp.set_hf_freq(v); break;
        case C_HF_GAIN: g_comp.set_hf_gain(v); break;
        case C_HF_SHELF: g_comp.set_hf_shelf(v >= 0.5f); break;
        case C_PROP_Q: g_comp.set_prop_q(v >= 0.5f); break;
        case C_OUTPUT: g_comp.set_output_db(v); break;
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
