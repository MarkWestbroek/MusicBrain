// tp_mmb_sampler — sample-speler (spiegel van SamplerModule.h; de DSP is
// mmb_dsp::SamplePlayer, dezelfde header als de firmware). Native 44,1 kHz,
// blok 32. Samples komen via de blob-exports in wasm-geheugen (16 slots,
// gedeeld door alle instanties — zoals de PSRAM-bank op de Teensy).
#include "mmb_abi.h"
#include <cstdlib>
#include "mmb_dsp/sample_player.h"

const char* const MMB_TYPE_ID     = "tp_mmb_sampler";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_VOCT, IN_GATE };
MmbPort MMB_INPUTS[] = { { "voct", MMB_CV, 0, {} }, { "gate", MMB_GATE, 0, {} } };
const int MMB_NUM_INPUTS = 2;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_SLOT, C_ROOT, C_COARSE, C_FINE, C_START, C_END, C_LOOP, C_MODE, C_ATTACK, C_RELEASE, C_LEVEL };
MmbControl MMB_CONTROLS[] = {
    { "slot", 0.f }, { "root", 60.f }, { "coarse", 0.f }, { "fine", 0.f }, { "start", 0.f }, { "end", 1.f },
    { "loop", 0.f }, { "mode", 0.f }, { "attack", 2.f }, { "release", 30.f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 11;

namespace {
constexpr int kSlots = 16;
int16_t* g_slot[kSlots];
int      g_len[kSlots];
float    g_rate[kSlots];
int      g_cap[kSlots];
mmb_dsp::SamplePlayer g_player;
int g_cur = 0;
bool g_gate = false;

void bindSlot() {
    const int s = g_cur;
    g_player.setSample(g_slot[s], g_len[s], g_rate[s] > 0 ? g_rate[s] : MMB_NATIVE_RATE);
}
}

// ── blob-exports (host: {t:'blob', slot, rate, data}) ──────────────────
MMB_EXPORT(mmb_blob_ptr) int16_t* mmb_blob_ptr(int slot, int bytes) {
    if (slot < 0 || slot >= kSlots || bytes <= 0) return nullptr;
    if (g_cap[slot] < bytes) {
        void* p = std::realloc(g_slot[slot], static_cast<size_t>(bytes));
        if (!p) return nullptr;
        g_slot[slot] = static_cast<int16_t*>(p);
        g_cap[slot] = bytes;
    }
    return g_slot[slot];
}
MMB_EXPORT(mmb_blob_commit) void mmb_blob_commit(int slot, int samples, float rate) {
    if (slot < 0 || slot >= kSlots) return;
    g_len[slot] = samples;
    g_rate[slot] = rate;
    if (slot == g_cur) bindSlot();
}

void mmb_setup() { g_player.Init(MMB_NATIVE_RATE); bindSlot(); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_SLOT:    { int s = static_cast<int>(v); if (s < 0) s = 0; if (s >= kSlots) s = kSlots - 1; if (s != g_cur) { g_cur = s; bindSlot(); } break; }
        case C_ROOT:    g_player.set_root(v); break;
        case C_COARSE:  g_player.set_coarse(v); break;
        case C_FINE:    g_player.set_fine(v); break;
        case C_START:   g_player.set_start(v); break;
        case C_END:     g_player.set_end(v); break;
        case C_LOOP:    g_player.set_loop(v >= 0.5f); break;
        case C_MODE:    g_player.set_gate_mode(v >= 0.5f); break;
        case C_ATTACK:  g_player.set_attack_ms(v); break;
        case C_RELEASE: g_player.set_release_ms(v); break;
        case C_LEVEL:   g_player.set_level(v); break;
    }
}

void mmb_process(int frames) {
    g_player.set_voct(mmb_in0(IN_VOCT));
    const bool high = mmb_gate_in(IN_GATE);
    if (high != g_gate) { g_player.gate(high); g_gate = high; }
    for (int k = 0; k < frames; ++k) {
        float y = g_player.Process();
        if (y > 1.f) y = 1.f; else if (y < -1.f) y = -1.f;
        MMB_OUTPUTS[0].buf[k] = y;
    }
}
