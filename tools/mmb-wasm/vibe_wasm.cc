// tp_mmb_vibe — univibe-stijl vibe + lichte vibrato, stereo (spiegel van
// VibeModule.h; de DSP is mmb_dsp::Vibe, dezelfde header als de firmware).
// Native 44,1 kHz, blok 32. Zonder in_r krijgt R hetzelfde als L.
#include "mmb_abi.h"
#include "mmb_dsp/vibe.h"

const char* const MMB_TYPE_ID     = "tp_mmb_vibe";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_L, IN_R, IN_SPEED, IN_INTENSITY };
MmbPort MMB_INPUTS[] = {
    { "in_l", MMB_AUDIO, 0, {} }, { "in_r", MMB_AUDIO, 0, {} },
    { "speed_cv", MMB_CV, 0, {} }, { "intensity_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
enum { OUT_L, OUT_R };
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

enum { C_SPEED, C_INTENSITY, C_MODE, C_LAMP, C_VOLUME };
MmbControl MMB_CONTROLS[] = {
    { "speed", 2.0f }, { "intensity", 0.6f }, { "mode", 0.0f }, { "lamp", 0.7f }, { "volume", 1.0f },
};
const int MMB_NUM_CONTROLS = 5;

namespace {
mmb_dsp::Vibe g_vibe;
float g_knobSpeed = 2.0f, g_knobIntensity = 0.6f;
}

void mmb_setup() { g_vibe.Init(MMB_NATIVE_RATE); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_SPEED:     g_knobSpeed = v;     g_vibe.set_speed(v); break;
        case C_INTENSITY: g_knobIntensity = v; g_vibe.set_intensity(v); break;
        case C_MODE:      g_vibe.set_mode(static_cast<int>(v + 0.5f)); break;
        case C_LAMP:      g_vibe.set_lamp(v); break;
        case C_VOLUME:    g_vibe.set_volume(v); break;
    }
}

void mmb_process(int frames) {
    g_vibe.set_speed(mmb_connected(IN_SPEED) ? mmb_in0(IN_SPEED) : g_knobSpeed);
    g_vibe.set_intensity(mmb_connected(IN_INTENSITY) ? mmb_in0(IN_INTENSITY) : g_knobIntensity);
    const bool stereo = mmb_connected(IN_R);
    float x[2];
    for (int k = 0; k < frames; ++k) {
        x[0] = MMB_INPUTS[IN_L].buf[k];
        x[1] = MMB_INPUTS[IN_R].buf[k];
        g_vibe.Process(x, stereo);
        MMB_OUTPUTS[OUT_L].buf[k] = x[0] > 1.f ? 1.f : (x[0] < -1.f ? -1.f : x[0]);
        MMB_OUTPUTS[OUT_R].buf[k] = x[1] > 1.f ? 1.f : (x[1] < -1.f ? -1.f : x[1]);
    }
}
