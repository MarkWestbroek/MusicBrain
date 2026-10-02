// tp_mmb_organ — tonewheel-orgel met trekstangen (spiegel van OrganModule.h;
// de DSP is mmb_dsp::Tonewheel, dezelfde header als de firmware). 44,1 kHz,
// blok 32. Twaalf stem-cellen: voct_1..12, gate_1..12.
#include "kernel_host.h"
#include "mmb_dsp/tonewheel.h"

const char* const MMB_TYPE_ID     = "tp_mmb_organ";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[] = {
    { "voct_1", MMB_CV, 0, {} }, { "voct_2", MMB_CV, 0, {} }, { "voct_3", MMB_CV, 0, {} }, { "voct_4", MMB_CV, 0, {} },
    { "voct_5", MMB_CV, 0, {} }, { "voct_6", MMB_CV, 0, {} }, { "voct_7", MMB_CV, 0, {} }, { "voct_8", MMB_CV, 0, {} },
    { "voct_9", MMB_CV, 0, {} }, { "voct_10", MMB_CV, 0, {} }, { "voct_11", MMB_CV, 0, {} }, { "voct_12", MMB_CV, 0, {} },
    { "gate_1", MMB_GATE, 0, {} }, { "gate_2", MMB_GATE, 0, {} }, { "gate_3", MMB_GATE, 0, {} }, { "gate_4", MMB_GATE, 0, {} },
    { "gate_5", MMB_GATE, 0, {} }, { "gate_6", MMB_GATE, 0, {} }, { "gate_7", MMB_GATE, 0, {} }, { "gate_8", MMB_GATE, 0, {} },
    { "gate_9", MMB_GATE, 0, {} }, { "gate_10", MMB_GATE, 0, {} }, { "gate_11", MMB_GATE, 0, {} }, { "gate_12", MMB_GATE, 0, {} },
    { "swell", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 25;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;
MmbControl MMB_CONTROLS[] = {
    { "d16", 8.0f }, { "d513", 8.0f }, { "d8", 8.0f }, { "d4", 0.0f }, { "d223", 0.0f },
    { "d2", 0.0f }, { "d135", 0.0f }, { "d113", 0.0f }, { "d1", 0.0f },
    { "perc", 0.0f }, { "perc_fast", 1.0f }, { "perc_soft", 0.0f }, { "vib", 0.0f },
    { "click", 0.4f }, { "leak", 0.3f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 16;

// De poorttabel staat al in de volgorde van de kernel: 12 x V/Oct, 12 x gate, swell.
static const int kAudioIn[] = {0}, kAudioOut[] = {0}, kCvOut[] = {0};
static const int kCvIn[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24};
MMB_KERNEL_HOST(mmb_dsp::Tonewheel, kAudioIn, 0, kCvIn, 25, kAudioOut, 1, kCvOut, 0)
