// tp_mmb_tremolo — tremolo-pedaal, stereo (spiegel van TremoloModule.h; de
// DSP is mmb_dsp::Tremolo, dezelfde header als de firmware). Native 44,1 kHz,
// blok 32. Zonder in_r krijgt R hetzelfde als L.
#include "mmb_abi.h"
#include "mmb_dsp/tremolo.h"

const char* const MMB_TYPE_ID     = "tp_mmb_tremolo";
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

enum { C_RATE, C_DEPTH, C_WAVE, C_MODE, C_SHAPE, C_LEVEL };
MmbControl MMB_CONTROLS[] = {
    { "rate", 4.5f }, { "depth", 0.6f }, { "wave", 0.0f }, { "mode", 0.0f }, { "shape", 0.0f }, { "level", 1.0f },
};
const int MMB_NUM_CONTROLS = 6;

namespace {
mmb_dsp::Tremolo g_tr;
float g_knobRate = 4.5f, g_knobDepth = 0.6f;
}

void mmb_setup() { g_tr.Init(MMB_NATIVE_RATE); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_RATE:  g_knobRate = v;  g_tr.set_rate(v); break;
        case C_DEPTH: g_knobDepth = v; g_tr.set_depth(v); break;
        case C_WAVE:  g_tr.set_wave(static_cast<int>(v + 0.5f)); break;
        case C_MODE:  g_tr.set_mode(static_cast<int>(v + 0.5f)); break;
        case C_SHAPE: g_tr.set_shape(v); break;
        case C_LEVEL: g_tr.set_level(v); break;
    }
}

void mmb_process(int frames) {
    g_tr.set_rate(mmb_connected(IN_RATE) ? mmb_in0(IN_RATE) : g_knobRate);
    g_tr.set_depth(mmb_connected(IN_DEPTH) ? mmb_in0(IN_DEPTH) : g_knobDepth);
    const bool stereo = mmb_connected(IN_R);
    float x[2];
    for (int k = 0; k < frames; ++k) {
        x[0] = MMB_INPUTS[IN_L].buf[k];
        x[1] = MMB_INPUTS[IN_R].buf[k];
        g_tr.Process(x, stereo);
        MMB_OUTPUTS[OUT_L].buf[k] = x[0] > 1.f ? 1.f : (x[0] < -1.f ? -1.f : x[0]);
        MMB_OUTPUTS[OUT_R].buf[k] = x[1] > 1.f ? 1.f : (x[1] < -1.f ? -1.f : x[1]);
    }
}
