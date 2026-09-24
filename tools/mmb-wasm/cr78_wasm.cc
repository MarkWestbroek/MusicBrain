// tp_mmb_cr78 — één berekende CR-78-drum (spiegel van Cr78Module.h; de DSP is
// mmb_dsp::Cr78, dezelfde header als de firmware — daar in september 2026 uit
// de module getild, bit-identiek). Native 44,1 kHz, blok 32.
#include "mmb_abi.h"
#include "mmb_dsp/cr78.h"

const char* const MMB_TYPE_ID     = "tp_mmb_cr78";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_GATE, IN_VOCT, IN_ACCENT };
MmbPort MMB_INPUTS[] = {
    { "gate", MMB_GATE, 0, {} }, { "voct", MMB_CV, 0, {} }, { "accent_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_DRUM, C_TONE, C_DECAY, C_BEND, C_LEVEL };
MmbControl MMB_CONTROLS[] = {
    { "drum", 0.0f }, { "tone", 0.5f }, { "decay", 0.5f }, { "bend", 0.5f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 5;

namespace {
mmb_dsp::Cr78 g_drum;
bool  g_gatePrev = false;
float g_voct = 0.0f;
// De Teensy-schil schaalt met 28000 naar int16; als float is dat 28000/32768.
constexpr float kOutScale = 28000.0f / 32768.0f;
}  // namespace

void mmb_setup() { g_drum.Init(MMB_NATIVE_RATE); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_DRUM:  g_drum.setDrum(static_cast<int>(v + 0.5f)); break;
        case C_TONE:  g_drum.setTone(v); break;
        case C_DECAY: g_drum.setDecay(v); break;
        case C_BEND:  g_drum.setBend(v); break;
        case C_LEVEL: g_drum.setLevel(v); break;
    }
}

void mmb_process(int frames) {
    // Accent: zonder kabel vol accent, zoals de kernel begint (accent_ = 1).
    g_drum.setAccent(mmb_connected(IN_ACCENT) ? mmb_in0(IN_ACCENT) : 1.0f);
    const float voct = mmb_connected(IN_VOCT) ? mmb_in0(IN_VOCT) : 0.0f;
    if (voct != g_voct) { g_voct = voct; g_drum.setVoct(voct); }
    // Stijgende flank slaat de drum, net als writeCvPort("gate").
    const bool high = mmb_gate_in(IN_GATE);
    if (high && !g_gatePrev) g_drum.trigger();
    g_gatePrev = high;
    for (int k = 0; k < frames; ++k) {
        float y = g_drum.Tick() * kOutScale;
        if (y > 1.0f) y = 1.0f; else if (y < -1.0f) y = -1.0f;
        MMB_OUTPUTS[0].buf[k] = y;
    }
}
