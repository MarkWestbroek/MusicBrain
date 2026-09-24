// tp_mmb_cvmath — CV-rekenmodule (som of product). Draait
// mb::runtime::CvMath zelf via cvhost.h. Die heeft geen tick: de uitgang
// wordt uitgerekend als hij gelezen wordt, net als op de Teensy.
#include "cvhost.h"
#include "mb/runtime/CvMath.h"

const char* const MMB_TYPE_ID     = "tp_mmb_cvmath";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[] = { { "a", MMB_CV, 0, {} }, { "b", MMB_CV, 0, {} }, { "c", MMB_CV, 0, {} } };
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_CV, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;
MmbControl MMB_CONTROLS[] = {
    { "mode", 0.0f }, { "gain_a", 1.0f }, { "gain_b", 1.0f }, { "gain_c", 1.0f }, { "offset", 0.0f },
};
const int MMB_NUM_CONTROLS = 5;

mb::runtime::Module* cvhost_make() { return new mb::runtime::CvMath("cvmath"); }
