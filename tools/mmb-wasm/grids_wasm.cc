// tp_mmb_grids — topografische drumsequencer. Draait GridsModule.h zelf, de
// firmwareklasse, via de gedeelde CV-gastheer (cvhost.h). 1 kHz, blok 1.
#include "cvhost.h"
#include "GridsModule.h"

const char* const MMB_TYPE_ID     = "tp_mmb_grids";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[] = {
    { "clock", MMB_GATE, 0, {} }, { "reset", MMB_GATE, 0, {} },
    { "x_cv", MMB_CV, 0, {} }, { "y_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
MmbPort MMB_OUTPUTS[] = {
    { "bd", MMB_GATE, 0, {} }, { "sd", MMB_GATE, 0, {} }, { "hh", MMB_GATE, 0, {} }, { "acc", MMB_GATE, 0, {} },
};
const int MMB_NUM_OUTPUTS = 4;
MmbControl MMB_CONTROLS[] = {
    { "x", 0.5f }, { "y", 0.5f }, { "bd", 0.75f }, { "sd", 0.6f },
    { "hh", 0.7f }, { "chaos", 0.0f }, { "tempo", 120.0f }, { "extclock", 0.0f },
};
const int MMB_NUM_CONTROLS = 8;

mb::runtime::CvModule* cvhost_make() { return new mmb_link::GridsModule("grids"); }
