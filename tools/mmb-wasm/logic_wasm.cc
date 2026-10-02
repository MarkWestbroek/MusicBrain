// tp_mmb_logic — CV-gereedschap: min/max, logica, vergelijker, gelijkrichter.
// Draait LogicModule.h zelf, de firmwareklasse, via de gedeelde CV-gastheer
// (cvhost.h). 1 kHz, blok 1.
#include "cvhost.h"
#include "LogicModule.h"

const char* const MMB_TYPE_ID     = "tp_mmb_logic";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[]  = { { "a", MMB_CV, 0, {} }, { "b", MMB_CV, 0, {} } };
const int MMB_NUM_INPUTS = 2;
MmbPort MMB_OUTPUTS[] = {
    { "min", MMB_CV, 0, {} }, { "max", MMB_CV, 0, {} },
    { "and", MMB_GATE, 0, {} }, { "or", MMB_GATE, 0, {} }, { "xor", MMB_GATE, 0, {} }, { "gt", MMB_GATE, 0, {} },
    { "abs", MMB_CV, 0, {} }, { "inv", MMB_CV, 0, {} },
};
const int MMB_NUM_OUTPUTS = 8;
MmbControl MMB_CONTROLS[] = { { "thresh", 0.5f } };
const int MMB_NUM_CONTROLS = 1;

mb::runtime::Module* cvhost_make() { return new mmb_link::LogicModule("logic"); }
