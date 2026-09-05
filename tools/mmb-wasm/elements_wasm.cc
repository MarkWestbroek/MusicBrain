// tp_mmb_elements — Mutable Instruments Elements (spiegel van ElementsModule.h).
// Native 32 kHz, blokken van 16. Eén stem.
#include "mmb_abi.h"
#include <cmath>
#include "elements/dsp/dsp.h"
#include "elements/dsp/part.h"

const char* const MMB_TYPE_ID     = "tp_mmb_elements";
const float       MMB_NATIVE_RATE = 32000.0f;
const int         MMB_BLOCK       = static_cast<int>(elements::kMaxBlockSize);

enum { IN_VOCT, IN_GATE, IN_STRENGTH, IN_BLOW, IN_STRIKE };
MmbPort MMB_INPUTS[] = {
    { "voct", MMB_CV, 0, {} }, { "gate", MMB_GATE, 0, {} }, { "strength", MMB_CV, 0, {} },
    { "blow_in", MMB_AUDIO, 0, {} }, { "strike_in", MMB_AUDIO, 0, {} },
};
const int MMB_NUM_INPUTS = 5;
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

enum { C_GEOMETRY, C_BRIGHTNESS, C_DAMPING, C_POSITION, C_SPACE, C_ENVELOPE,
       C_BOW_TIMBRE, C_BLOW_TIMBRE, C_STRIKE_TIMBRE, C_BLOW_META, C_STRIKE_META,
       C_SIGNATURE, C_MOD_FREQ, C_MOD_OFFSET, C_FM, C_BOW, C_BLOW, C_STRIKE,
       C_COARSE, C_FINE, C_LEVEL, C_EXCITER };
MmbControl MMB_CONTROLS[] = {
    { "geometry", 0.2f }, { "brightness", 0.5f }, { "damping", 0.25f }, { "position", 0.3f },
    { "space", 0.5f }, { "envelope", 1.0f }, { "bow_timbre", 0.5f }, { "blow_timbre", 0.5f },
    { "strike_timbre", 0.5f }, { "blow_meta", 0.5f }, { "strike_meta", 0.5f }, { "signature", 0.0f },
    { "mod_freq", 0.5f }, { "mod_offset", 0.1f }, { "fm", 0.5f }, { "bow", 0.0f }, { "blow", 0.0f },
    { "strike", 0.8f }, { "coarse", 0.0f }, { "fine", 0.0f }, { "level", 0.8f }, { "exciter", -1.0f },
};
const int MMB_NUM_CONTROLS = 22;

namespace {
// Delay-lines statisch (BSS = genuld, precies wat de MI-DSP verwacht).
float g_string [elements::kNumStrings][elements::kDelayLineSize];
float g_stretch[elements::kNumStrings][elements::kDelayLineSize / 2];
float g_bow    [elements::kMaxBowedModes][elements::kMaxDelayLineSize];
float g_diffuser[1024];
elements::VoiceBuffers     g_bufs;
elements::Part             g_part;
elements::PerformanceState g_ps;
float g_voct = 0.f, g_strength = 0.8f, g_coarse = 0.f, g_fine = 0.f, g_level = 0.8f;
bool  g_gate = false;

void applyPitch() { g_ps.note = 60.0f + 12.0f * g_voct + g_coarse + g_fine / 100.0f; }
}

void mmb_setup() {
    for (size_t i = 0; i < elements::kNumStrings; ++i) { g_bufs.string_buf[i] = g_string[i]; g_bufs.stretch_buf[i] = g_stretch[i]; }
    for (size_t i = 0; i < elements::kMaxBowedModes; ++i) g_bufs.resonator_bow_buf[i] = g_bow[i];
    g_bufs.diffuser_buf = g_diffuser;
    g_part.Init(&g_bufs);
    g_ps.gate = false; g_ps.note = 69.0f; g_ps.modulation = 0.0f; g_ps.strength = 0.8f;
    applyPitch();
}

void mmb_on_control(int idx, float v) {
    elements::Patch* p = g_part.mutable_patch();
    switch (idx) {
        case C_GEOMETRY:      p->resonator_geometry = v; break;
        case C_BRIGHTNESS:    p->resonator_brightness = v; break;
        case C_DAMPING:       p->resonator_damping = v; break;
        case C_POSITION:      p->resonator_position = v; break;
        case C_SPACE:         p->space = v; break;
        case C_ENVELOPE:      p->exciter_envelope_shape = v; break;
        case C_BOW_TIMBRE:    p->exciter_bow_timbre = v; break;
        case C_BLOW_TIMBRE:   p->exciter_blow_timbre = v; break;
        case C_STRIKE_TIMBRE: p->exciter_strike_timbre = v; break;
        case C_BLOW_META:     p->exciter_blow_meta = v; break;
        case C_STRIKE_META:   p->exciter_strike_meta = v; break;
        case C_SIGNATURE:     p->exciter_signature = v; break;
        case C_MOD_FREQ:      p->resonator_modulation_frequency = (v * 2.0f) / 32000.0f; break;
        case C_MOD_OFFSET:    p->resonator_modulation_offset = v; break;
        case C_FM:            g_ps.modulation = v * 48.0f - 24.0f; break;
        case C_BOW:           p->exciter_bow_level = v; break;
        case C_BLOW:          p->exciter_blow_level = v; break;
        case C_STRIKE:        p->exciter_strike_level = v; break;
        case C_COARSE:        g_coarse = v; applyPitch(); break;
        case C_FINE:          g_fine = v; applyPitch(); break;
        case C_LEVEL:         g_level = mmb_clamp01(v); break;
        case C_EXCITER:
            if (v >= 0.0f) {   // legacy 3-standenswitch; -1 = niet gebruikt
                const int mode = static_cast<int>(v);
                p->exciter_bow_level    = (mode == 0) ? 0.8f : 0.0f;
                p->exciter_blow_level   = (mode == 1) ? 0.8f : 0.0f;
                p->exciter_strike_level = (mode == 2) ? 0.8f : 0.0f;
            }
            break;
    }
}

void mmb_process(int frames) {
    g_voct = mmb_in0(IN_VOCT);
    if (mmb_connected(IN_STRENGTH)) g_strength = mmb_in0(IN_STRENGTH);
    const bool high = mmb_gate_in(IN_GATE);
    if (high && !g_gate) { applyPitch(); g_ps.strength = g_strength; }
    else applyPitch();
    g_ps.strength = g_strength;
    g_ps.gate = high;
    g_gate = high;

    float main[elements::kMaxBlockSize], aux[elements::kMaxBlockSize];
    g_part.Process(g_ps, MMB_INPUTS[IN_BLOW].buf, MMB_INPUTS[IN_STRIKE].buf, main, aux,
                   static_cast<size_t>(frames));
    for (int k = 0; k < frames; ++k) {
        float l = main[k] * g_level, r = aux[k] * g_level;
        if (l > 1.f) l = 1.f; else if (l < -1.f) l = -1.f;
        if (r > 1.f) r = 1.f; else if (r < -1.f) r = -1.f;
        MMB_OUTPUTS[0].buf[k] = l;
        MMB_OUTPUTS[1].buf[k] = r;
    }
}
