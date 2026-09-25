// tp_mmb_shimmer — shimmer reverb, stereo (spiegel van ShimmerModule.h; de
// DSP is mmb_dsp::Shimmer, dezelfde header als de firmware). Native 44,1 kHz,
// blok 32. Zonder in_r krijgt R hetzelfde als L.
#include "mmb_abi.h"
#include "mmb_dsp/shimmer.h"

const char* const MMB_TYPE_ID     = "tp_mmb_shimmer";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_L, IN_R, IN_SHIMMER, IN_SIZE, IN_MIX };
MmbPort MMB_INPUTS[] = {
    { "in_l", MMB_AUDIO, 0, {} }, { "in_r", MMB_AUDIO, 0, {} },
    { "shimmer_cv", MMB_CV, 0, {} }, { "size_cv", MMB_CV, 0, {} }, { "mix_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 5;
enum { OUT_L, OUT_R };
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

enum { C_SIZE, C_DAMP, C_SHIMMER, C_INTERVAL, C_TONE, C_PREDELAY, C_MOD, C_MIX };
MmbControl MMB_CONTROLS[] = {
    { "size", 0.75f }, { "damp", 0.35f }, { "shimmer", 0.5f }, { "interval", 0.0f },
    { "tone", 0.6f }, { "predelay", 20.0f }, { "mod", 0.4f }, { "mix", 0.4f },
};
const int MMB_NUM_CONTROLS = 8;

namespace {
constexpr int kPool = 48000;      // ≥ Reverb::poolLength(44100)
float g_pool[kPool];
mmb_dsp::Shimmer g_sh;
float g_knobShimmer = 0.5f, g_knobSize = 0.75f, g_knobMix = 0.4f;
constexpr float kIntervals[5] = { 12.0f, 7.0f, 19.0f, 24.0f, -12.0f };
}

void mmb_setup() { g_sh.Init(MMB_NATIVE_RATE, g_pool, kPool); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_SIZE:     g_knobSize = v; g_sh.set_size(v); break;
        case C_DAMP:     g_sh.set_damp(v); break;
        case C_SHIMMER:  g_knobShimmer = v; g_sh.set_shimmer(v); break;
        case C_INTERVAL: { int i = static_cast<int>(v + 0.5f); if (i < 0) i = 0; if (i > 4) i = 4; g_sh.set_interval(kIntervals[i]); break; }
        case C_TONE:     g_sh.set_tone(v); break;
        case C_PREDELAY: g_sh.set_predelay(v); break;
        case C_MOD:      g_sh.set_mod(v); break;
        case C_MIX:      g_knobMix = v; g_sh.set_mix(v); break;
    }
}

void mmb_process(int frames) {
    g_sh.set_shimmer(mmb_connected(IN_SHIMMER) ? mmb_in0(IN_SHIMMER) : g_knobShimmer);
    g_sh.set_size(mmb_connected(IN_SIZE) ? mmb_in0(IN_SIZE) : g_knobSize);
    g_sh.set_mix(mmb_connected(IN_MIX) ? mmb_in0(IN_MIX) : g_knobMix);
    const bool stereo = mmb_connected(IN_R);
    float x[2];
    for (int k = 0; k < frames; ++k) {
        x[0] = MMB_INPUTS[IN_L].buf[k];
        x[1] = stereo ? MMB_INPUTS[IN_R].buf[k] : x[0];
        g_sh.Process(x);
        MMB_OUTPUTS[OUT_L].buf[k] = x[0] > 1.f ? 1.f : (x[0] < -1.f ? -1.f : x[0]);
        MMB_OUTPUTS[OUT_R].buf[k] = x[1] > 1.f ? 1.f : (x[1] < -1.f ? -1.f : x[1]);
    }
}
