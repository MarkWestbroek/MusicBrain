// tp_mmb_ratchet — stapsequencer voor roffels (ratchets en triolen per stap).
// Draait RatchetModule.h zelf, de firmwareklasse, via de gedeelde
// CV-gastheer (cvhost.h). 1 kHz, blok 1. Plan: doc/plans/ratchet.md.
#include "cvhost.h"
#include "RatchetModule.h"

const char* const MMB_TYPE_ID     = "tp_mmb_ratchet";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[] = {
    { "clock", MMB_GATE, 0, {} }, { "reset", MMB_GATE, 0, {} }, { "ab", MMB_GATE, 0, {} },
    { "roll", MMB_GATE, 0, {} }, { "ratchet_cv", MMB_CV, 0, {} }, { "thru", MMB_GATE, 0, {} },
};
const int MMB_NUM_INPUTS = 6;
MmbPort MMB_OUTPUTS[] = {
    { "gate", MMB_GATE, 0, {} }, { "accent", MMB_CV, 0, {} }, { "pitch", MMB_CV, 0, {} },
    { "step", MMB_GATE, 0, {} },
};
const int MMB_NUM_OUTPUTS = 4;
MmbControl MMB_CONTROLS[] = {
    { "a_1", 1.0f }, { "a_2", 0.0f }, { "a_3", 1.0f }, { "a_4", 0.0f }, { "a_5", 1.0f }, { "a_6", 0.0f }, { "a_7", 1.0f }, { "a_8", 0.0f },
    { "a_9", 1.0f }, { "a_10", 0.0f }, { "a_11", 1.0f }, { "a_12", 0.0f }, { "a_13", 7.0f }, { "a_14", 0.0f }, { "a_15", 1.0f }, { "a_16", 2.0f },
    { "b_1", 0.0f }, { "b_2", 0.0f }, { "b_3", 0.0f }, { "b_4", 0.0f }, { "b_5", 0.0f }, { "b_6", 0.0f }, { "b_7", 0.0f }, { "b_8", 0.0f },
    { "b_9", 0.0f }, { "b_10", 0.0f }, { "b_11", 0.0f }, { "b_12", 0.0f }, { "b_13", 0.0f }, { "b_14", 0.0f }, { "b_15", 0.0f }, { "b_16", 0.0f },
    { "length", 16.0f }, { "base", 0.6f }, { "ramp", 0.4f }, { "sweep", 0.0f }, { "rollstand", 5.0f }, { "width", 50.0f },
};
const int MMB_NUM_CONTROLS = 38;

mb::runtime::Module* cvhost_make() { return new mmb_link::RatchetModule("ratchet"); }
