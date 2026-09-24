// tp_mmb_stereo_vca — stereo-VCA met equal-power panning (spiegel van
// StereoVcaModule.h). In de firmware drie `AudioAmplifier`s: een fan-out en
// twee versterkingen, links vol·cos θ en rechts vol·sin θ met
// θ = (pan + 1)·π/4. Dat is alles, dus dat staat hier. Native 44,1 kHz,
// blok 32.
#include <cmath>

#include "mmb_abi.h"

const char* const MMB_TYPE_ID     = "tp_mmb_stereo_vca";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_AUDIO, IN_VOL, IN_PAN };
MmbPort MMB_INPUTS[] = {
    { "in", MMB_AUDIO, 0, {} }, { "vol_cv", MMB_CV, 0, {} }, { "pan_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 3;
enum { OUT_L, OUT_R };
MmbPort MMB_OUTPUTS[] = { { "l", MMB_AUDIO, 0, {} }, { "r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

enum { C_VOL, C_PAN };
MmbControl MMB_CONTROLS[] = { { "vol", 0.8f }, { "pan", 0.0f } };
const int MMB_NUM_CONTROLS = 2;

namespace {
float g_knobVol = 0.8f, g_knobPan = 0.0f;
float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
}  // namespace

void mmb_setup() {}

void mmb_on_control(int idx, float v) {
    if (idx == C_VOL) g_knobVol = clampf(v, 0.0f, 1.0f);
    else if (idx == C_PAN) g_knobPan = clampf(v, -1.0f, 1.0f);
}

void mmb_process(int frames) {
    // In de firmware overschrijft de CV de knop (writeCvPort zet vol_/pan_);
    // hier volgens de mmb-wasm-conventie alleen zolang de kabel erin zit.
    const float vol = mmb_connected(IN_VOL) ? clampf(mmb_in0(IN_VOL), 0.0f, 1.0f) : g_knobVol;
    const float pan = mmb_connected(IN_PAN) ? clampf(mmb_in0(IN_PAN), -1.0f, 1.0f) : g_knobPan;
    const float theta = (pan + 1.0f) * (3.14159265f * 0.25f);
    const float gl = vol * std::cos(theta), gr = vol * std::sin(theta);
    for (int k = 0; k < frames; ++k) {
        const float x = MMB_INPUTS[IN_AUDIO].buf[k];
        MMB_OUTPUTS[OUT_L].buf[k] = x * gl;
        MMB_OUTPUTS[OUT_R].buf[k] = x * gr;
    }
}
