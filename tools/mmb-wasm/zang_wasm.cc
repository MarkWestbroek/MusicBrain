// tp_mmb_zang — zingende stemmen (spiegel van ZangModule.h; de DSP is
// mmb_dsp::ZangEngine uit psola.h, dezelfde header als de firmware).
// Native 44,1 kHz, blok 32. Acht stem-cellen zoals de sampler: `voct_k`,
// `gate_k`, `vel_k`; de stemtoewijzer zit in MIDI-in.
//
// De lyricbank (.mmbl, zie mmb_dsp/lyric_bank.h) komt als één blob in slot 0
// via de gewone blob-exports: het hele bestand, als int16 gelezen. `rate` en
// `channels` van de blob doen er niet toe; de bank draagt zijn eigen rate.
#include "mmb_abi.h"
#include <cstdlib>
#include <cstring>
#include <cmath>
#include "mmb_dsp/psola.h"

const char* const MMB_TYPE_ID     = "tp_mmb_zang";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

constexpr int kVoices = mmb_dsp::ZangEngine::kVoices;

MmbPort MMB_INPUTS[] = {
    { "voct_1", MMB_CV, 0, {} }, { "voct_2", MMB_CV, 0, {} }, { "voct_3", MMB_CV, 0, {} }, { "voct_4", MMB_CV, 0, {} },
    { "voct_5", MMB_CV, 0, {} }, { "voct_6", MMB_CV, 0, {} }, { "voct_7", MMB_CV, 0, {} }, { "voct_8", MMB_CV, 0, {} },
    { "gate_1", MMB_GATE, 0, {} }, { "gate_2", MMB_GATE, 0, {} }, { "gate_3", MMB_GATE, 0, {} }, { "gate_4", MMB_GATE, 0, {} },
    { "gate_5", MMB_GATE, 0, {} }, { "gate_6", MMB_GATE, 0, {} }, { "gate_7", MMB_GATE, 0, {} }, { "gate_8", MMB_GATE, 0, {} },
    { "vel_1", MMB_CV, 0, {} }, { "vel_2", MMB_CV, 0, {} }, { "vel_3", MMB_CV, 0, {} }, { "vel_4", MMB_CV, 0, {} },
    { "vel_5", MMB_CV, 0, {} }, { "vel_6", MMB_CV, 0, {} }, { "vel_7", MMB_CV, 0, {} }, { "vel_8", MMB_CV, 0, {} },
    { "bend", MMB_CV, 0, {} },
    { "syl_cv", MMB_CV, 0, {} },
    { "formant_cv", MMB_CV, 0, {} },
    { "next", MMB_GATE, 0, {} },
    { "reset", MMB_GATE, 0, {} },
};
const int MMB_NUM_INPUTS = 3 * kVoices + 5;
inline int IN_VOCT(int k) { return k; }
inline int IN_GATE(int k) { return kVoices + k; }
inline int IN_VEL(int k)  { return 2 * kVoices + k; }
enum { IN_BEND = 3 * kVoices, IN_SYL, IN_FORMANT, IN_NEXT, IN_RESET };

MmbPort MMB_OUTPUTS[] = {
    { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} },
    { "syl_out", MMB_CV, 0, {} },
};
const int MMB_NUM_OUTPUTS = 3;

enum { C_SYL, C_MODE, C_SPEED, C_FORMANT, C_ATTACK, C_RELEASE, C_COARSE, C_FINE, C_LEVEL };
MmbControl MMB_CONTROLS[] = {
    { "syl", 0.f }, { "mode", 1.f }, { "speed", 1.f }, { "formant", 0.f },
    { "attack", 5.f }, { "release", 250.f }, { "coarse", 0.f }, { "fine", 0.f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 9;

namespace {
mmb_dsp::ZangEngine g_engine;
mmb_dsp::LyricBank  g_bank;
uint8_t* g_blob = nullptr;
int      g_cap = 0;
bool     g_gate[kVoices];
bool     g_next = false, g_reset = false;
float    g_coarse = 0.f, g_fine = 0.f;
}

// ── bank-exports (zelfde namen als de sampler: de host kent ze al) ────
MMB_EXPORT(mmb_blob_ptr) int16_t* mmb_blob_ptr(int slot, int bytes) {
    if (slot != 0 || bytes <= 0) return nullptr;
    g_engine.set_bank(nullptr);             // stemmen stil vóór het blok verhuist
    g_bank.detach();
    if (g_cap < bytes) {
        void* p = std::realloc(g_blob, static_cast<size_t>(bytes));
        if (!p) return nullptr;
        g_blob = static_cast<uint8_t*>(p);
        g_cap = bytes;
    }
    return reinterpret_cast<int16_t*>(g_blob);
}
MMB_EXPORT(mmb_blob_commit) void mmb_blob_commit(int slot, int frames, float /*rate*/, int channels) {
    if (slot != 0 || !g_blob) return;
    if (channels < 1) channels = 1;
    size_t bytes = static_cast<size_t>(frames) * static_cast<size_t>(channels) * 2u;
    if (bytes > static_cast<size_t>(g_cap)) bytes = static_cast<size_t>(g_cap);
    if (g_bank.attach(g_blob, bytes)) g_engine.set_bank(&g_bank);
}
/** Diagnose: aantal lettergrepen in de geladen bank (0 = geen geldige bank). */
MMB_EXPORT(mmb_zang_syllables) int mmb_zang_syllables() { return g_bank.numSyllables(); }
/** Diagnose: index van de lettergreep die nu aan de beurt is. */
MMB_EXPORT(mmb_zang_current) int mmb_zang_current() { return g_engine.current(); }
MMB_EXPORT(mmb_active_voices) int mmb_active_voices() { return g_engine.activeVoices(); }

void mmb_setup() {
    g_engine.Init(MMB_NATIVE_RATE);
    for (int i = 0; i < kVoices; ++i) g_gate[i] = false;
}

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_SYL:     g_engine.set_syllable(static_cast<int>(std::lround(v))); break;
        case C_MODE:    g_engine.set_mode(static_cast<int>(std::lround(v))); break;
        case C_SPEED:   g_engine.set_speed(v); break;
        case C_FORMANT: g_engine.set_formant_semitones(v); break;
        case C_ATTACK:  g_engine.set_attack_ms(v); break;
        case C_RELEASE: g_engine.set_release_ms(v); break;
        case C_COARSE:  g_coarse = v; g_engine.set_transpose(g_coarse + g_fine * 0.01f); break;
        case C_FINE:    g_fine = v;   g_engine.set_transpose(g_coarse + g_fine * 0.01f); break;
        case C_LEVEL:   g_engine.set_level(v); break;
    }
}

void mmb_process(int frames) {
    g_engine.set_syllable_cv(mmb_connected(IN_SYL) ? mmb_in0(IN_SYL) : 0.f);
    g_engine.set_formant_cv(mmb_connected(IN_FORMANT) ? mmb_in0(IN_FORMANT) : 0.f);

    // Eerst next/reset, dan de noten: een flank op hetzelfde blok als de
    // aanslag geldt al voor die aanslag.
    const bool reset = mmb_connected(IN_RESET) && mmb_gate_in(IN_RESET);
    if (reset && !g_reset) g_engine.Reset();
    g_reset = reset;
    const bool next = mmb_connected(IN_NEXT) && mmb_gate_in(IN_NEXT);
    if (next && !g_next) g_engine.Next();
    g_next = next;

    const float bend = mmb_connected(IN_BEND) ? mmb_in0(IN_BEND) : 0.f;
    for (int k = 0; k < kVoices; ++k) {
        g_engine.set_voct(k, mmb_in0(IN_VOCT(k)) + bend);
        const bool high = mmb_gate_in(IN_GATE(k));
        if (high && !g_gate[k]) {
            const float vel = mmb_connected(IN_VEL(k)) ? mmb_in0(IN_VEL(k)) : 0.8f;
            g_engine.NoteOn(k, vel);
        } else if (!high && g_gate[k]) {
            g_engine.NoteOff(k);
        }
        g_gate[k] = high;
    }

    const float syl = g_engine.currentNormalized();
    for (int k = 0; k < frames; ++k) {
        const float y = g_engine.Tick();
        MMB_OUTPUTS[0].buf[k] = y;
        MMB_OUTPUTS[1].buf[k] = y;
        MMB_OUTPUTS[2].buf[k] = syl;
    }
}
