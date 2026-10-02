// tp_mmb_epiano — elektrische piano, tine of reed voor een pickup (spiegel van
// EPianoModule.h; de DSP is mmb_dsp::EPiano, dezelfde header als de
// firmware). 44,1 kHz, blok 32. Twaalf stem-cellen: voct, vel, gate.
#include "kernel_host.h"
#include "mmb_dsp/epiano.h"

const char* const MMB_TYPE_ID     = "tp_mmb_epiano";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

// In de volgorde van de kernel: 12 x V/Oct, 12 x velocity, 12 x gate.
MmbPort MMB_INPUTS[] = {
    { "voct_1", MMB_CV, 0, {} },
    { "voct_2", MMB_CV, 0, {} },
    { "voct_3", MMB_CV, 0, {} },
    { "voct_4", MMB_CV, 0, {} },
    { "voct_5", MMB_CV, 0, {} },
    { "voct_6", MMB_CV, 0, {} },
    { "voct_7", MMB_CV, 0, {} },
    { "voct_8", MMB_CV, 0, {} },
    { "voct_9", MMB_CV, 0, {} },
    { "voct_10", MMB_CV, 0, {} },
    { "voct_11", MMB_CV, 0, {} },
    { "voct_12", MMB_CV, 0, {} },
    { "vel_1", MMB_CV, 0, {} },
    { "vel_2", MMB_CV, 0, {} },
    { "vel_3", MMB_CV, 0, {} },
    { "vel_4", MMB_CV, 0, {} },
    { "vel_5", MMB_CV, 0, {} },
    { "vel_6", MMB_CV, 0, {} },
    { "vel_7", MMB_CV, 0, {} },
    { "vel_8", MMB_CV, 0, {} },
    { "vel_9", MMB_CV, 0, {} },
    { "vel_10", MMB_CV, 0, {} },
    { "vel_11", MMB_CV, 0, {} },
    { "vel_12", MMB_CV, 0, {} },
    { "gate_1", MMB_GATE, 0, {} },
    { "gate_2", MMB_GATE, 0, {} },
    { "gate_3", MMB_GATE, 0, {} },
    { "gate_4", MMB_GATE, 0, {} },
    { "gate_5", MMB_GATE, 0, {} },
    { "gate_6", MMB_GATE, 0, {} },
    { "gate_7", MMB_GATE, 0, {} },
    { "gate_8", MMB_GATE, 0, {} },
    { "gate_9", MMB_GATE, 0, {} },
    { "gate_10", MMB_GATE, 0, {} },
    { "gate_11", MMB_GATE, 0, {} },
    { "gate_12", MMB_GATE, 0, {} },
};
const int MMB_NUM_INPUTS = 36;
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = {
    { "type", 0.0f }, { "timbre", 0.35f }, { "bell", 0.5f }, { "decay", 0.5f },
    { "drive", 0.4f }, { "tremolo", 0.3f }, { "trem_rate", 4.5f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 8;

static const int kAudioIn[] = {0}, kAudioOut[] = {0, 1}, kCvOut[] = {0};
static const int kCvIn[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35};
MMB_KERNEL_HOST(mmb_dsp::EPiano, kAudioIn, 0, kCvIn, 36, kAudioOut, 2, kCvOut, 0)
