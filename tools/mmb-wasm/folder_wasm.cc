// tp_mmb_folder — West Coast-wavefolder (spiegel van WavefolderModule.h; de
// DSP is mmb_dsp::Wavefolder, dezelfde header als de firmware). 44,1 kHz,
// blok 32.
#include "kernel_host.h"
#include "mmb_dsp/wavefolder.h"

const char* const MMB_TYPE_ID     = "tp_mmb_folder";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[] = {
    { "in", MMB_AUDIO, 0, {} }, { "fold_cv", MMB_CV, 0, {} }, { "sym_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;
MmbControl MMB_CONTROLS[] = {
    { "fold", 0.3f }, { "symmetry", 0.0f }, { "type", 0.0f }, { "mix", 1.0f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 5;

static const int kAudioIn[] = {0}, kCvIn[] = {1, 2}, kAudioOut[] = {0}, kCvOut[] = {0};
MMB_KERNEL_HOST(mmb_dsp::Wavefolder, kAudioIn, 1, kCvIn, 2, kAudioOut, 1, kCvOut, 0)
