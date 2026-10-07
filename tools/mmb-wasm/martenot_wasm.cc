// tp_mmb_martenot — Ondes Martenot-stem: tiroir, touche, vibrato (spiegel van
// MartenotModule.h; de DSP is mmb_dsp::Martenot, dezelfde header als de
// firmware). 44,1 kHz, blok 32.
#include "kernel_host.h"
#include "mmb_dsp/martenot.h"

const char* const MMB_TYPE_ID     = "tp_mmb_martenot";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[] = {
    { "voct", MMB_CV, 0, {} }, { "gate", MMB_GATE, 0, {} }, { "vel", MMB_CV, 0, {} },
    { "press", MMB_CV, 0, {} }, { "vib_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 5;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} }, { "amp", MMB_CV, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = {
    { "coarse", 0.0f }, { "fine", 0.0f }, { "onde", 0.8f }, { "creux", 0.0f }, { "gambe", 0.0f },
    { "nasillard", 0.0f }, { "octaviant", 0.0f }, { "souffle", 0.05f }, { "touche", 0.0f },
    { "attack", 6.0f }, { "release", 250.0f }, { "glide", 0.0f }, { "vib", 0.15f }, { "vib_rate", 5.5f },
    { "bright", 0.6f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 16;

// Kernel-volgorde van de CV's: Voct, Vel, Press, VibCv, Gate.
static const int kAudioIn[] = {0}, kCvIn[] = {0, 2, 3, 4, 1}, kAudioOut[] = {0}, kCvOut[] = {1};
MMB_KERNEL_HOST(mmb_dsp::Martenot, kAudioIn, 0, kCvIn, 5, kAudioOut, 1, kCvOut, 1)
