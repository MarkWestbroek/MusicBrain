// tp_mmb_vcswitch — VC SWITCH (dubbele A/B-schakelaar, CV). Draait
// VcSwitchModule.h zelf via de gedeelde CV-gastheer (cvhost.h). 1 kHz, blok 1.
#define CVHOST_TOGGLES "manual"
#include "cvhost.h"
#include "VcSwitchModule.h"

const char* const MMB_TYPE_ID     = "tp_mmb_vcswitch";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[] = {
    { "a1", MMB_CV, 0, {} }, { "b1", MMB_CV, 0, {} }, { "a2", MMB_CV, 0, {} }, { "b2", MMB_CV, 0, {} },
    { "sel", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 5;
MmbPort MMB_OUTPUTS[] = { { "out1", MMB_CV, 0, {} }, { "out2", MMB_CV, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = { { "glide", 5.0f }, { "mode", 0.0f }, { "manual", 0.0f } };
const int MMB_NUM_CONTROLS = 3;

mb::runtime::Module* cvhost_make() { return new mmb_link::VcSwitchModule("vcswitch"); }
