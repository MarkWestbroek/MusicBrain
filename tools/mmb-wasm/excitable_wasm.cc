// tp_mmb_excitable — excitable-media synthesis: raster van prikkelbare
// cellen met twee pacemakers en twee pickups. Gedeelde kern
// mmb_dsp/excitable.h, dezelfde als ExcitableModule.h op de Teensy.
#include "mmb_abi.h"
#include "mmb_dsp/excitable.h"

const char* const MMB_TYPE_ID = "tp_mmb_excitable";
const float MMB_NATIVE_RATE = 44100.0f;
const int MMB_BLOCK = 32;
MmbPort MMB_INPUTS[] = {
    {"voct", MMB_CV, 0, {}}, {"gate", MMB_GATE, 0, {}},
    {"voct_b", MMB_CV, 0, {}}, {"gate_b", MMB_GATE, 0, {}},
    {"reset", MMB_GATE, 0, {}},
};
const int MMB_NUM_INPUTS = 5;
MmbPort MMB_OUTPUTS[] = {
    {"out_l", MMB_AUDIO, 0, {}}, {"out_r", MMB_AUDIO, 0, {}}, {"activity", MMB_CV, 0, {}},
};
const int MMB_NUM_OUTPUTS = 3;
MmbControl MMB_CONTROLS[] = {
    {"pitch", 0}, {"detune", 7}, {"excite", 3}, {"refract", 12},
    {"thresh", 1}, {"speed", 2}, {"pickup", 0.4f}, {"level", 0.8f},
};
const int MMB_NUM_CONTROLS = 8;

namespace { mmb_dsp::ExcitableMedium medium; }
void mmb_setup() { medium.Init(MMB_NATIVE_RATE); }
void mmb_on_control(int index, float value) { medium.setControl(index, value); }
void mmb_process(int frames) {
    for (int sample = 0; sample < frames; ++sample) {
        medium.setVoct(mmb_connected(0) ? MMB_INPUTS[0].buf[sample] : 0);
        medium.setVoctB(mmb_connected(2) ? MMB_INPUTS[2].buf[sample] : 0);
        medium.Tick(MMB_INPUTS[1].buf[sample], MMB_INPUTS[3].buf[sample], MMB_INPUTS[4].buf[sample],
                    MMB_OUTPUTS[0].buf[sample], MMB_OUTPUTS[1].buf[sample]);
        MMB_OUTPUTS[2].buf[sample] = medium.activity();
    }
}
