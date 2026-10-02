// tp_mmb_lpg — low-pass gate met vactrol-gedrag (spiegel van LpgModule.h; de
// DSP is mmb_dsp::Lpg, dezelfde header als de firmware). 44,1 kHz, blok 32.
#include "kernel_host.h"
#include "mmb_dsp/lpg.h"

const char* const MMB_TYPE_ID     = "tp_mmb_lpg";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[] = {
    { "in", MMB_AUDIO, 0, {} }, { "cv", MMB_CV, 0, {} }, { "trig", MMB_GATE, 0, {} },
};
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} }, { "env", MMB_CV, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = {
    { "offset", 0.0f }, { "decay", 0.25f }, { "mode", 1.0f }, { "res", 0.1f }, { "level", 0.9f },
};
const int MMB_NUM_CONTROLS = 5;

static const int kAudioIn[] = {0}, kCvIn[] = {1, 2}, kAudioOut[] = {0}, kCvOut[] = {1};
MMB_KERNEL_HOST(mmb_dsp::Lpg, kAudioIn, 1, kCvIn, 2, kAudioOut, 1, kCvOut, 1)
