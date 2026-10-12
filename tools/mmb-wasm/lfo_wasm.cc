// tp_mmb_lfo — de interne LFO. Draait mb::runtime::Lfo zelf, de core-klasse
// van de firmware, via de gedeelde CV-gastheer (cvhost.h). 1 kHz, blok 1:
// net als op de Teensy tikt hij op de CV-klok, dus een snelle LFO wordt ook
// hier een trapje van 1 ms.
//
// `gate` stuurt de run-modes Gated en OneShot (sinds 2026-10-12 ook op het
// paneel; daarvoor ontbrak de ingang en wachtten die modes op niets).
#define CVHOST_TOGGLES "bipolar"
#include "cvhost.h"
#include "mb/runtime/Lfo.h"

const char* const MMB_TYPE_ID     = "tp_mmb_lfo";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[] = { { "rate_cv", MMB_CV, 0, {} }, { "gate", MMB_GATE, 0, {} }, { "reset", MMB_GATE, 0, {} } };
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_CV, 0, {} }, { "out_inv", MMB_CV, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = {
    { "rate", 1.0f }, { "wave", 0.0f }, { "depth", 1.0f }, { "bipolar", 1.0f }, { "run", 0.0f },
    { "rate_cv_amt", 1.0f },
};
const int MMB_NUM_CONTROLS = 6;

mb::runtime::Module* cvhost_make() { return new mb::runtime::Lfo("lfo"); }
