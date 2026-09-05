// tp_mmb_plaits — Mutable Instruments Plaits (spiegel van PlaitsModule.h).
// Native 48 kHz, blokken van 24 (kMaxBlockSize). 16 engines.
#include "mmb_abi.h"
#include "plaits/dsp/voice.h"
#include "stmlib/utils/buffer_allocator.h"

const char* const MMB_TYPE_ID     = "tp_mmb_plaits";
const float       MMB_NATIVE_RATE = 48000.0f;
const int         MMB_BLOCK       = static_cast<int>(plaits::kMaxBlockSize);

enum { IN_VOCT, IN_GATE, IN_HARMONICS, IN_TIMBRE, IN_MORPH, IN_LEVEL };
MmbPort MMB_INPUTS[] = {
    { "voct", MMB_CV, 0, {} }, { "gate", MMB_GATE, 0, {} },
    { "harmonics_cv", MMB_CV, 0, {} }, { "timbre_cv", MMB_CV, 0, {} },
    { "morph_cv", MMB_CV, 0, {} }, { "level_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 6;
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

enum { C_ENGINE, C_HARMONICS, C_TIMBRE, C_MORPH, C_DECAY, C_LPG, C_COARSE, C_FINE, C_LEVEL };
MmbControl MMB_CONTROLS[] = {
    { "engine", 0.f }, { "harmonics", 0.5f }, { "timbre", 0.5f }, { "morph", 0.5f },
    { "decay", 0.5f }, { "lpg", 0.5f }, { "coarse", 0.f }, { "fine", 0.f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 9;

namespace {
char g_shared[16384];
plaits::Voice       g_voice;
plaits::Patch       g_patch;
plaits::Modulations g_mods;
float g_knob[3] = { 0.5f, 0.5f, 0.5f };   // harmonics, timbre, morph
float g_coarse = 0.f, g_fine = 0.f, g_level = 0.8f;
}

void mmb_setup() {
    g_patch.note = 60.f; g_patch.harmonics = 0.5f; g_patch.timbre = 0.5f; g_patch.morph = 0.5f;
    g_patch.frequency_modulation_amount = 0.f; g_patch.timbre_modulation_amount = 0.f; g_patch.morph_modulation_amount = 0.f;
    g_patch.engine = 0; g_patch.decay = 0.5f; g_patch.lpg_colour = 0.5f;
    g_mods.engine = 0.f; g_mods.note = 0.f; g_mods.frequency = 0.f; g_mods.harmonics = 0.f;
    g_mods.timbre = 0.f; g_mods.morph = 0.f; g_mods.trigger = 0.f; g_mods.level = 1.f;
    g_mods.frequency_patched = false; g_mods.timbre_patched = false; g_mods.morph_patched = false;
    g_mods.trigger_patched = true;      // expliciete triggers via `gate`, zoals de firmware
    g_mods.level_patched = false;
    stmlib::BufferAllocator allocator(g_shared, sizeof(g_shared));
    g_voice.Init(&allocator);
}

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_ENGINE: { int e = static_cast<int>(v); if (e < 0) e = 0; if (e > 15) e = 15; g_patch.engine = e; break; }
        case C_HARMONICS: g_knob[0] = mmb_clamp01(v); break;
        case C_TIMBRE:    g_knob[1] = mmb_clamp01(v); break;
        case C_MORPH:     g_knob[2] = mmb_clamp01(v); break;
        case C_DECAY:     g_patch.decay = mmb_clamp01(v); break;
        case C_LPG:       g_patch.lpg_colour = mmb_clamp01(v); break;
        case C_COARSE:    g_coarse = v; break;
        case C_FINE:      g_fine = v; break;
        case C_LEVEL:     g_level = mmb_clamp01(v); break;
    }
}

void mmb_process(int frames) {
    g_patch.note = 60.f + 12.f * mmb_in0(IN_VOCT) + g_coarse + g_fine / 100.f;
    g_mods.trigger = mmb_gate_in(IN_GATE) ? 1.f : 0.f;
    g_patch.harmonics = mmb_connected(IN_HARMONICS) ? mmb_clamp01(mmb_in0(IN_HARMONICS)) : g_knob[0];
    g_patch.timbre    = mmb_connected(IN_TIMBRE)    ? mmb_clamp01(mmb_in0(IN_TIMBRE))    : g_knob[1];
    g_patch.morph     = mmb_connected(IN_MORPH)     ? mmb_clamp01(mmb_in0(IN_MORPH))     : g_knob[2];
    if (mmb_connected(IN_LEVEL)) { g_mods.level = mmb_clamp01(mmb_in0(IN_LEVEL)); g_mods.level_patched = true; }

    plaits::Voice::Frame f[plaits::kMaxBlockSize];
    g_voice.Render(g_patch, g_mods, f, static_cast<size_t>(frames));
    constexpr float kInv = 1.f / 32768.f;
    for (int k = 0; k < frames; ++k) {
        float l = f[k].out * kInv * g_level, r = f[k].aux * kInv * g_level;
        if (l > 1.f) l = 1.f; else if (l < -1.f) l = -1.f;
        if (r > 1.f) r = 1.f; else if (r < -1.f) r = -1.f;
        MMB_OUTPUTS[0].buf[k] = l;
        MMB_OUTPUTS[1].buf[k] = r;
    }
}
