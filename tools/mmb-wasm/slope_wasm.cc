// tp_mmb_slope — functiegenerator (stijg/daal apart, kromming, cycle).
// Draait SlopeModule.h zelf, de firmwareklasse, via de gedeelde CV-gastheer
// (cvhost.h). 1 kHz, blok 1.
#define CVHOST_TOGGLES "cycle"
#include "cvhost.h"
#include "SlopeModule.h"

const char* const MMB_TYPE_ID     = "tp_mmb_slope";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[] = {
    { "in", MMB_CV, 0, {} }, { "trig", MMB_GATE, 0, {} }, { "time_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = {
    { "out", MMB_CV, 0, {} }, { "inv", MMB_CV, 0, {} }, { "eor", MMB_GATE, 0, {} }, { "eoc", MMB_GATE, 0, {} },
};
const int MMB_NUM_OUTPUTS = 4;
MmbControl MMB_CONTROLS[] = {
    { "rise", 0.05f }, { "fall", 0.5f }, { "shape", 0.0f }, { "cycle", 0.0f },
};
const int MMB_NUM_CONTROLS = 4;

mb::runtime::Module* cvhost_make() { return new mmb_link::SlopeModule("slope"); }
