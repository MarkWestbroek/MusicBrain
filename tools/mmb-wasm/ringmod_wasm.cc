// tp_mmb_ringmod — ringmodulator (spiegel van RingModModule.h; de DSP is
// mmb_dsp::RingMod, dezelfde header als de firmware). Native 44,1 kHz,
// blok 32. Met een kabel op `carrier` vervangt die de eigen oscillator.
#include "mmb_abi.h"
#include "mmb_dsp/ring_mod.h"

const char* const MMB_TYPE_ID     = "tp_mmb_ringmod";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_AUDIO, IN_CARRIER, IN_VOCT, IN_MIX };
MmbPort MMB_INPUTS[] = {
    { "in", MMB_AUDIO, 0, {} }, { "carrier", MMB_AUDIO, 0, {} },
    { "voct", MMB_CV, 0, {} }, { "mix_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_FREQ, C_WAVE, C_MODE, C_BIAS, C_MIX };
MmbControl MMB_CONTROLS[] = {
    { "freq", 440.0f }, { "wave", 0.0f }, { "mode", 0.0f }, { "bias", 0.3f }, { "mix", 1.0f },
};
const int MMB_NUM_CONTROLS = 5;

namespace {
mmb_dsp::RingMod g_rm;
float g_knobMix = 1.0f;
}

void mmb_setup() { g_rm.Init(MMB_NATIVE_RATE); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_FREQ: g_rm.set_freq(v); break;
        case C_WAVE: g_rm.set_wave(static_cast<int>(v + 0.5f)); break;
        case C_MODE: g_rm.set_mode(static_cast<int>(v + 0.5f)); break;
        case C_BIAS: g_rm.set_bias(v); break;
        case C_MIX:  g_knobMix = v; g_rm.set_mix(v); break;
    }
}

void mmb_process(int frames) {
    g_rm.set_voct(mmb_connected(IN_VOCT) ? mmb_in0(IN_VOCT) : 0.f);
    g_rm.set_mix(mmb_connected(IN_MIX) ? mmb_in0(IN_MIX) : g_knobMix);
    const bool ext = mmb_connected(IN_CARRIER);
    for (int k = 0; k < frames; ++k) {
        const float c = MMB_INPUTS[IN_CARRIER].buf[k];
        float y = g_rm.Process(MMB_INPUTS[IN_AUDIO].buf[k], ext ? &c : nullptr);
        if (y > 1.f) y = 1.f; else if (y < -1.f) y = -1.f;
        MMB_OUTPUTS[0].buf[k] = y;
    }
}
