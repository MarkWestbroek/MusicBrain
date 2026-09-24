// tp_mmb_resonator — twaalf gestemde snaar-resonatoren (spiegel van
// ResonatorModule.h; de DSP is mmb_dsp::Resonator, dezelfde header als de
// firmware — daar in september 2026 uit de module getild, bit-identiek).
// Native 44,1 kHz, blok 32.
#include "mmb_abi.h"
#include "mmb_dsp/resonator.h"

const char* const MMB_TYPE_ID     = "tp_mmb_resonator";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_AUDIO, IN_VOCT, IN_STRUCT };
MmbPort MMB_INPUTS[] = {
    { "in", MMB_AUDIO, 0, {} }, { "voct", MMB_CV, 0, {} }, { "struct_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 3;
// `out` en `mix` wijzen in de firmware allebei naar kanaal 0 — hetzelfde
// signaal (dry/wet × level), ook al noemt de kop `out` "nat".
enum { OUT_OUT, OUT_MIX };
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} }, { "mix", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

enum { C_ROOT, C_SCALE, C_STRUCTURE, C_DECAY, C_DAMPING, C_MIX, C_LEVEL };
MmbControl MMB_CONTROLS[] = {
    { "root", 0.0f }, { "scale", 1.0f }, { "structure", 0.3f }, { "decay", 0.7f },
    { "damping", 0.5f }, { "mix", 0.6f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 7;

namespace {
float g_buf[mmb_dsp::Resonator::kStrings * mmb_dsp::Resonator::kMaxLen];
mmb_dsp::Resonator g_res;
float g_voct = 0.0f, g_struct = 0.0f;
}  // namespace

void mmb_setup() { g_res.Init(MMB_NATIVE_RATE, g_buf); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_ROOT:      g_res.setRoot(v); break;
        case C_SCALE:     g_res.setScale(static_cast<int>(v + 0.5f)); break;
        case C_STRUCTURE: g_res.setStructure(v); break;
        case C_DECAY:     g_res.setDecay(v); break;
        case C_DAMPING:   g_res.setDamping(v); break;
        case C_MIX:       g_res.setMix(v); break;
        case C_LEVEL:     g_res.setLevel(v); break;
    }
}

void mmb_process(int frames) {
    // retune() kost twaalf exp2f's; alleen opnieuw stemmen als de CV verschuift.
    const float voct = mmb_connected(IN_VOCT) ? mmb_in0(IN_VOCT) : 0.0f;
    const float st   = mmb_connected(IN_STRUCT) ? mmb_in0(IN_STRUCT) : 0.0f;
    if (voct != g_voct) { g_voct = voct; g_res.setVoct(voct); }
    if (st != g_struct) { g_struct = st; g_res.setStructureCv(st); }
    for (int k = 0; k < frames; ++k) {
        float y = g_res.Tick(MMB_INPUTS[IN_AUDIO].buf[k]);
        if (y > 1.0f) y = 1.0f; else if (y < -1.0f) y = -1.0f;
        MMB_OUTPUTS[OUT_OUT].buf[k] = y;
        MMB_OUTPUTS[OUT_MIX].buf[k] = y;
    }
}
