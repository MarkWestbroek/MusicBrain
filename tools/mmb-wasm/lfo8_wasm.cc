// tp_mmb_lfo8 — acht vrijlopende, verwante LFO's op één knop. Draait
// Lfo8Module.h zelf, de firmwareklasse, via de gedeelde CV-gastheer
// (cvhost.h). 1 kHz, blok 1.
#define CVHOST_TOGGLES "bipolar"
#include "cvhost.h"
#include "Lfo8Module.h"

const char* const MMB_TYPE_ID     = "tp_mmb_lfo8";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[]  = { { "rate_cv", MMB_CV, 0, {} }, { "reset", MMB_GATE, 0, {} } };
const int MMB_NUM_INPUTS = 2;
MmbPort MMB_OUTPUTS[] = {
    { "out_1", MMB_CV, 0, {} }, { "out_2", MMB_CV, 0, {} }, { "out_3", MMB_CV, 0, {} }, { "out_4", MMB_CV, 0, {} },
    { "out_5", MMB_CV, 0, {} }, { "out_6", MMB_CV, 0, {} }, { "out_7", MMB_CV, 0, {} }, { "out_8", MMB_CV, 0, {} },
};
const int MMB_NUM_OUTPUTS = 8;
MmbControl MMB_CONTROLS[] = {
    { "rate", 1.0f }, { "spread", 1.6f }, { "shape", 0.0f }, { "depth", 1.0f }, { "bipolar", 1.0f },
};
const int MMB_NUM_CONTROLS = 5;

mb::runtime::Module* cvhost_make() { return new mmb_link::Lfo8Module("lfo8"); }
