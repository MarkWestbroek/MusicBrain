#include <cmath>

#include "mmb_abi.h"
#include "mmb_dsp/fof_voice.h"

const char* const MMB_TYPE_ID = "tp_mmb_fof";
const float MMB_NATIVE_RATE = 44100.0f;
const int MMB_BLOCK = 32;

enum { IN_VOCT, IN_GATE, IN_VOWEL, IN_BREATH, IN_VEL, IN_PRESSURE, IN_VIBRATO, IN_VOICE, IN_SYL };
MmbPort MMB_INPUTS[] = {
    { "voct", MMB_CV, 0, {} }, { "gate", MMB_GATE, 0, {} },
    { "vowel", MMB_CV, 0, {} }, { "breath", MMB_CV, 0, {} },
    { "vel", MMB_CV, 0, {} }, { "pressure", MMB_CV, 0, {} },
    { "vibrato", MMB_CV, 0, {} }, { "voice", MMB_CV, 0, {} },
    { "syl_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 9;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_VOWEL, C_TONE, C_BREATH, C_VIBRATO, C_LEVEL, C_VOICE,
       C_VOWEL_AMT, C_BREATH_AMT, C_VIBRATO_AMT, C_VOICE_AMT, C_VEL_AMT, C_PRESS_AMT,
       C_SYL, C_SYL_AMT };
MmbControl MMB_CONTROLS[] = {
    { "vowel", 0.0f }, { "tone", 0.5f }, { "breath", 0.08f },
    { "vibrato", 0.12f }, { "level", 0.8f }, { "voice", 0.35f },
    // Attenuators: knob + amt * CV for the modulation inputs; Vel and Press
    // are scaled towards 1 (amt 0 = no effect). All default to 1.
    { "vowel_amt", 1.0f }, { "breath_amt", 1.0f }, { "vibrato_amt", 1.0f },
    { "voice_amt", 1.0f }, { "vel_amt", 1.0f }, { "press_amt", 1.0f },
    // Syllable switch (0 = Vowel knob, 1 = doo, 2 = da) and its CV attenuator.
    { "syl", 0.0f }, { "syl_amt", 1.0f },
};
const int MMB_NUM_CONTROLS = 14;

namespace {
mmb_dsp::FofVoice voice;
float vowel = 0.0f;
float breath = 0.08f;
float vibrato = 0.12f;
float voiceKnob = 0.35f;
float amt[6] = { 1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f };
float syl = 0.0f;
float sylAmt = 1.0f;
float cvOr(int index, float fallback) { return mmb_connected(index) ? mmb_in0(index) : fallback; }
}

void mmb_setup() { voice.init(MMB_NATIVE_RATE); }

void mmb_on_control(int index, float value) {
    switch (index) {
        case C_VOWEL: vowel = mmb_clamp01(value); break;
        case C_TONE: voice.setTone(mmb_clamp01(value)); break;
        case C_BREATH: breath = mmb_clamp01(value); break;
        case C_VIBRATO: vibrato = mmb_clamp01(value); break;
        case C_LEVEL: voice.setLevel(mmb_clamp01(value)); break;
        case C_VOICE: voiceKnob = mmb_clamp01(value); break;
        case C_VOWEL_AMT: case C_BREATH_AMT: case C_VIBRATO_AMT:
        case C_VOICE_AMT: case C_VEL_AMT: case C_PRESS_AMT:
            amt[index - C_VOWEL_AMT] = mmb_clamp01(value); break;
        case C_SYL: syl = value; break;
        case C_SYL_AMT: sylAmt = mmb_clamp01(value); break;
    }
}

void mmb_process(int frames) {
    const float voct = mmb_connected(IN_VOCT) ? mmb_in0(IN_VOCT) : 0.0f;
    voice.setFrequency(261.6256f * std::pow(2.0f, voct));
    voice.setGate(mmb_gate_in(IN_GATE));
    voice.setVowel(mmb_clamp01(vowel + amt[0] * cvOr(IN_VOWEL, 0.0f)) * 4.0f);
    voice.setBreath(mmb_clamp01(breath + amt[1] * cvOr(IN_BREATH, 0.0f)));
    voice.setVibrato(mmb_clamp01(vibrato + amt[2] * cvOr(IN_VIBRATO, 0.0f)));
    voice.setVoice(mmb_clamp01(voiceKnob + amt[3] * cvOr(IN_VOICE, 0.0f)));
    voice.setVelocity(1.0f - amt[4] * (1.0f - mmb_clamp01(cvOr(IN_VEL, 1.0f))));
    voice.setPressure(1.0f - amt[5] * (1.0f - mmb_clamp01(cvOr(IN_PRESSURE, 1.0f))));
    const float span = static_cast<float>(mmb_dsp::FofVoice::kSyllableCount - 1);
    voice.setSyllable(static_cast<int>(std::lround(syl + sylAmt * mmb_clamp01(cvOr(IN_SYL, 0.0f)) * span)));
    for (int i = 0; i < frames; ++i) MMB_OUTPUTS[0].buf[i] = voice.process();
}