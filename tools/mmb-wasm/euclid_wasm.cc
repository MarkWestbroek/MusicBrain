// tp_mmb_euclid — Euclidische ritmegenerator, drie kanalen. Draait
// EuclidModule.h zelf, de firmwareklasse, via de gedeelde CV-gastheer
// (cvhost.h). 1 kHz, blok 1.
#define CVHOST_TOGGLES "extclock"
#include "cvhost.h"
#include "EuclidModule.h"

const char* const MMB_TYPE_ID     = "tp_mmb_euclid";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[] = {
    { "clock", MMB_GATE, 0, {} }, { "reset", MMB_GATE, 0, {} },
    { "fill_1_cv", MMB_CV, 0, {} }, { "fill_2_cv", MMB_CV, 0, {} }, { "fill_3_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 5;
MmbPort MMB_OUTPUTS[] = {
    { "out_1", MMB_GATE, 0, {} }, { "out_2", MMB_GATE, 0, {} }, { "out_3", MMB_GATE, 0, {} },
    { "any", MMB_GATE, 0, {} },
};
const int MMB_NUM_OUTPUTS = 4;
MmbControl MMB_CONTROLS[] = {
    { "steps_1", 16.0f }, { "fill_1", 4.0f }, { "rot_1", 0.0f },
    { "steps_2", 16.0f }, { "fill_2", 3.0f }, { "rot_2", 4.0f },
    { "steps_3", 16.0f }, { "fill_3", 5.0f }, { "rot_3", 2.0f },
    { "tempo", 120.0f }, { "extclock", 0.0f },
};
const int MMB_NUM_CONTROLS = 11;

mb::runtime::Module* cvhost_make() { return new mmb_link::EuclidModule("euclid"); }
