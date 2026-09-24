// tp_mmb_seq8 — de 16-staps CV/gate-sequencer. Draait mb::runtime::Seq16
// zelf via cvhost.h (1 kHz, blok 1). `mmb_telemetry()` geeft de huidige stap
// (0-based) terug; de worklet meldt die bij verandering aan de editor, voor
// de stap-lampjes op het paneel.
#include "cvhost.h"
#include "mb/runtime/Seq16.h"

const char* const MMB_TYPE_ID     = "tp_mmb_seq8";
const float       MMB_NATIVE_RATE = 1000.0f;
const int         MMB_BLOCK       = 1;

MmbPort MMB_INPUTS[] = {
    { "clock", MMB_GATE, 0, {} }, { "reset", MMB_GATE, 0, {} },
    { "voct_in", MMB_CV, 0, {} }, { "run_in", MMB_GATE, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
MmbPort MMB_OUTPUTS[] = {
    { "cv", MMB_CV, 0, {} }, { "gate_out", MMB_GATE, 0, {} }, { "trig", MMB_GATE, 0, {} },
};
const int MMB_NUM_OUTPUTS = 3;
MmbControl MMB_CONTROLS[] = {
    { "s1", 0.0f }, { "s2", 0.0f }, { "s3", 0.0f }, { "s4", 0.0f },
    { "s5", 0.0f }, { "s6", 0.0f }, { "s7", 0.0f }, { "s8", 0.0f },
    { "s9", 0.0f }, { "s10", 0.0f }, { "s11", 0.0f }, { "s12", 0.0f },
    { "s13", 0.0f }, { "s14", 0.0f }, { "s15", 0.0f }, { "s16", 0.0f },
    { "root", 60.0f }, { "rate", 4.0f }, { "gate", 0.5f }, { "length", 8.0f }, { "run", 0.0f },
};
const int MMB_NUM_CONTROLS = 21;

mb::runtime::Module* cvhost_make() { return new mb::runtime::Seq16("seq"); }

MMB_EXPORT(mmb_telemetry) float mmb_telemetry() {
    return g_cvmod ? static_cast<float>(static_cast<mb::runtime::Seq16*>(g_cvmod)->currentStep()) : 0.0f;
}
