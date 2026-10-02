// tp_mmb_wah — Wah en klinkerfilter met pedaal, auto-wah en LFO (spiegel van WahModule.h; de
// DSP is mmb_dsp::Wah, dezelfde header als de firmware). 44,1 kHz, blok 32.
#include "kernel_host.h"
#include "mmb_dsp/wah.h"

const char* const MMB_TYPE_ID     = "tp_mmb_wah";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[] = {
    { "in", MMB_AUDIO, 0, {} },
    { "pedal_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 2;
MmbPort MMB_OUTPUTS[] = {
    { "out", MMB_AUDIO, 0, {} },
    { "env", MMB_CV, 0, {} },
};
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = {
    { "pedal", 0.3f },
    { "mode", 0.0f },
    { "type", 0.0f },
    { "sens", 0.6f },
    { "rate", 2.0f },
    { "q", 0.5f },
    { "mix", 1.0f },
    { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 8;

static const int kAudioIn[] = {0}, kCvIn[] = {1};
static const int kAudioOut[] = {0}, kCvOut[] = {1};
MMB_KERNEL_HOST(mmb_dsp::Wah, kAudioIn, 1, kCvIn, 1, kAudioOut, 1, kCvOut, 1)
