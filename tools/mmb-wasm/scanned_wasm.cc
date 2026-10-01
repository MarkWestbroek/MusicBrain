// tp_mmb_scanned — scanned synthesis: een traag bewegende massa-veerring,
// uitgelezen als golftabel. Gedeelde kern mmb_dsp/scanned_string.h, dezelfde
// als ScannedModule.h op de Teensy. 44,1 kHz, blok 32; CV samplegewijs.
#include "mmb_abi.h"
#include "mmb_dsp/scanned_string.h"

const char* const MMB_TYPE_ID = "tp_mmb_scanned";
const float MMB_NATIVE_RATE = 44100.0f;
const int MMB_BLOCK = 32;
MmbPort MMB_INPUTS[] = {
    {"in", MMB_AUDIO, 0, {}}, {"voct", MMB_CV, 0, {}},
    {"gate", MMB_GATE, 0, {}}, {"vel", MMB_CV, 0, {}},
    {"press", MMB_CV, 0, {}}, {"pos_cv", MMB_CV, 0, {}},
    {"reset", MMB_GATE, 0, {}},
};
const int MMB_NUM_INPUTS = 7;
MmbPort MMB_OUTPUTS[] = {
    {"out", MMB_AUDIO, 0, {}}, {"energy", MMB_CV, 0, {}},
};
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = {
    {"pitch", 0}, {"tension", 0.6f}, {"damping", 0.3f}, {"restore", 0.3f},
    {"speed", 0.15f}, {"position", 0.5f}, {"width", 0.3f}, {"level", 0.8f},
};
const int MMB_NUM_CONTROLS = 8;

namespace { mmb_dsp::ScannedString string; }
void mmb_setup() { string.Init(MMB_NATIVE_RATE); }
void mmb_on_control(int index, float value) { string.setControl(index, value); }
void mmb_process(int frames) {
    for (int sample = 0; sample < frames; ++sample) {
        string.setVoct(mmb_connected(1) ? MMB_INPUTS[1].buf[sample] : 0);
        string.setPositionCv(mmb_connected(5) ? MMB_INPUTS[5].buf[sample] : 0);
        string.Tick(mmb_connected(0) ? MMB_INPUTS[0].buf[sample] : 0,
                    MMB_INPUTS[2].buf[sample],
                    mmb_connected(3) ? MMB_INPUTS[3].buf[sample] : 1,
                    mmb_connected(4) ? MMB_INPUTS[4].buf[sample] : 0,
                    MMB_INPUTS[6].buf[sample], MMB_OUTPUTS[0].buf[sample]);
        MMB_OUTPUTS[1].buf[sample] = string.energy();
    }
}
