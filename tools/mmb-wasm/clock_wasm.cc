// tp_mmb_clock — masterklok met delers, swing en maatzaag. Draait
// ClockModule.h zelf, de firmwareklasse, via de gedeelde CV-gastheer
// (cvhost.h). 1 kHz, blok 1.
#define CVHOST_TOGGLES "run"
#include "cvhost.h"
#include "ClockModule.h"

const char* const MMB_TYPE_ID     = "tp_mmb_clock";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[]  = { { "reset", MMB_GATE, 0, {} }, { "tempo_cv", MMB_CV, 0, {} } };
const int MMB_NUM_INPUTS = 2;
MmbPort MMB_OUTPUTS[] = {
    { "bar", MMB_GATE, 0, {} }, { "beat", MMB_GATE, 0, {} }, { "x2", MMB_GATE, 0, {} },
    { "x3", MMB_GATE, 0, {} }, { "x4", MMB_GATE, 0, {} }, { "div", MMB_GATE, 0, {} },
    { "ramp", MMB_CV, 0, {} },
};
const int MMB_NUM_OUTPUTS = 7;
MmbControl MMB_CONTROLS[] = {
    { "tempo", 120.0f }, { "swing", 0.0f }, { "width", 0.5f }, { "div", 6.0f }, { "run", 1.0f },
};
const int MMB_NUM_CONTROLS = 5;

mb::runtime::Module* cvhost_make() { return new mmb_link::ClockModule("clock"); }
