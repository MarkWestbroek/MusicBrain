// tp_mmb_gendyn — dynamische stochastische synthese (Xenakis): breekpunten
// die per cyclus een begrensde random walk in amplitude en duur maken.
// Gedeelde kern mmb_dsp/gendyn.h, dezelfde als GendynModule.h op de Teensy.
#include "mmb_abi.h"
#include "mmb_dsp/gendyn.h"

const char* const MMB_TYPE_ID = "tp_mmb_gendyn";
const float MMB_NATIVE_RATE = 44100.0f;
const int MMB_BLOCK = 32;
MmbPort MMB_INPUTS[] = {
    {"voct", MMB_CV, 0, {}}, {"gate", MMB_GATE, 0, {}},
    {"chaos_cv", MMB_CV, 0, {}}, {"reset", MMB_GATE, 0, {}},
};
const int MMB_NUM_INPUTS = 4;
MmbPort MMB_OUTPUTS[] = {
    {"out", MMB_AUDIO, 0, {}}, {"cycle", MMB_GATE, 0, {}},
};
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = {
    {"pitch", 0}, {"points", 12}, {"amp_step", 0.3f}, {"dur_step", 0.3f},
    {"dist", 0.3f}, {"smooth", 0.5f}, {"settle", 0.1f}, {"seed", 1}, {"level", 0.8f},
};
const int MMB_NUM_CONTROLS = 9;

namespace { mmb_dsp::Gendyn gendyn; }
void mmb_setup() { gendyn.Init(MMB_NATIVE_RATE); }
void mmb_on_control(int index, float value) { gendyn.setControl(index, value); }
void mmb_process(int frames) {
    for (int sample = 0; sample < frames; ++sample) {
        gendyn.setVoct(mmb_connected(0) ? MMB_INPUTS[0].buf[sample] : 0);
        gendyn.setChaosCv(mmb_connected(2) ? MMB_INPUTS[2].buf[sample] : 0);
        gendyn.Tick(MMB_INPUTS[1].buf[sample], MMB_INPUTS[3].buf[sample],
                    MMB_OUTPUTS[0].buf[sample], MMB_OUTPUTS[1].buf[sample]);
    }
}
