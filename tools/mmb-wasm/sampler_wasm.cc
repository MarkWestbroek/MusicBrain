// tp_mmb_sampler — multisample-speler (spiegel van SamplerModule.h; de DSP is
// mmb_dsp::SamplePlayer, dezelfde header als de firmware). Native 44,1 kHz,
// blok 32, 4 uitgangen (mono → L+R, stereo → 1/2, quad → 1–4).
//
// Samples komen via de blob-exports in wasm-geheugen (32 slots, gedeeld door
// alle instanties — zoals de PSRAM-bank op de Teensy); de keymap via
// mmb_zone_set/mmb_zone_count. Intern 8 stemmen met een eigen allocator,
// zodat één module akkoorden en overlappende uitstervingen aankan.
#include "mmb_abi.h"
#include <cstdlib>
#include <cstring>
#include "mmb_dsp/sample_player.h"

const char* const MMB_TYPE_ID     = "tp_mmb_sampler";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_VOCT, IN_GATE, IN_VEL };
MmbPort MMB_INPUTS[] = {
    { "voct", MMB_CV, 0, {} }, { "gate", MMB_GATE, 0, {} }, { "vel", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = {
    { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} },
    { "out_3", MMB_AUDIO, 0, {} }, { "out_4", MMB_AUDIO, 0, {} },
};
const int MMB_NUM_OUTPUTS = 4;

enum { C_COARSE, C_FINE, C_START, C_ATTACK, C_LEVEL };
MmbControl MMB_CONTROLS[] = {
    { "coarse", 0.f }, { "fine", 0.f }, { "start", 0.f }, { "attack", 1.5f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 5;

namespace {
constexpr int kSlots  = 32;
constexpr int kZones  = 128;
constexpr int kVoices = 8;

int16_t*             g_blob[kSlots];
int                  g_cap[kSlots];
mmb_dsp::SampleSlot  g_slots[kSlots];
mmb_dsp::Zone        g_zones[kZones];
int                  g_numZones = 0;

mmb_dsp::SamplePlayer g_voice[kVoices];
uint32_t              g_age[kVoices];
uint32_t              g_ageCounter = 0;

float g_coarse = 0.f, g_fine = 0.f, g_start = 0.f, g_attack = 1.5f, g_level = 0.8f;
bool  g_gate = false;

void rebind() {
    for (int i = 0; i < kVoices; ++i) {
        g_voice[i].bind(g_slots, kSlots, g_zones, g_numZones);
        g_voice[i].set_transpose(g_coarse + g_fine * 0.01f);
        g_voice[i].set_startOffset(g_start);
        g_voice[i].setAttackMs(g_attack);
        g_voice[i].set_level(g_level);
    }
}
}

// ── bank-exports ──────────────────────────────────────────────────────
/** Reserveer/geef het adres van slot `slot` voor `bytes` bytes int16-data. */
MMB_EXPORT(mmb_blob_ptr) int16_t* mmb_blob_ptr(int slot, int bytes) {
    if (slot < 0 || slot >= kSlots || bytes <= 0) return nullptr;
    if (g_cap[slot] < bytes) {
        void* p = std::realloc(g_blob[slot], static_cast<size_t>(bytes));
        if (!p) return nullptr;
        g_blob[slot] = static_cast<int16_t*>(p);
        g_cap[slot] = bytes;
    }
    return g_blob[slot];
}
/** Slot geldig maken: `frames` frames van `channels` kanalen op `rate` Hz. */
MMB_EXPORT(mmb_blob_commit) void mmb_blob_commit(int slot, int frames, float rate, int channels) {
    if (slot < 0 || slot >= kSlots) return;
    if (channels < 1) channels = 1;
    if (channels > mmb_dsp::kMaxChannels) channels = mmb_dsp::kMaxChannels;
    g_slots[slot].data     = g_blob[slot];
    g_slots[slot].frames   = frames;
    g_slots[slot].channels = channels;
    g_slots[slot].rate     = rate > 0.f ? rate : MMB_NATIVE_RATE;
    rebind();
}

// ── keymap-exports ────────────────────────────────────────────────────
MMB_EXPORT(mmb_zone_set) void mmb_zone_set(
    int idx, int slot, int lowKey, int highKey, int lowVel, int highVel,
    float root, float tuneCents, float gain, float pan,
    int loopMode, int loopStart, int loopEnd, float decay, float release) {
    if (idx < 0 || idx >= kZones) return;
    mmb_dsp::Zone& z = g_zones[idx];
    z.slot = static_cast<uint8_t>(slot);
    z.lowKey = static_cast<uint8_t>(lowKey);   z.highKey = static_cast<uint8_t>(highKey);
    z.lowVel = static_cast<uint8_t>(lowVel);   z.highVel = static_cast<uint8_t>(highVel);
    z.root = root; z.tuneCents = tuneCents; z.gain = gain; z.pan = pan;
    z.loopMode = static_cast<uint8_t>(loopMode);
    z.loopStart = loopStart; z.loopEnd = loopEnd;
    z.decay = decay; z.release = release;
}
MMB_EXPORT(mmb_zone_count) void mmb_zone_count(int n) {
    g_numZones = n < 0 ? 0 : (n > kZones ? kZones : n);
    rebind();
}
/** Diagnose voor de editor: hoeveel stemmen klinken er? */
MMB_EXPORT(mmb_active_voices) int mmb_active_voices() {
    int n = 0;
    for (int i = 0; i < kVoices; ++i) if (g_voice[i].active()) ++n;
    return n;
}

void mmb_setup() {
    for (int i = 0; i < kVoices; ++i) g_voice[i].Init(MMB_NATIVE_RATE);
    rebind();
}

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_COARSE: g_coarse = v; break;
        case C_FINE:   g_fine = v; break;
        case C_START:  g_start = v; break;
        case C_ATTACK: g_attack = v; break;
        case C_LEVEL:  g_level = v; break;
    }
    for (int i = 0; i < kVoices; ++i) {
        g_voice[i].set_transpose(g_coarse + g_fine * 0.01f);
        g_voice[i].set_startOffset(g_start);
        g_voice[i].setAttackMs(g_attack);
        g_voice[i].set_level(g_level);
    }
}

namespace {
/** Stem kiezen: zelfde noot → hertrigger, anders vrij, anders de oudste. */
int allocate(int midi) {
    for (int i = 0; i < kVoices; ++i) if (g_voice[i].active() && g_voice[i].note() == midi) return i;
    for (int i = 0; i < kVoices; ++i) if (!g_voice[i].active()) return i;
    int best = 0;
    for (int i = 1; i < kVoices; ++i) if (g_age[i] < g_age[best]) best = i;
    return best;
}
}

void mmb_process(int frames) {
    const float voct = mmb_in0(IN_VOCT);
    const float velIn = mmb_connected(IN_VEL) ? mmb_in0(IN_VEL) : 0.8f;
    const bool high = mmb_gate_in(IN_GATE);
    if (high && !g_gate) {
        // V/Oct → noot; de zone kiest zelf het sample en de laag.
        const int midi = static_cast<int>(std::lround(60.0f + 12.0f * voct));
        const int v = allocate(midi);
        g_age[v] = ++g_ageCounter;
        g_voice[v].set_voct(voct);
        g_voice[v].noteOn(midi, static_cast<int>(velIn * 127.0f));
    } else if (!high && g_gate) {
        for (int i = 0; i < kVoices; ++i) g_voice[i].noteOff(-1);
    }
    g_gate = high;

    for (int o = 0; o < MMB_NUM_OUTPUTS; ++o)
        std::memset(MMB_OUTPUTS[o].buf, 0, sizeof(float) * static_cast<size_t>(frames));

    float mix[mmb_dsp::kMaxChannels];
    for (int k = 0; k < frames; ++k) {
        for (int c = 0; c < mmb_dsp::kMaxChannels; ++c) mix[c] = 0.f;
        for (int i = 0; i < kVoices; ++i) g_voice[i].Process(mix, MMB_NUM_OUTPUTS);
        for (int c = 0; c < MMB_NUM_OUTPUTS; ++c) {
            float y = mix[c];
            if (y > 1.f) y = 1.f; else if (y < -1.f) y = -1.f;
            MMB_OUTPUTS[c].buf[k] = y;
        }
    }
}
