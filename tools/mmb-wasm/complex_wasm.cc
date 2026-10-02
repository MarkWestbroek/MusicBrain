// tp_mmb_complex — Complex-oscillator naar de Buchla 259 (spiegel van ComplexOscModule.h; de
// DSP is mmb_dsp::ComplexOsc, dezelfde header als de firmware). 44,1 kHz, blok 32.
#include "kernel_host.h"
#include "mmb_dsp/complex_osc.h"

const char* const MMB_TYPE_ID     = "tp_mmb_complex";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[] = {
    { "voct", MMB_CV, 0, {} },
    { "timbre_cv", MMB_CV, 0, {} },
    { "fm_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = {
    { "out", MMB_AUDIO, 0, {} },
    { "mod", MMB_AUDIO, 0, {} },
};
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = {
    { "pitch", 0.0f },
    { "ratio", 2.0f },
    { "mod_wave", 0.0f },
    { "fm", 0.0f },
    { "am", 0.0f },
    { "tmod", 0.0f },
    { "timbre", 0.3f },
    { "symmetry", 0.0f },
    { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 9;

static const int kAudioIn[] = {0}, kCvIn[] = {0, 1, 2};
static const int kAudioOut[] = {0, 1}, kCvOut[] = {0};
MMB_KERNEL_HOST(mmb_dsp::ComplexOsc, kAudioIn, 0, kCvIn, 3, kAudioOut, 2, kCvOut, 0)
