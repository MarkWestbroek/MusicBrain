// tp_mmb_synthex — polyfone stem naar de Elka Synthex (spiegel van
// SynthexModule.h; de DSP is mmb_dsp::Synthex, dezelfde header als de
// firmware). 44,1 kHz, blok 32. Acht stem-cellen: voct_1..8, gate_1..8.
#include "kernel_host.h"
#include "mmb_dsp/synthex.h"

const char* const MMB_TYPE_ID     = "tp_mmb_synthex";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

// In de volgorde van de kernel: 8 x V/Oct, bend, joy, 8 x gate.
MmbPort MMB_INPUTS[] = {
    { "voct_1", MMB_CV, 0, {} },
    { "voct_2", MMB_CV, 0, {} },
    { "voct_3", MMB_CV, 0, {} },
    { "voct_4", MMB_CV, 0, {} },
    { "voct_5", MMB_CV, 0, {} },
    { "voct_6", MMB_CV, 0, {} },
    { "voct_7", MMB_CV, 0, {} },
    { "voct_8", MMB_CV, 0, {} },
    { "bend", MMB_CV, 0, {} },
    { "joy", MMB_CV, 0, {} },
    { "gate_1", MMB_GATE, 0, {} },
    { "gate_2", MMB_GATE, 0, {} },
    { "gate_3", MMB_GATE, 0, {} },
    { "gate_4", MMB_GATE, 0, {} },
    { "gate_5", MMB_GATE, 0, {} },
    { "gate_6", MMB_GATE, 0, {} },
    { "gate_7", MMB_GATE, 0, {} },
    { "gate_8", MMB_GATE, 0, {} },
};
const int MMB_NUM_INPUTS = 18;
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = {
    { "o1_oct", 2.0f },
    { "o1_wave", 0.0f },
    { "o1_level", 10.0f },
    { "o2_oct", 2.0f },
    { "o2_transpose", 0.0f },
    { "o2_detune", 6.0f },
    { "o2_wave", 0.0f },
    { "o2_level", 8.0f },
    { "sync", 0.0f },
    { "ring", 0.0f },
    { "pw", 0.3f },
    { "noise", 0.0f },
    { "freq", 6.0f },
    { "res", 2.0f },
    { "env_amt", 4.0f },
    { "kbd", 3.0f },
    { "mode", 0.0f },
    { "fa", 0.5f },
    { "fd", 5.0f },
    { "fs", 6.0f },
    { "fr", 4.0f },
    { "aa", 0.5f },
    { "ad", 5.0f },
    { "as", 8.0f },
    { "ar", 4.0f },
    { "lfo_rate", 5.0f },
    { "lfo_wave", 0.0f },
    { "lfo_osc", 0.0f },
    { "lfo_pw", 0.0f },
    { "lfo_vcf", 0.0f },
    { "lfo_vca", 0.0f },
    { "glide", 0.0f },
    { "tune", 0.0f },
    { "chorus", 1.0f },
    { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 35;

static const int kAudioIn[] = {0}, kAudioOut[] = {0, 1}, kCvOut[] = {0};
static const int kCvIn[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17};
MMB_KERNEL_HOST(mmb_dsp::Synthex, kAudioIn, 0, kCvIn, 18, kAudioOut, 2, kCvOut, 0)
