// tp_mmb_ahdsr — de envelope. Draait mb::runtime::Ahdsr zelf, de core-klasse
// van de firmware, via cvhost.h (1 kHz, blok 1). Omdat cvhost een ingang
// alleen bij een nieuwe waarde schrijft, is elke 0→1 op `gate` precies één
// opgaande flank, zoals de CvGraph dat op de Teensy doet.
//
// `eoc` staat op het paneel maar bestaat niet in de firmware: hij geeft 0.
#define CVHOST_TOGGLES "loop", "retrig"
#include "cvhost.h"
#include "mb/runtime/Ahdsr.h"

const char* const MMB_TYPE_ID     = "tp_mmb_ahdsr";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[] = { { "gate", MMB_GATE, 0, {} }, { "trig", MMB_GATE, 0, {} } };
const int MMB_NUM_INPUTS = 2;
MmbPort MMB_OUTPUTS[] = { { "cv_out", MMB_CV, 0, {} }, { "eoc", MMB_GATE, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = {
    { "attack", 10.0f }, { "hold", 0.0f }, { "decay", 200.0f }, { "sustain", 0.7f },
    { "release", 300.0f }, { "loop", 0.0f }, { "retrig", 0.0f }, { "curve", 0.0f },
};
const int MMB_NUM_CONTROLS = 8;

mb::runtime::Module* cvhost_make() { return new mb::runtime::Ahdsr("env"); }
