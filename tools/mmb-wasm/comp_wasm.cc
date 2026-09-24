// tp_mmb_comp — feed-forward piekcompressor met tanh-overdrive (spiegel van
// CompDriveModule.h; de DSP is mmb_dsp::CompDrive, dezelfde header als de
// firmware — daar in september 2026 uit de module getild, bit-identiek).
// Native 44,1 kHz, blok 32.
#include "mmb_abi.h"
#include "mmb_dsp/comp_drive.h"

const char* const MMB_TYPE_ID     = "tp_mmb_comp";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_AUDIO, IN_THR, IN_DRIVE };
MmbPort MMB_INPUTS[] = {
    { "in", MMB_AUDIO, 0, {} }, { "thr_cv", MMB_CV, 0, {} }, { "drive_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_THRESHOLD, C_RATIO, C_ATTACK, C_RELEASE, C_MAKEUP, C_DRIVE };
MmbControl MMB_CONTROLS[] = {
    { "threshold", -18.0f }, { "ratio", 4.0f }, { "attack", 10.0f },
    { "release", 120.0f }, { "makeup", 0.0f }, { "drive", 0.2f },
};
const int MMB_NUM_CONTROLS = 6;

namespace {
mmb_dsp::CompDrive g_comp;
float g_knobThr = -18.0f, g_knobDrive = 0.2f;
}  // namespace

void mmb_setup() {
    g_comp.Init(MMB_NATIVE_RATE);
    // Zoals de module-constructor: zonder deze twee zijn de coëfficiënten 0.
    g_comp.attack(10.0f);
    g_comp.releaseTime(120.0f);
}

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_THRESHOLD: g_knobThr = v; break;
        case C_RATIO:     g_comp.ratio(v); break;
        case C_ATTACK:    g_comp.attack(v); break;
        case C_RELEASE:   g_comp.releaseTime(v); break;
        case C_MAKEUP:    g_comp.makeup(v); break;
        case C_DRIVE:     g_knobDrive = v; break;
    }
}

void mmb_process(int frames) {
    // Letterlijk de firmware: thr_cv zet de drempel op de CV-wáárde in dB,
    // dus een CV van 0..1 geeft een drempel van 0..1 dB. Dat lijkt een
    // slordigheid (zie de todo), maar het is hardwaregedrag.
    g_comp.threshold(mmb_connected(IN_THR) ? mmb_in0(IN_THR) : g_knobThr);
    g_comp.drive(mmb_connected(IN_DRIVE) ? mmb_in0(IN_DRIVE) : g_knobDrive);
    for (int k = 0; k < frames; ++k) MMB_OUTPUTS[0].buf[k] = g_comp.Tick(MMB_INPUTS[IN_AUDIO].buf[k]);
}
