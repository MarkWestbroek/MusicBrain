// tp_mmb_mixtur — Trautonium-stem: glimlamp, vier ondertoondelers en vaste
// formanten (spiegel van MixturModule.h; de DSP is mmb_dsp::Mixtur, dezelfde
// header als de firmware). 44,1 kHz, blok 32.
#include "kernel_host.h"
#include "mmb_dsp/mixtur.h"

const char* const MMB_TYPE_ID     = "tp_mmb_mixtur";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[] = {
    { "voct", MMB_CV, 0, {} }, { "gate", MMB_GATE, 0, {} }, { "vel", MMB_CV, 0, {} },
    { "press", MMB_CV, 0, {} }, { "sub_cv", MMB_CV, 0, {} }, { "form_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 6;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} }, { "amp", MMB_CV, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = {
    { "coarse", 0.0f }, { "fine", 0.0f }, { "curve", 0.55f }, { "unrest", 0.25f }, { "main", 0.8f },
    { "div1", 2.0f }, { "div2", 3.0f }, { "div3", 4.0f }, { "div4", 5.0f },
    { "sub1", 0.6f }, { "sub2", 0.45f }, { "sub3", 0.3f }, { "sub4", 0.0f },
    { "formant", 1.0f }, { "fshift", 0.0f }, { "freso", 0.55f }, { "fmix", 0.7f }, { "noise", 0.03f },
    { "dyn", 0.0f }, { "attack", 8.0f }, { "release", 120.0f }, { "glide", 0.0f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 23;

// Kernel-volgorde van de CV's: Voct, Vel, Press, SubCv, FormCv, Gate.
static const int kAudioIn[] = {0}, kCvIn[] = {0, 2, 3, 4, 5, 1}, kAudioOut[] = {0}, kCvOut[] = {1};
MMB_KERNEL_HOST(mmb_dsp::Mixtur, kAudioIn, 0, kCvIn, 6, kAudioOut, 1, kCvOut, 1)
