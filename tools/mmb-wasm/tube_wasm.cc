// tp_mmb_tube — buizenoverdrive: gitaarversterker of studio-voorversterker
// (spiegel van TubeModule.h; de DSP is mmb_dsp::Tube, dezelfde header als de
// firmware). 44,1 kHz, blok 32, stereo.
#include "kernel_host.h"
#include "mmb_dsp/tube.h"

const char* const MMB_TYPE_ID     = "tp_mmb_tube";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[] = {
    { "in_l", MMB_AUDIO, 0, {} }, { "in_r", MMB_AUDIO, 0, {} }, { "drive_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = {
    { "mode", 1.0f }, { "drive", 0.5f }, { "bias", 0.5f }, { "bass", 0.5f }, { "mid", 0.5f }, { "treble", 0.5f },
    { "stack", 0.0f }, { "presence", 0.5f }, { "sag", 0.4f }, { "cab", 1.0f }, { "mix", 1.0f }, { "level", 0.6f },
};
const int MMB_NUM_CONTROLS = 12;

static const int kAudioIn[] = {0, 1}, kCvIn[] = {2}, kAudioOut[] = {0, 1}, kCvOut[] = {0};
MMB_KERNEL_HOST(mmb_dsp::Tube, kAudioIn, 2, kCvIn, 1, kAudioOut, 2, kCvOut, 0)
