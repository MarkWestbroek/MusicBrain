// tp_mmb_rungler — chaotische stem naar de Benjolin (spiegel van
// RunglerModule.h; de DSP is mmb_dsp::Rungler, dezelfde header als de
// firmware). 44,1 kHz, blok 32.
#include "kernel_host.h"
#include "mmb_dsp/rungler.h"

const char* const MMB_TYPE_ID     = "tp_mmb_rungler";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[] = {
    { "voct", MMB_CV, 0, {} }, { "rate_cv", MMB_CV, 0, {} }, { "cutoff_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = {
    { "out", MMB_AUDIO, 0, {} }, { "pwm", MMB_AUDIO, 0, {} }, { "tri_a", MMB_AUDIO, 0, {} },
    { "rungler", MMB_CV, 0, {} }, { "tri_b", MMB_CV, 0, {} }, { "pulse_b", MMB_GATE, 0, {} },
};
const int MMB_NUM_OUTPUTS = 6;
MmbControl MMB_CONTROLS[] = {
    { "freq_a", 110.0f }, { "freq_b", 3.0f }, { "run_a", 0.4f }, { "run_b", 0.3f },
    { "cross_a", 0.0f }, { "cross_b", 0.0f }, { "cutoff", 900.0f }, { "res", 0.5f },
    { "sweep", 0.5f }, { "loop", 0.0f }, { "level", 0.7f },
};
const int MMB_NUM_CONTROLS = 11;

static const int kAudioIn[] = {0}, kCvIn[] = {0, 1, 2}, kAudioOut[] = {0, 1, 2}, kCvOut[] = {3, 4, 5};
MMB_KERNEL_HOST(mmb_dsp::Rungler, kAudioIn, 0, kCvIn, 3, kAudioOut, 3, kCvOut, 3)
