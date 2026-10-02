// tp_mmb_branches — Bernoulli-gate (muntworp per trigger). Draait
// BranchesModule.h zelf, de firmwareklasse, via de gedeelde CV-gastheer
// (cvhost.h). 1 kHz, blok 1.
#define CVHOST_TOGGLES "toggle", "latch"
#include "cvhost.h"
#include "BranchesModule.h"

const char* const MMB_TYPE_ID     = "tp_mmb_branches";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[]  = { { "in", MMB_GATE, 0, {} }, { "p_cv", MMB_CV, 0, {} } };
const int MMB_NUM_INPUTS = 2;
MmbPort MMB_OUTPUTS[] = { { "a", MMB_GATE, 0, {} }, { "b", MMB_GATE, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = { { "p", 0.5f }, { "toggle", 0.0f }, { "latch", 0.0f } };
const int MMB_NUM_CONTROLS = 3;

mb::runtime::Module* cvhost_make() { return new mmb_link::BranchesModule("branches"); }
