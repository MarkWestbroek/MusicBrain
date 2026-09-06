// tp_mmb_sampler — multisample-speler (spiegel van SamplerModule.h; de DSP is
// mmb_dsp::SamplePlayer, dezelfde header als de firmware). Native 44,1 kHz,
// blok 32, 4 uitgangen (mono → L+R, stereo → 1/2, quad → 1–4).
//
// Multi-module (construct B, zie doc/uml/11-simulation-wasm.md): één
// instantie met acht stem-cellen die de bank delen. Elke cel heeft zijn eigen
// `voct_k`, `gate_k` en `vel_k`; wie welke cel bespeelt beslist de
// stemtoewijzer in MIDI-in of de poly-sequencer — hier zit géén allocator.
// Dat is dezelfde arbeidsverdeling als bij de QUAD-VCO, en het houdt de
// bank één keer in het geheugen in plaats van acht keer.
//
// Samples komen via de blob-exports in wasm-geheugen; de keymap via
// mmb_zone_set/mmb_zone_count.
#include "mmb_abi.h"
#include <cstdlib>
#include <cstring>
#include <cmath>
#include "mmb_dsp/sample_player.h"

const char* const MMB_TYPE_ID     = "tp_mmb_sampler";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

constexpr int kVoices = 8;

// Poorten per cel, in cel-volgorde: voct_1..8, gate_1..8, vel_1..8.
MmbPort MMB_INPUTS[] = {
    { "voct_1", MMB_CV, 0, {} }, { "voct_2", MMB_CV, 0, {} }, { "voct_3", MMB_CV, 0, {} }, { "voct_4", MMB_CV, 0, {} },
    { "voct_5", MMB_CV, 0, {} }, { "voct_6", MMB_CV, 0, {} }, { "voct_7", MMB_CV, 0, {} }, { "voct_8", MMB_CV, 0, {} },
    { "gate_1", MMB_GATE, 0, {} }, { "gate_2", MMB_GATE, 0, {} }, { "gate_3", MMB_GATE, 0, {} }, { "gate_4", MMB_GATE, 0, {} },
    { "gate_5", MMB_GATE, 0, {} }, { "gate_6", MMB_GATE, 0, {} }, { "gate_7", MMB_GATE, 0, {} }, { "gate_8", MMB_GATE, 0, {} },
    { "vel_1", MMB_CV, 0, {} }, { "vel_2", MMB_CV, 0, {} }, { "vel_3", MMB_CV, 0, {} }, { "vel_4", MMB_CV, 0, {} },
    { "vel_5", MMB_CV, 0, {} }, { "vel_6", MMB_CV, 0, {} }, { "vel_7", MMB_CV, 0, {} }, { "vel_8", MMB_CV, 0, {} },
    // Cutoff-CV per cel: het filter zit in de stem, de modulatie komt van buiten.
    { "cutoff_1", MMB_CV, 0, {} }, { "cutoff_2", MMB_CV, 0, {} }, { "cutoff_3", MMB_CV, 0, {} }, { "cutoff_4", MMB_CV, 0, {} },
    { "cutoff_5", MMB_CV, 0, {} }, { "cutoff_6", MMB_CV, 0, {} }, { "cutoff_7", MMB_CV, 0, {} }, { "cutoff_8", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 4 * kVoices;
inline int IN_VOCT(int k)   { return k; }
inline int IN_GATE(int k)   { return kVoices + k; }
inline int IN_VEL(int k)    { return 2 * kVoices + k; }
inline int IN_CUTOFF(int k) { return 3 * kVoices + k; }

MmbPort MMB_OUTPUTS[] = {
    { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} },
    { "out_3", MMB_AUDIO, 0, {} }, { "out_4", MMB_AUDIO, 0, {} },
    // Envelope-follower per cel (CV): env_k → cutoff_k is de auto-wah.
    { "env_1", MMB_CV, 0, {} }, { "env_2", MMB_CV, 0, {} }, { "env_3", MMB_CV, 0, {} }, { "env_4", MMB_CV, 0, {} },
    { "env_5", MMB_CV, 0, {} }, { "env_6", MMB_CV, 0, {} }, { "env_7", MMB_CV, 0, {} }, { "env_8", MMB_CV, 0, {} },
};
const int MMB_NUM_OUTPUTS = 4 + kVoices;
constexpr int kAudioOuts = 4;
inline int OUT_ENV(int k) { return kAudioOuts + k; }

enum { C_COARSE, C_FINE, C_START, C_ATTACK, C_LEVEL, C_FILTER, C_CUTOFF, C_Q, C_FMODE, C_DRIVE, C_CV_AMT, C_ENV_REL };
MmbControl MMB_CONTROLS[] = {
    { "coarse", 0.f }, { "fine", 0.f }, { "start", 0.f }, { "attack", 1.5f }, { "level", 0.8f },
    { "filter", 0.f }, { "cutoff", 2000.f }, { "q", 0.3f }, { "fmode", 0.f }, { "drive", 1.f },
    { "cv_amt", 4.f }, { "env_rel", 120.f },
};
const int MMB_NUM_CONTROLS = 12;

namespace {
// Ruimer dan de firmware: in de browser is het geheugen dynamisch en een
// geconverteerde SoundFont loopt zo tegen honderd samples aan (de YDP-vleugel
// heeft er 121 in 150 zones). De tabellen zelf kosten ~25 KB statisch; de
// sampledata hangt eronder aan losse allocaties. Op de Teensy blijft de
// limiet staan wat het PSRAM aankan — zie SamplerModule.h.
constexpr int kSlots  = 256;
constexpr int kZones  = 512;

int16_t*             g_blob[kSlots];
int                  g_cap[kSlots];
mmb_dsp::SampleSlot  g_slots[kSlots];
mmb_dsp::Zone        g_zones[kZones];
int                  g_numZones = 0;

mmb_dsp::SamplePlayer g_voice[kVoices];
bool                  g_gate[kVoices];

float g_coarse = 0.f, g_fine = 0.f, g_start = 0.f, g_attack = 1.5f, g_level = 0.8f;
int   g_filter = 0; float g_cutoff = 2000.f, g_q = 0.3f; int g_fmode = 0; float g_drive = 1.f, g_cvAmt = 4.f, g_envRel = 120.f;

void applyControls(mmb_dsp::SamplePlayer& v) {
    v.set_transpose(g_coarse + g_fine * 0.01f);
    v.set_startOffset(g_start);
    v.setAttackMs(g_attack);
    v.set_level(g_level);
    v.set_filter_type(g_filter);
    v.set_filter_cutoff(g_cutoff);
    v.set_filter_resonance(g_q);
    v.set_filter_mode(g_fmode);
    v.set_filter_drive(g_drive);
    v.set_cutoff_cv_amount(g_cvAmt);
    v.set_env_times(2.f, g_envRel);
}
void rebind() {
    for (int i = 0; i < kVoices; ++i) {
        g_voice[i].bind(g_slots, kSlots, g_zones, g_numZones);
        applyControls(g_voice[i]);
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
    int loopMode, int loopStart, int loopEnd, float decay, float release,
    int velTrack) {
    if (idx < 0 || idx >= kZones) return;
    mmb_dsp::Zone& z = g_zones[idx];
    z.slot = static_cast<uint8_t>(slot);
    z.lowKey = static_cast<uint8_t>(lowKey);   z.highKey = static_cast<uint8_t>(highKey);
    z.lowVel = static_cast<uint8_t>(lowVel);   z.highVel = static_cast<uint8_t>(highVel);
    z.root = root; z.tuneCents = tuneCents; z.gain = gain; z.pan = pan;
    z.loopMode = static_cast<uint8_t>(loopMode);
    z.loopStart = loopStart; z.loopEnd = loopEnd;
    z.decay = decay; z.release = release;
    z.velTrack = static_cast<uint8_t>(velTrack < 0 ? 0 : (velTrack > 127 ? 127 : velTrack));
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
    for (int i = 0; i < kVoices; ++i) { g_voice[i].Init(MMB_NATIVE_RATE); g_gate[i] = false; }
    rebind();
}

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_COARSE: g_coarse = v; break;
        case C_FINE:   g_fine = v; break;
        case C_START:  g_start = v; break;
        case C_ATTACK: g_attack = v; break;
        case C_LEVEL:  g_level = v; break;
        case C_FILTER: g_filter = static_cast<int>(v); break;
        case C_CUTOFF: g_cutoff = v; break;
        case C_Q:      g_q = v; break;
        case C_FMODE:  g_fmode = static_cast<int>(v); break;
        case C_DRIVE:  g_drive = v; break;
        case C_CV_AMT: g_cvAmt = v; break;
        case C_ENV_REL: g_envRel = v; break;
    }
    for (int i = 0; i < kVoices; ++i) applyControls(g_voice[i]);
}

void mmb_process(int frames) {
    // Per cel: gate-flank omhoog → noot op de V/Oct en velocity van díé cel;
    // omlaag → loslaten. V/Oct blijft daarna meebewegen (bend, glide).
    for (int k = 0; k < kVoices; ++k) {
        const float voct = mmb_in0(IN_VOCT(k));
        const bool high = mmb_gate_in(IN_GATE(k));
        if (high && !g_gate[k]) {
            const float velIn = mmb_connected(IN_VEL(k)) ? mmb_in0(IN_VEL(k)) : 0.8f;
            const int midi = static_cast<int>(std::lround(60.0f + 12.0f * voct));
            g_voice[k].set_voct(voct);
            g_voice[k].noteOn(midi, static_cast<int>(velIn * 127.0f));
        } else if (!high && g_gate[k]) {
            g_voice[k].noteOff(-1);
        } else if (g_voice[k].active()) {
            g_voice[k].set_voct(voct);
        }
        g_gate[k] = high;
        // Cutoff-CV van deze cel (0 als er niets op staat), coëfficiënten per blok.
        g_voice[k].set_cutoff_cv(mmb_connected(IN_CUTOFF(k)) ? mmb_in0(IN_CUTOFF(k)) : 0.f);
        g_voice[k].PrepareBlock();
    }

    for (int o = 0; o < MMB_NUM_OUTPUTS; ++o)
        std::memset(MMB_OUTPUTS[o].buf, 0, sizeof(float) * static_cast<size_t>(frames));

    float mix[mmb_dsp::kMaxChannels];
    for (int k = 0; k < frames; ++k) {
        for (int c = 0; c < mmb_dsp::kMaxChannels; ++c) mix[c] = 0.f;
        for (int i = 0; i < kVoices; ++i) g_voice[i].Process(mix, kAudioOuts);
        for (int o = 0; o < kAudioOuts; ++o) {
            float y = mix[o];
            if (!(y == y)) y = 0.f;
            MMB_OUTPUTS[o].buf[k] = y > 1.f ? 1.f : (y < -1.f ? -1.f : y);
        }
        for (int i = 0; i < kVoices; ++i) MMB_OUTPUTS[OUT_ENV(i)].buf[k] = g_voice[i].env();
    }
}
