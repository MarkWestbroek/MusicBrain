// tp_mmb_ensemble — Ensemble: het driefasige chorus van de string machines (spiegel van EnsembleModule.h; de
// DSP is mmb_dsp::Ensemble, dezelfde header als de firmware). 44,1 kHz, blok 32.
#include "kernel_host.h"
#include "mmb_dsp/ensemble.h"

const char* const MMB_TYPE_ID     = "tp_mmb_ensemble";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[] = {
    { "in_l", MMB_AUDIO, 0, {} },
    { "in_r", MMB_AUDIO, 0, {} },
    { "depth_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = {
    { "out_l", MMB_AUDIO, 0, {} },
    { "out_r", MMB_AUDIO, 0, {} },
};
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = {
    { "depth", 0.7f },
    { "slow", 0.6f },
    { "fast", 6.0f },
    { "tone", 0.6f },
    { "mix", 0.8f },
    { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 6;

static const int kAudioIn[] = {0, 1}, kCvIn[] = {2};
static const int kAudioOut[] = {0, 1}, kCvOut[] = {0};
MMB_KERNEL_HOST(mmb_dsp::Ensemble, kAudioIn, 2, kCvIn, 1, kAudioOut, 2, kCvOut, 0)
