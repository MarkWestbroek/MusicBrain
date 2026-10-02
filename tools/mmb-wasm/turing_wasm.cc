// tp_mmb_turing — schuifregister-sequencer (een lus die langzaam verandert).
// Draait TuringModule.h zelf, de firmwareklasse, via de gedeelde CV-gastheer
// (cvhost.h). 1 kHz, blok 1.
#define CVHOST_TOGGLES "extclock"
#include "cvhost.h"
#include "TuringModule.h"

const char* const MMB_TYPE_ID     = "tp_mmb_turing";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[] = {
    { "clock", MMB_GATE, 0, {} }, { "reset", MMB_GATE, 0, {} }, { "change_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = {
    { "cv", MMB_CV, 0, {} }, { "cv2", MMB_CV, 0, {} },
    { "pulse", MMB_GATE, 0, {} }, { "pulse2", MMB_GATE, 0, {} },
};
const int MMB_NUM_OUTPUTS = 4;
MmbControl MMB_CONTROLS[] = {
    { "change", 0.1f }, { "length", 8.0f }, { "range", 2.0f }, { "tempo", 120.0f }, { "extclock", 0.0f },
};
const int MMB_NUM_CONTROLS = 5;

mb::runtime::Module* cvhost_make() { return new mmb_link::TuringModule("turing"); }
