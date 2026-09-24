// tp_mmb_comb — gestemde comb-filter (spiegel van CombModule.h). Native
// 44,1 kHz, blok 32.
//
// Er is geen kernel om te delen: in de firmware is de comb een graaf van
// Teensy-audio-objecten (AudioAmplifier → AudioMixer4 → AudioEffectDelay →
// AudioAmplifier terug naar de mixer). Deze wrapper bootst die graaf na,
// inclusief één eigenschap die de klank bepaalt:
//
// **De feedback loopt één blok (128 samples) achter.** De Teensy werkt de
// objecten af in constructievolgorde; `inMix_` komt vóór `fbAmp_`, dus de
// mixer krijgt de feedback van het vórige blok. De luslengte is daardoor
// niet `n` maar `n + 128` samples. Bij C4 (n = 169) resoneert de comb op
// 44100 / 297 ≈ 148 Hz in plaats van 262 Hz, en hoe hoger de toon, hoe
// groter de fout — hij volgt V/Oct niet. Dat lijkt me een firmware-fout (zie
// de Teensy-todo), maar het ís wat de hardware doet, dus de simulator doet
// het ook. Een echte kernel met een lus van één sample zou het rechtzetten,
// maar dat verandert de klank van je hardware en hoort bij een sessie met
// oren erbij.
#include <cmath>

#include "mmb_abi.h"

const char* const MMB_TYPE_ID     = "tp_mmb_comb";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_AUDIO, IN_FREQ, IN_FBK, IN_MIX };
MmbPort MMB_INPUTS[] = {
    { "in", MMB_AUDIO, 0, {} }, { "freq_cv", MMB_CV, 0, {} },
    { "fbk_cv", MMB_CV, 0, {} }, { "mix_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_COARSE, C_FEEDBACK, C_MIX };
MmbControl MMB_CONTROLS[] = { { "coarse", 0.0f }, { "feedback", 0.9f }, { "mix", 0.5f } };
const int MMB_NUM_CONTROLS = 3;

namespace {
constexpr float kMinDelayMs = 0.2f, kMaxDelayMs = 50.0f;   // CombModule.h
constexpr int   kTeensyBlock = 128;                        // AUDIO_BLOCK_SAMPLES
constexpr int   kLineLen = 4096;                           // > 50 ms @ 44,1k
constexpr int   kLineMask = kLineLen - 1;

float g_line[kLineLen];        // de AudioEffectDelay-lijn (invoer = inMix)
float g_fb[kLineLen];          // fbAmp-uitgang, om er 128 samples later uit te lezen
unsigned g_pos = 0;
int   g_n = 169;               // vertraging in samples
float g_knobCoarse = 0.0f, g_knobFbk = 0.9f, g_knobMix = 0.5f;

float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
/** Mixers en versterkers op de Teensy verzadigen op int16: ±1 in float. */
float sat(float v) { return v > 1.0f ? 1.0f : (v < -1.0f ? -1.0f : v); }

/** CombModule::retune() + AudioEffectDelay::delay(): ms → hele samples. */
void retune(float voct, float coarse) {
    const float hz = 261.6256f * std::pow(2.0f, voct + coarse / 12.0f);
    float ms = (hz > 0.0f) ? (1000.0f / hz) : kMaxDelayMs;
    ms = clampf(ms, kMinDelayMs, kMaxDelayMs);
    g_n = static_cast<int>(ms * (MMB_NATIVE_RATE / 1000.0f) + 0.5f);
}
}  // namespace

void mmb_setup() { retune(0.0f, 0.0f); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_COARSE:   g_knobCoarse = v; break;
        case C_FEEDBACK: g_knobFbk = v; break;
        case C_MIX:      g_knobMix = v; break;
    }
}

void mmb_process(int frames) {
    retune(mmb_connected(IN_FREQ) ? mmb_in0(IN_FREQ) : 0.0f, g_knobCoarse);
    const float fb  = clampf(mmb_connected(IN_FBK) ? mmb_in0(IN_FBK) : g_knobFbk, 0.0f, 0.99f);
    const float mix = clampf(mmb_connected(IN_MIX) ? mmb_in0(IN_MIX) : g_knobMix, 0.0f, 1.0f);
    for (int k = 0; k < frames; ++k, ++g_pos) {
        const float x = MMB_INPUTS[IN_AUDIO].buf[k];
        // inMix: ingang + de feedback van één Teensy-blok geleden.
        const float inMix = sat(x + g_fb[(g_pos - kTeensyBlock) & kLineMask]);
        g_line[g_pos & kLineMask] = inMix;
        const float wet = g_line[(g_pos - static_cast<unsigned>(g_n)) & kLineMask];
        g_fb[g_pos & kLineMask] = sat(wet * fb);
        MMB_OUTPUTS[0].buf[k] = sat(x * (1.0f - mix) + wet * mix);
    }
}
