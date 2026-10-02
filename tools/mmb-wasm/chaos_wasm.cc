// tp_mmb_chaos — chaotische modulator (Lorenz, Rössler, Thomas). Draait
// ChaosModule.h zelf, de firmwareklasse, via de gedeelde CV-gastheer
// (cvhost.h). 1 kHz, blok 1.
#define CVHOST_TOGGLES "bipolar"
#include "cvhost.h"
#include "ChaosModule.h"

const char* const MMB_TYPE_ID     = "tp_mmb_chaos";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[]  = { { "rate_cv", MMB_CV, 0, {} }, { "reset", MMB_GATE, 0, {} } };
const int MMB_NUM_INPUTS = 2;
MmbPort MMB_OUTPUTS[] = {
    { "x", MMB_CV, 0, {} }, { "y", MMB_CV, 0, {} }, { "z", MMB_CV, 0, {} }, { "gate", MMB_GATE, 0, {} },
};
const int MMB_NUM_OUTPUTS = 4;
MmbControl MMB_CONTROLS[] = {
    { "rate", 0.2f }, { "model", 0.0f }, { "shape", 0.3f }, { "depth", 1.0f },
    { "rate_cv_amt", 1.0f }, { "bipolar", 1.0f },
};
const int MMB_NUM_CONTROLS = 6;

mb::runtime::Module* cvhost_make() { return new mmb_link::ChaosModule("chaos"); }
