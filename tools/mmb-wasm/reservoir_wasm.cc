// tp_mmb_reservoir — resource-coupled synthesis: een eindige, herstellende
// bron voor vier stemmen. Draait ReservoirModule.h zelf, de firmwareklasse,
// via de gedeelde CV-gastheer (cvhost.h). 1 kHz, blok 1.
#include "cvhost.h"
#include "ReservoirModule.h"

const char* const MMB_TYPE_ID     = "tp_mmb_reservoir";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[] = {
    { "in_a", MMB_CV, 0, {} }, { "in_b", MMB_CV, 0, {} }, { "in_c", MMB_CV, 0, {} }, { "in_d", MMB_CV, 0, {} },
    { "refill", MMB_CV, 0, {} }, { "reset", MMB_GATE, 0, {} },
};
const int MMB_NUM_INPUTS = 6;
MmbPort MMB_OUTPUTS[] = {
    { "out_a", MMB_CV, 0, {} }, { "out_b", MMB_CV, 0, {} }, { "out_c", MMB_CV, 0, {} }, { "out_d", MMB_CV, 0, {} },
    { "level", MMB_CV, 0, {} }, { "starve", MMB_CV, 0, {} }, { "empty", MMB_GATE, 0, {} },
};
const int MMB_NUM_OUTPUTS = 7;
MmbControl MMB_CONTROLS[] = {
    { "drain", 0.5f }, { "recover", 2.0f }, { "floor", 0.1f }, { "curve", 1.0f }, { "thresh", 0.15f },
};
const int MMB_NUM_CONTROLS = 5;

mb::runtime::Module* cvhost_make() { return new mmb_link::ReservoirModule("reservoir"); }
