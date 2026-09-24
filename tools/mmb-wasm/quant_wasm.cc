// tp_mmb_quant — CV-quantizer naar schaal. Draait QuantModule.h zelf, de
// firmwareklasse, via de gedeelde CV-gastheer (cvhost.h). 1 kHz, blok 1.
#include "cvhost.h"
#include "QuantModule.h"

const char* const MMB_TYPE_ID     = "tp_mmb_quant";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[]  = { { "in", MMB_CV, 0, {} } };
const int MMB_NUM_INPUTS = 1;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_CV, 0, {} }, { "trig", MMB_GATE, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = { { "scale", 1.0f }, { "root", 0.0f }, { "glide", 0.0f } };
const int MMB_NUM_CONTROLS = 3;

mb::runtime::CvModule* cvhost_make() { return new mmb_link::QuantModule("quant"); }
