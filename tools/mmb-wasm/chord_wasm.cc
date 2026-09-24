// tp_mmb_chord — akkoord uit één V/Oct. Draait ChordModule.h zelf, de
// firmwareklasse, via de gedeelde CV-gastheer (cvhost.h). 1 kHz, blok 1.
#include "cvhost.h"
#include "ChordModule.h"

const char* const MMB_TYPE_ID     = "tp_mmb_chord";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[]  = { { "voct", MMB_CV, 0, {} } };
const int MMB_NUM_INPUTS = 1;
MmbPort MMB_OUTPUTS[] = {
    { "out1", MMB_CV, 0, {} }, { "out2", MMB_CV, 0, {} }, { "out3", MMB_CV, 0, {} }, { "out4", MMB_CV, 0, {} },
};
const int MMB_NUM_OUTPUTS = 4;
MmbControl MMB_CONTROLS[] = { { "chord", 0.0f }, { "inv", 0.0f }, { "spread", 0.0f } };
const int MMB_NUM_CONTROLS = 3;

mb::runtime::Module* cvhost_make() { return new mmb_link::ChordModule("chord"); }
