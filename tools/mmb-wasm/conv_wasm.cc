// tp_mmb_conv — CONV, convolutiegalm (spiegel van ConvModule.h; de DSP is
// mmb_dsp::Conv, dezelfde header als de firmware). 44,1 kHz, blok 32.
#include "kernel_host.h"
#include "mmb_dsp/conv.h"

const char* const MMB_TYPE_ID     = "tp_mmb_conv";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[] = {
    { "in_l", MMB_AUDIO, 0, {} }, { "in_r", MMB_AUDIO, 0, {} },
    { "mix_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = {
    { "ir", 0.f }, { "mix", 0.3f }, { "predelay", 10.f }, { "length", 4.f }, { "size", 1.f },
    { "locut", 20.f }, { "hicut", 16000.f }, { "width", 1.f },
};
const int MMB_NUM_CONTROLS = 8;

static const int kAudioIn[] = {0, 1}, kCvIn[] = {2}, kAudioOut[] = {0, 1}, kCvOut[] = {0};
MMB_KERNEL_HOST(mmb_dsp::Conv, kAudioIn, 2, kCvIn, 1, kAudioOut, 2, kCvOut, 0)
