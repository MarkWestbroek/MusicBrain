// tp_mmb_rings — Mutable Instruments Rings (spiegel van RingsModule.h).
// Native 48 kHz, blokken van 24. Intern 1/2/4 stemmen (roterend per strum).
#include "mmb_abi.h"
#include "rings/dsp/part.h"
#include "rings/dsp/patch.h"
#include "rings/dsp/performance_state.h"
#include "rings/dsp/strummer.h"

const char* const MMB_TYPE_ID     = "tp_mmb_rings";
const float       MMB_NATIVE_RATE = 48000.0f;
const int         MMB_BLOCK       = static_cast<int>(rings::kMaxBlockSize);

enum { IN_VOCT, IN_GATE, IN_STRUCTURE, IN_BRIGHTNESS, IN_DAMPING, IN_POSITION, IN_AUDIO };
MmbPort MMB_INPUTS[] = {
    { "voct", MMB_CV, 0, {} }, { "gate", MMB_GATE, 0, {} },
    { "structure_cv", MMB_CV, 0, {} }, { "brightness_cv", MMB_CV, 0, {} },
    { "damping_cv", MMB_CV, 0, {} }, { "position_cv", MMB_CV, 0, {} },
    { "in", MMB_AUDIO, 0, {} },
};
const int MMB_NUM_INPUTS = 7;
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

enum { C_STRUCTURE, C_BRIGHTNESS, C_DAMPING, C_POSITION, C_MODEL, C_POLYPHONY, C_COARSE, C_FINE, C_LEVEL };
MmbControl MMB_CONTROLS[] = {
    { "structure", 0.4f }, { "brightness", 0.6f }, { "damping", 0.6f }, { "position", 0.3f },
    { "model", 0.0f }, { "polyphony", 0.0f }, { "coarse", 0.0f }, { "fine", 0.0f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 9;

namespace {
uint16_t                g_reverb[32768];
rings::Part             g_part;
rings::Strummer         g_strummer;
rings::PerformanceState g_ps;
rings::Patch            g_patch;
float g_knob[4] = { 0.4f, 0.6f, 0.6f, 0.3f };
float g_coarse = 0.f, g_fine = 0.f, g_level = 0.8f;
bool  g_gate = false, g_strumPending = false;
float g_silence[rings::kMaxBlockSize];

void applyPitch() { g_ps.note = 60.0f + 12.0f * mmb_in0(IN_VOCT) + g_coarse + g_fine / 100.0f; }
}

void mmb_setup() {
    g_ps.strum = false; g_ps.internal_exciter = true; g_ps.internal_strum = false;
    g_ps.internal_note = false; g_ps.tonic = 0.0f; g_ps.note = 60.0f; g_ps.fm = 0.0f; g_ps.chord = 0;
    g_strummer.Init(0.01f, MMB_NATIVE_RATE / rings::kMaxBlockSize);
    g_part.Init(g_reverb);
    g_part.set_polyphony(1);
    g_part.set_model(rings::RESONATOR_MODEL_MODAL);
}

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_STRUCTURE: case C_BRIGHTNESS: case C_DAMPING: case C_POSITION:
            g_knob[idx] = mmb_clamp01(v); break;
        case C_MODEL: {
            int m = static_cast<int>(v);
            if (m < 0) m = 0;
            if (m >= rings::RESONATOR_MODEL_LAST) m = rings::RESONATOR_MODEL_LAST - 1;
            g_part.set_model(static_cast<rings::ResonatorModel>(m));
            break;
        }
        case C_POLYPHONY: {
            const int i = static_cast<int>(v);
            g_part.set_polyphony(i <= 0 ? 1 : i == 1 ? 2 : 4);
            break;
        }
        case C_COARSE: g_coarse = v; break;
        case C_FINE:   g_fine = v; break;
        case C_LEVEL:  g_level = mmb_clamp01(v); break;
    }
}

void mmb_process(int frames) {
    const bool high = mmb_gate_in(IN_GATE);
    if (high && !g_gate) g_strumPending = true;
    g_gate = high;
    applyPitch();
    // Parameter-CV's vervangen de knop zolang de poort verbonden is (firmware).
    g_patch.structure  = mmb_connected(IN_STRUCTURE)  ? mmb_clamp01(mmb_in0(IN_STRUCTURE))  : g_knob[0];
    g_patch.brightness = mmb_connected(IN_BRIGHTNESS) ? mmb_clamp01(mmb_in0(IN_BRIGHTNESS)) : g_knob[1];
    g_patch.damping    = mmb_connected(IN_DAMPING)    ? mmb_clamp01(mmb_in0(IN_DAMPING))    : g_knob[2];
    g_patch.position   = mmb_connected(IN_POSITION)   ? mmb_clamp01(mmb_in0(IN_POSITION))   : g_knob[3];

    g_ps.strum = g_strumPending;
    g_strumPending = false;
    g_strummer.Process(nullptr, static_cast<size_t>(frames), &g_ps);
    // Externe excitatie: audio-ingang als hij verbonden is, anders de interne plukker.
    const float* in = mmb_connected(IN_AUDIO) ? MMB_INPUTS[IN_AUDIO].buf : g_silence;
    g_ps.internal_exciter = !mmb_connected(IN_AUDIO);
    float out[rings::kMaxBlockSize], aux[rings::kMaxBlockSize];
    g_part.Process(g_ps, g_patch, in, out, aux, static_cast<size_t>(frames));
    for (int k = 0; k < frames; ++k) {
        float l = out[k] * g_level, r = aux[k] * g_level;
        if (l > 1.f) l = 1.f; else if (l < -1.f) l = -1.f;
        if (r > 1.f) r = 1.f; else if (r < -1.f) r = -1.f;
        MMB_OUTPUTS[0].buf[k] = l;
        MMB_OUTPUTS[1].buf[k] = r;
    }
}
