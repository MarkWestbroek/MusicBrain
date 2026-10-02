// tp_mmb_sem — SEM-filter: tweepolig state-variable met LP→notch→HP-morph (spiegel van SemModule.h; de
// DSP is mmb_dsp::Sem, dezelfde header als de firmware). 44,1 kHz, blok 32.
#include "kernel_host.h"
#include "mmb_dsp/sem.h"

const char* const MMB_TYPE_ID     = "tp_mmb_sem";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[] = {
    { "in", MMB_AUDIO, 0, {} },
    { "cutoff_cv", MMB_CV, 0, {} },
    { "mode_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = {
    { "out", MMB_AUDIO, 0, {} },
    { "bp", MMB_AUDIO, 0, {} },
};
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = {
    { "cutoff", 1000.0f },
    { "res", 0.3f },
    { "mode", 0.0f },
    { "drive", 0.2f },
    { "cv_amt", 4.0f },
    { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 6;

static const int kAudioIn[] = {0}, kCvIn[] = {1, 2};
static const int kAudioOut[] = {0, 1}, kCvOut[] = {0};
MMB_KERNEL_HOST(mmb_dsp::Sem, kAudioIn, 1, kCvIn, 2, kAudioOut, 2, kCvOut, 0)
