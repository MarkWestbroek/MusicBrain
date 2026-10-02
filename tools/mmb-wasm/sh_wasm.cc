// tp_mmb_sh — sample & hold / track & hold / slew. Draait
// SampleHoldModule.h zelf, de firmwareklasse, via de gedeelde CV-gastheer
// (cvhost.h). 1 kHz, blok 1.
#include "cvhost.h"
#include "SampleHoldModule.h"

const char* const MMB_TYPE_ID     = "tp_mmb_sh";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[]  = { { "in", MMB_CV, 0, {} }, { "trig", MMB_GATE, 0, {} } };
const int MMB_NUM_INPUTS = 2;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_CV, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;
MmbControl MMB_CONTROLS[] = { { "slew", 0.0f }, { "mode", 0.0f } };
const int MMB_NUM_CONTROLS = 2;

mb::runtime::Module* cvhost_make() { return new mmb_link::SampleHoldModule("sh"); }
