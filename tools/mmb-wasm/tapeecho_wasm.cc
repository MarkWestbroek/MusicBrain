// tp_mmb_tape_echo — bandecho (spiegel van TapeEchoModule.h; de DSP zelf is
// mmb_dsp::TapeEcho, dezelfde header als de firmware). Native 44,1 kHz, blok 32.
#include "mmb_abi.h"
#include "mmb_dsp/tape_echo.h"

const char* const MMB_TYPE_ID     = "tp_mmb_tape_echo";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_AUDIO, IN_TIME, IN_FBK, IN_MIX };
MmbPort MMB_INPUTS[] = {
    { "in", MMB_AUDIO, 0, {} }, { "time_cv", MMB_CV, 0, {} }, { "fbk_cv", MMB_CV, 0, {} }, { "mix_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_TIME, C_FEEDBACK, C_MIX, C_TONE, C_WOW, C_FLUTTER, C_DRIVE };
MmbControl MMB_CONTROLS[] = {
    { "time", 0.35f }, { "feedback", 0.5f }, { "mix", 0.4f }, { "tone", 0.6f },
    { "wow", 0.3f }, { "flutter", 0.2f }, { "drive", 0.3f },
};
const int MMB_NUM_CONTROLS = 7;

namespace {
constexpr int kLen = static_cast<int>(44100.0f * mmb_dsp::TapeEcho::kMaxSeconds) + 4096;
int16_t g_tape[kLen];
mmb_dsp::TapeEcho g_echo;
float g_knobTime = 0.35f, g_knobFbk = 0.5f, g_knobMix = 0.4f;
}

void mmb_setup() { g_echo.Init(MMB_NATIVE_RATE, g_tape, kLen); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_TIME:     g_knobTime = v; g_echo.set_time(v); break;
        case C_FEEDBACK: g_knobFbk = v;  g_echo.set_feedback(v); break;
        case C_MIX:      g_knobMix = v;  g_echo.set_mix(v); break;
        case C_TONE:     g_echo.set_tone(v); break;
        case C_WOW:      g_echo.set_wow(v); break;
        case C_FLUTTER:  g_echo.set_flutter(v); break;
        case C_DRIVE:    g_echo.set_drive(v); break;
    }
}

void mmb_process(int frames) {
    g_echo.set_time(mmb_connected(IN_TIME) ? mmb_in0(IN_TIME) : g_knobTime);
    g_echo.set_feedback(mmb_connected(IN_FBK) ? mmb_in0(IN_FBK) : g_knobFbk);
    g_echo.set_mix(mmb_connected(IN_MIX) ? mmb_in0(IN_MIX) : g_knobMix);
    for (int k = 0; k < frames; ++k) {
        float y = g_echo.Process(MMB_INPUTS[IN_AUDIO].buf[k]);
        if (y > 1.f) y = 1.f; else if (y < -1.f) y = -1.f;
        MMB_OUTPUTS[0].buf[k] = y;
    }
}
