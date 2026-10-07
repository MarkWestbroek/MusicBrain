// tp_mmb_diffuseur — de luidsprekers van de Ondes Martenot: Principal, Palme,
// Métallique (spiegel van DiffuseurModule.h; de DSP is mmb_dsp::Diffuseur,
// dezelfde header als de firmware). 44,1 kHz, blok 32.
#include "kernel_host.h"
#include "mmb_dsp/diffuseur.h"

const char* const MMB_TYPE_ID     = "tp_mmb_diffuseur";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[] = { { "in", MMB_AUDIO, 0, {} }, { "mix_cv", MMB_CV, 0, {} } };
const int MMB_NUM_INPUTS = 2;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;
MmbControl MMB_CONTROLS[] = {
    { "type", 1.0f }, { "mix", 0.5f }, { "tune", 0.0f }, { "ring", 0.5f }, { "gong", 196.0f }, { "level", 1.0f },
};
const int MMB_NUM_CONTROLS = 6;

static const int kAudioIn[] = {0}, kCvIn[] = {1}, kAudioOut[] = {0}, kCvOut[] = {0};
MMB_KERNEL_HOST(mmb_dsp::Diffuseur, kAudioIn, 1, kCvIn, 1, kAudioOut, 1, kCvOut, 0)
