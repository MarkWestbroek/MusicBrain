#include <cmath>

#include "mmb_abi.h"
#include "mmb_dsp/fof_voice.h"

const char* const MMB_TYPE_ID = "tp_mmb_fof";
const float MMB_NATIVE_RATE = 44100.0f;
const int MMB_BLOCK = 32;

enum { IN_VOCT, IN_GATE, IN_VOWEL, IN_BREATH };
MmbPort MMB_INPUTS[] = {
    { "voct", MMB_CV, 0, {} }, { "gate", MMB_GATE, 0, {} },
    { "vowel", MMB_CV, 0, {} }, { "breath", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_VOWEL, C_TONE, C_BREATH, C_VIBRATO, C_LEVEL };
MmbControl MMB_CONTROLS[] = {
    { "vowel", 0.0f }, { "tone", 0.5f }, { "breath", 0.08f },
    { "vibrato", 0.12f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 5;

namespace {
mmb_dsp::FofVoice voice;
float vowel = 0.0f;
float breath = 0.08f;
}

void mmb_setup() { voice.init(MMB_NATIVE_RATE); }

void mmb_on_control(int index, float value) {
    switch (index) {
        case C_VOWEL: vowel = mmb_clamp01(value); break;
        case C_TONE: voice.setTone(mmb_clamp01(value)); break;
        case C_BREATH: breath = mmb_clamp01(value); break;
        case C_VIBRATO: voice.setVibrato(mmb_clamp01(value)); break;
        case C_LEVEL: voice.setLevel(mmb_clamp01(value)); break;
    }
}

void mmb_process(int frames) {
    const float voct = mmb_connected(IN_VOCT) ? mmb_in0(IN_VOCT) : 0.0f;
    voice.setFrequency(261.6256f * std::pow(2.0f, voct));
    voice.setGate(mmb_gate_in(IN_GATE));
    voice.setVowel(mmb_clamp01(vowel + (mmb_connected(IN_VOWEL) ? mmb_in0(IN_VOWEL) : 0.0f)) * 4.0f);
    voice.setBreath(mmb_clamp01(breath + (mmb_connected(IN_BREATH) ? mmb_in0(IN_BREATH) : 0.0f)));
    for (int i = 0; i < frames; ++i) MMB_OUTPUTS[0].buf[i] = voice.process();
}