// tp_mmb_acid — acid-basstem naar de TB-303 (spiegel van AcidModule.h; de
// DSP is mmb_dsp::Acid, dezelfde header als de firmware). 44,1 kHz, blok 32.
#include "kernel_host.h"
#include "mmb_dsp/acid.h"

const char* const MMB_TYPE_ID     = "tp_mmb_acid";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[] = {
    { "voct", MMB_CV, 0, {} }, { "gate", MMB_GATE, 0, {} }, { "accent", MMB_GATE, 0, {} },
    { "slide", MMB_GATE, 0, {} }, { "cutoff_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 5;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} }, { "env", MMB_CV, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = {
    { "wave", 0.0f }, { "tune", 0.0f }, { "cutoff", 0.35f }, { "res", 0.7f },
    { "envmod", 0.6f }, { "decay", 0.4f }, { "accent", 0.6f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 8;

// Kernel-volgorde van de CV's: Voct, AccentIn, SlideIn, CutoffCv, Gate.
static const int kAudioIn[] = {0}, kCvIn[] = {0, 2, 3, 4, 1}, kAudioOut[] = {0}, kCvOut[] = {1};
MMB_KERNEL_HOST(mmb_dsp::Acid, kAudioIn, 0, kCvIn, 5, kAudioOut, 1, kCvOut, 1)
