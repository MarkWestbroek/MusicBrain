// tp_mmb_faders — handbediende CV-bron: vier schuiven (0..1). Draait
// ManualCvModule.h zelf, de firmwareklasse, via de gedeelde CV-gastheer
// (cvhost.h). 1 kHz, blok 1.
#include "cvhost.h"
#include "ManualCvModule.h"

const char* const MMB_TYPE_ID     = "tp_mmb_faders";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[] = { { "", MMB_CV, 0, {} } };
const int MMB_NUM_INPUTS = 0;
MmbPort MMB_OUTPUTS[] = {
    { "out_1", MMB_CV, 0, {} }, { "out_2", MMB_CV, 0, {} }, { "out_3", MMB_CV, 0, {} }, { "out_4", MMB_CV, 0, {} },
};
const int MMB_NUM_OUTPUTS = 4;
MmbControl MMB_CONTROLS[] = {
    { "v1", 0.0f }, { "v2", 0.0f }, { "v3", 0.0f }, { "v4", 0.0f }, { "range", 0.0f }, { "slew", 10.0f },
};
const int MMB_NUM_CONTROLS = 6;

mb::runtime::Module* cvhost_make() { return new mmb_link::FadersModule("faders"); }
