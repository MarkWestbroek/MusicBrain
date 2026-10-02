// tp_mmb_pads — vier drukknoppen met gate- en trigger-uitgangen. Draait
// PadsModule.h zelf, de firmwareklasse, via de gedeelde CV-gastheer
// (cvhost.h). 1 kHz, blok 1.
#define CVHOST_TOGGLES "b1", "b2", "b3", "b4", "latch1", "latch2", "latch3", "latch4"
#include "cvhost.h"
#include "PadsModule.h"

const char* const MMB_TYPE_ID     = "tp_mmb_pads";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[] = { { "", MMB_CV, 0, {} } };
const int MMB_NUM_INPUTS = 0;
MmbPort MMB_OUTPUTS[] = {
    { "gate_1", MMB_GATE, 0, {} }, { "gate_2", MMB_GATE, 0, {} }, { "gate_3", MMB_GATE, 0, {} }, { "gate_4", MMB_GATE, 0, {} },
    { "trig_1", MMB_GATE, 0, {} }, { "trig_2", MMB_GATE, 0, {} }, { "trig_3", MMB_GATE, 0, {} }, { "trig_4", MMB_GATE, 0, {} },
    { "any", MMB_GATE, 0, {} },
};
const int MMB_NUM_OUTPUTS = 9;
MmbControl MMB_CONTROLS[] = {
    { "b1", 0.0f }, { "b2", 0.0f }, { "b3", 0.0f }, { "b4", 0.0f },
    { "latch1", 0.0f }, { "latch2", 0.0f }, { "latch3", 0.0f }, { "latch4", 0.0f },
};
const int MMB_NUM_CONTROLS = 8;

mb::runtime::Module* cvhost_make() { return new mmb_link::PadsModule("pads"); }
