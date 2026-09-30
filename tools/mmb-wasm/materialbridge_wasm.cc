#include "mmb_abi.h"
#include "mmb_dsp/material_bridge.h"

const char* const MMB_TYPE_ID = "tp_mmb_material_bridge";
const float MMB_NATIVE_RATE = 44100.0f;
const int MMB_BLOCK = 32;
MmbPort MMB_INPUTS[] = {
    {"in", MMB_AUDIO, 0, {}}, {"voct", MMB_CV, 0, {}},
    {"gate", MMB_GATE, 0, {}}, {"gate_b", MMB_GATE, 0, {}},
    {"vel", MMB_CV, 0, {}}, {"reset", MMB_GATE, 0, {}},
    {"coupling_cv", MMB_CV, 0, {}}, {"pickup_cv", MMB_CV, 0, {}},
};
const int MMB_NUM_INPUTS = 8;
MmbPort MMB_OUTPUTS[] = {
    {"out_l", MMB_AUDIO, 0, {}}, {"out_r", MMB_AUDIO, 0, {}},
    {"stress", MMB_CV, 0, {}},
};
const int MMB_NUM_OUTPUTS = 3;
MmbControl MMB_CONTROLS[] = {
    {"pitch", 0}, {"spread", 0.35f}, {"coupling", 0.5f}, {"decay", 2},
    {"memory", 0.7f}, {"recovery", 2}, {"pickup", 0.25f}, {"level", 0.8f},
};
const int MMB_NUM_CONTROLS = 8;

namespace { mmb_dsp::MaterialBridge bridge; }
void mmb_setup() { bridge.Init(MMB_NATIVE_RATE); }
void mmb_on_control(int index, float value) { bridge.setControl(index, value); }
void mmb_process(int frames) {
    for (int sample = 0; sample < frames; ++sample) {
        bridge.setVoct(mmb_connected(1) ? MMB_INPUTS[1].buf[sample] : 0);
        bridge.setModulation(mmb_connected(6) ? MMB_INPUTS[6].buf[sample] : 0,
                     mmb_connected(7) ? MMB_INPUTS[7].buf[sample] : 0);
        bridge.Tick(mmb_connected(0) ? MMB_INPUTS[0].buf[sample] : 0,
                    MMB_INPUTS[2].buf[sample], MMB_INPUTS[3].buf[sample],
                    mmb_connected(4) ? MMB_INPUTS[4].buf[sample] : 1,
                    MMB_INPUTS[5].buf[sample], MMB_OUTPUTS[0].buf[sample], MMB_OUTPUTS[1].buf[sample]);
        MMB_OUTPUTS[2].buf[sample] = bridge.stress();
    }
}