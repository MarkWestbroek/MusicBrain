// tp_mmb_reverb — plaat-/veergalm, stereo (spiegel van ReverbModule.h; de
// DSP is mmb_dsp::Reverb, dezelfde header als de firmware). Native 44,1 kHz,
// blok 32. Zonder in_r krijgt R hetzelfde als L.
#include "mmb_abi.h"
#include "mmb_dsp/reverb.h"

const char* const MMB_TYPE_ID     = "tp_mmb_reverb";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_L, IN_R, IN_SIZE, IN_MIX };
MmbPort MMB_INPUTS[] = {
    { "in_l", MMB_AUDIO, 0, {} }, { "in_r", MMB_AUDIO, 0, {} }, { "size_cv", MMB_CV, 0, {} }, { "mix_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
enum { OUT_L, OUT_R };
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

enum { C_MODE, C_SIZE, C_DAMP, C_PREDELAY, C_MOD, C_MIX };
MmbControl MMB_CONTROLS[] = {
    { "mode", 0.0f }, { "size", 0.6f }, { "damp", 0.4f }, { "predelay", 10.0f }, { "mod", 0.3f }, { "mix", 0.3f },
};
const int MMB_NUM_CONTROLS = 6;

namespace {
constexpr int kPool = 48000;      // ≥ poolLength(44100) ≈ 42 k
float g_pool[kPool];
mmb_dsp::Reverb g_rv;
float g_knobSize = 0.6f, g_knobMix = 0.3f;
}

void mmb_setup() { g_rv.Init(MMB_NATIVE_RATE, g_pool, kPool); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_MODE:     g_rv.set_mode(static_cast<int>(v + 0.5f)); break;
        case C_SIZE:     g_knobSize = v; g_rv.set_size(v); break;
        case C_DAMP:     g_rv.set_damp(v); break;
        case C_PREDELAY: g_rv.set_predelay(v); break;
        case C_MOD:      g_rv.set_mod(v); break;
        case C_MIX:      g_knobMix = v; g_rv.set_mix(v); break;
    }
}

void mmb_process(int frames) {
    g_rv.set_size(mmb_connected(IN_SIZE) ? mmb_in0(IN_SIZE) : g_knobSize);
    g_rv.set_mix(mmb_connected(IN_MIX) ? mmb_in0(IN_MIX) : g_knobMix);
    const bool stereo = mmb_connected(IN_R);
    float x[2];
    for (int k = 0; k < frames; ++k) {
        x[0] = MMB_INPUTS[IN_L].buf[k];
        x[1] = stereo ? MMB_INPUTS[IN_R].buf[k] : x[0];
        g_rv.Process(x);
        MMB_OUTPUTS[OUT_L].buf[k] = x[0] > 1.f ? 1.f : (x[0] < -1.f ? -1.f : x[0]);
        MMB_OUTPUTS[OUT_R].buf[k] = x[1] > 1.f ? 1.f : (x[1] < -1.f ? -1.f : x[1]);
    }
}
