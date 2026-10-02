// tp_mmb_freqshift — frequency shifter naar Bode (spiegel van
// FreqShiftModule.h; de DSP is mmb_dsp::FreqShifter, dezelfde header als de
// firmware). 44,1 kHz, blok 32.
#include "kernel_host.h"
#include "mmb_dsp/freq_shifter.h"

const char* const MMB_TYPE_ID     = "tp_mmb_freqshift";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[] = { { "in", MMB_AUDIO, 0, {} }, { "shift_cv", MMB_CV, 0, {} } };
const int MMB_NUM_INPUTS = 2;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} }, { "down", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = {
    { "shift", 0.2f }, { "range", 1.0f }, { "fbk", 0.0f }, { "mix", 1.0f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 5;

static const int kAudioIn[] = {0}, kCvIn[] = {1}, kAudioOut[] = {0, 1}, kCvOut[] = {0};
MMB_KERNEL_HOST(mmb_dsp::FreqShifter, kAudioIn, 1, kCvIn, 1, kAudioOut, 2, kCvOut, 0)
