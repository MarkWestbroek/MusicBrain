// tp_mmb_echo — feedback-delay (spiegel van EchoModule.h). Native 44,1 kHz,
// blok 32.
//
// Net als de comb (zie comb_wasm.cc) is de echo in de firmware een graaf van
// Teensy-audio-objecten: in_ → inMix_ → AudioEffectDelay → fbAmp_ → inMix_,
// met een dry/wet-mixer erachter. Deze wrapper bootst die graaf na, inclusief
// de feedback die één blok (128 samples) achterloopt omdat `inMix_` vóór
// `fbAmp_` wordt geconstrueerd. Bij een echo is dat onhoorbaar (+2,9 ms per
// herhaling), maar het is wat de hardware doet.
//
// CV en knop schrijven hetzelfde veld, bij verandering (CvGraph-stijl): wie
// het laatst iets nieuws zegt, wint — zoals op de Teensy.
#include "mmb_abi.h"

const char* const MMB_TYPE_ID     = "tp_mmb_echo";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_AUDIO, IN_TIME, IN_FBK, IN_MIX };
MmbPort MMB_INPUTS[] = {
    { "in", MMB_AUDIO, 0, {} }, { "time_cv", MMB_CV, 0, {} },
    { "fbk_cv", MMB_CV, 0, {} }, { "mix_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

// `tempo_sync` staat op het paneel maar de firmware doet er (nog) niets mee.
enum { C_TIME, C_FEEDBACK, C_MIX, C_TEMPO_SYNC };
MmbControl MMB_CONTROLS[] = {
    { "time", 0.30f }, { "feedback", 0.45f }, { "mix", 0.35f }, { "tempo_sync", 0.0f },
};
const int MMB_NUM_CONTROLS = 4;

namespace {
constexpr float kMaxDelayMs  = 500.0f;          // EchoModule::kMaxDelayMs
constexpr int   kTeensyBlock = 128;             // AUDIO_BLOCK_SAMPLES
constexpr int   kLineLen     = 32768;           // > 500 ms + 128 @ 44,1k
constexpr int   kLineMask    = kLineLen - 1;

float g_line[kLineLen];                          // AudioEffectDelay-lijn (invoer = inMix)
float g_fb[kLineLen];                            // fbAmp-uitgang, 128 samples later gelezen
unsigned g_pos = 0;
int   g_n = 13230;                               // 300 ms
float g_fbk = 0.45f, g_mix = 0.35f;
float g_lastCv[4] = { -1e9f, -1e9f, -1e9f, -1e9f };

float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
/** Mixers en versterkers op de Teensy verzadigen op int16: ±1 in float. */
float sat(float v) { return v > 1.0f ? 1.0f : (v < -1.0f ? -1.0f : v); }

void setTimeSeconds(float s) {
    const float ms = clampf(s * 1000.0f, 1.0f, kMaxDelayMs);
    g_n = static_cast<int>(ms * (MMB_NATIVE_RATE / 1000.0f) + 0.5f);   // AudioEffectDelay::delay()
}
void setFeedback(float f) { g_fbk = clampf(f, 0.0f, 0.95f); }
void setMix(float m)      { g_mix = clampf(m, 0.0f, 1.0f); }
}  // namespace

void mmb_setup() { setTimeSeconds(0.30f); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_TIME:     setTimeSeconds(v); break;
        case C_FEEDBACK: setFeedback(v); break;
        case C_MIX:      setMix(v); break;
    }
}

void mmb_process(int frames) {
    for (int i = IN_TIME; i <= IN_MIX; ++i) {
        if (!mmb_connected(i)) { g_lastCv[i] = -1e9f; continue; }
        const float v = mmb_in0(i);
        if (v == g_lastCv[i]) continue;
        g_lastCv[i] = v;
        if (i == IN_TIME) setTimeSeconds(v);
        else if (i == IN_FBK) setFeedback(v);
        else setMix(v);
    }
    for (int k = 0; k < frames; ++k, ++g_pos) {
        const float x = MMB_INPUTS[IN_AUDIO].buf[k];
        const float inMix = sat(x + g_fb[(g_pos - kTeensyBlock) & kLineMask]);
        g_line[g_pos & kLineMask] = inMix;
        const float wet = g_line[(g_pos - static_cast<unsigned>(g_n)) & kLineMask];
        g_fb[g_pos & kLineMask] = sat(wet * g_fbk);
        MMB_OUTPUTS[0].buf[k] = sat(x * (1.0f - g_mix) + wet * g_mix);
    }
}
