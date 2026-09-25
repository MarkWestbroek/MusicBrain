// tp_mmb_stereo_tape_echo — stereo bandecho met cross-feedback (spiegel van
// StereoTapeEchoModule.h; de DSP is mmb_dsp::StereoTapeEcho, dezelfde header
// als de firmware). Native 44,1 kHz, blok 32. Zonder in_r krijgt R hetzelfde
// als L, zoals in de firmware.
#include "mmb_abi.h"
#include "mmb_dsp/stereo_tape_echo.h"

const char* const MMB_TYPE_ID     = "tp_mmb_stereo_tape_echo";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_L, IN_R, IN_TIME, IN_FBK, IN_CROSS, IN_MIX };
MmbPort MMB_INPUTS[] = {
    { "in_l", MMB_AUDIO, 0, {} }, { "in_r", MMB_AUDIO, 0, {} },
    { "time_cv", MMB_CV, 0, {} }, { "fbk_cv", MMB_CV, 0, {} }, { "cross_cv", MMB_CV, 0, {} }, { "mix_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 6;
enum { OUT_L, OUT_R };
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

enum { C_TIME, C_RATIO, C_FEEDBACK, C_CROSS, C_MIX, C_TONE, C_WOW, C_FLUTTER, C_DRIVE };
MmbControl MMB_CONTROLS[] = {
    { "time", 0.35f }, { "ratio", 1.0f }, { "feedback", 0.4f }, { "cross", 0.3f }, { "mix", 0.4f },
    { "tone", 0.6f }, { "wow", 0.3f }, { "flutter", 0.2f }, { "drive", 0.3f },
};
const int MMB_NUM_CONTROLS = 9;

namespace {
constexpr int kLen = static_cast<int>(44100.0f * mmb_dsp::TapeEcho::kMaxSeconds) + 4096;
int16_t g_tapeL[kLen], g_tapeR[kLen];
mmb_dsp::StereoTapeEcho g_echo;
float g_knobTime = 0.35f, g_knobFbk = 0.4f, g_knobCross = 0.3f, g_knobMix = 0.4f;
}

void mmb_setup() { g_echo.Init(MMB_NATIVE_RATE, g_tapeL, g_tapeR, kLen); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_TIME:     g_knobTime = v;  g_echo.set_time(v); break;
        case C_RATIO:    g_echo.set_ratio(v); break;
        case C_FEEDBACK: g_knobFbk = v;   g_echo.set_feedback(v); break;
        case C_CROSS:    g_knobCross = v; g_echo.set_cross(v); break;
        case C_MIX:      g_knobMix = v;   g_echo.set_mix(v); break;
        case C_TONE:     g_echo.set_tone(v); break;
        case C_WOW:      g_echo.set_wow(v); break;
        case C_FLUTTER:  g_echo.set_flutter(v); break;
        case C_DRIVE:    g_echo.set_drive(v); break;
    }
}

void mmb_process(int frames) {
    g_echo.set_time(mmb_connected(IN_TIME) ? mmb_in0(IN_TIME) : g_knobTime);
    g_echo.set_feedback(mmb_connected(IN_FBK) ? mmb_in0(IN_FBK) : g_knobFbk);
    g_echo.set_cross(mmb_connected(IN_CROSS) ? mmb_in0(IN_CROSS) : g_knobCross);
    g_echo.set_mix(mmb_connected(IN_MIX) ? mmb_in0(IN_MIX) : g_knobMix);
    const bool stereo = mmb_connected(IN_R);
    float x[2];
    for (int k = 0; k < frames; ++k) {
        x[0] = MMB_INPUTS[IN_L].buf[k];
        x[1] = stereo ? MMB_INPUTS[IN_R].buf[k] : x[0];
        g_echo.Process(x);
        MMB_OUTPUTS[OUT_L].buf[k] = x[0] > 1.f ? 1.f : (x[0] < -1.f ? -1.f : x[0]);
        MMB_OUTPUTS[OUT_R].buf[k] = x[1] > 1.f ? 1.f : (x[1] < -1.f ? -1.f : x[1]);
    }
}
