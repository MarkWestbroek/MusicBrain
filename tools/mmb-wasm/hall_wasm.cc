// tp_mmb_hall — HALL, grote galm in Lexicon-stijl (spiegel van HallModule.h;
// de DSP is mmb_dsp::Hall, dezelfde header als de firmware). 44,1 kHz, blok 32.
#include "kernel_host.h"
#include "mmb_dsp/hall.h"

const char* const MMB_TYPE_ID     = "tp_mmb_hall";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[] = {
    { "in_l", MMB_AUDIO, 0, {} }, { "in_r", MMB_AUDIO, 0, {} },
    { "size_cv", MMB_CV, 0, {} }, { "decay_cv", MMB_CV, 0, {} }, { "mix_cv", MMB_CV, 0, {} },
    { "freeze", MMB_GATE, 0, {} },
};
const int MMB_NUM_INPUTS = 6;
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = {
    { "algo", 0.f }, { "size", 0.6f }, { "decay", 2.5f }, { "predelay", 20.f }, { "early", 0.5f },
    { "diffusion", 0.85f }, { "hidamp", 0.4f }, { "lomult", 1.2f }, { "mod", 0.4f }, { "width", 1.f },
    { "mix", 0.3f }, { "freeze_btn", 0.f },
};
const int MMB_NUM_CONTROLS = 12;

static const int kAudioIn[] = {0, 1}, kCvIn[] = {2, 3, 4, 5}, kAudioOut[] = {0, 1}, kCvOut[] = {0};
MMB_KERNEL_HOST(mmb_dsp::Hall, kAudioIn, 2, kCvIn, 4, kAudioOut, 2, kCvOut, 0)
