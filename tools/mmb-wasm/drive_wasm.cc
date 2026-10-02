// tp_mmb_drive — overdrive / distortion / fuzz (spiegel van DriveModule.h; de
// DSP is mmb_dsp::Drive, dezelfde header als de firmware). 44,1 kHz, blok 32.
#include "kernel_host.h"
#include "mmb_dsp/drive.h"

const char* const MMB_TYPE_ID     = "tp_mmb_drive";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[] = { { "in", MMB_AUDIO, 0, {} }, { "drive_cv", MMB_CV, 0, {} } };
const int MMB_NUM_INPUTS = 2;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;
MmbControl MMB_CONTROLS[] = {
    { "drive", 0.5f }, { "tone", 0.5f }, { "level", 0.5f }, { "mode", 0.0f }, { "mix", 1.0f },
};
const int MMB_NUM_CONTROLS = 5;

static const int kAudioIn[] = {0}, kCvIn[] = {1}, kAudioOut[] = {0}, kCvOut[] = {0};
MMB_KERNEL_HOST(mmb_dsp::Drive, kAudioIn, 1, kCvIn, 1, kAudioOut, 1, kCvOut, 0)
