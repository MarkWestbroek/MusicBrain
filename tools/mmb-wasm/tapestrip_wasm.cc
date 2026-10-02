// tp_mmb_tapestrip — Mellotron-mechanica om een gewone samplebank: acht
// stemmen (mmb_dsp::SamplePlayer, dezelfde bank en keymap als de sampler)
// door mmb_dsp::TapeStrip (bandje per toets, veerterugloop, kopcontact,
// motorbelasting, wow/flutter, slijtage). Spiegel van TapeStripModule.h.
// Native 44,1 kHz, blok 32, stereo. Blobs en zones komen via dezelfde
// exports als de sampler (de editor zet de bank in beide typen).
#include "mmb_abi.h"
#include <cstdlib>
#include <cstring>
#include <cmath>
#include "mmb_dsp/limiter.h"
#include "mmb_dsp/sample_player.h"
#include "mmb_dsp/tape_strip.h"

const char* const MMB_TYPE_ID     = "tp_mmb_tapestrip";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

constexpr int kVoices = 8;

MmbPort MMB_INPUTS[] = {
    { "voct_1", MMB_CV, 0, {} }, { "voct_2", MMB_CV, 0, {} }, { "voct_3", MMB_CV, 0, {} }, { "voct_4", MMB_CV, 0, {} },
    { "voct_5", MMB_CV, 0, {} }, { "voct_6", MMB_CV, 0, {} }, { "voct_7", MMB_CV, 0, {} }, { "voct_8", MMB_CV, 0, {} },
    { "gate_1", MMB_GATE, 0, {} }, { "gate_2", MMB_GATE, 0, {} }, { "gate_3", MMB_GATE, 0, {} }, { "gate_4", MMB_GATE, 0, {} },
    { "gate_5", MMB_GATE, 0, {} }, { "gate_6", MMB_GATE, 0, {} }, { "gate_7", MMB_GATE, 0, {} }, { "gate_8", MMB_GATE, 0, {} },
    { "vel_1", MMB_CV, 0, {} }, { "vel_2", MMB_CV, 0, {} }, { "vel_3", MMB_CV, 0, {} }, { "vel_4", MMB_CV, 0, {} },
    { "vel_5", MMB_CV, 0, {} }, { "vel_6", MMB_CV, 0, {} }, { "vel_7", MMB_CV, 0, {} }, { "vel_8", MMB_CV, 0, {} },
    { "press", MMB_CV, 0, {} }, { "bend", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 3 * kVoices + 2;
const int IN_PRESS = 3 * kVoices, IN_BEND = 3 * kVoices + 1;
inline int IN_VOCT(int k) { return k; }
inline int IN_GATE(int k) { return kVoices + k; }
inline int IN_VEL(int k)  { return 2 * kVoices + k; }

MmbPort MMB_OUTPUTS[] = {
    { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} },
    { "tape", MMB_CV, 0, {} }, { "load", MMB_CV, 0, {} },
};
const int MMB_NUM_OUTPUTS = 4;

enum { C_BANK, C_LENGTH, C_RETURN, C_CONTACT, C_MOTOR, C_WOW, C_FLUTTER, C_WEAR, C_LEVEL };
MmbControl MMB_CONTROLS[] = {
    { "bank", 0.f }, { "length", 8.f }, { "return", 1.f }, { "contact", 0.5f }, { "motor", 0.4f },
    { "wow", 0.3f }, { "flutter", 0.3f }, { "wear", 0.3f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 9;

namespace {
constexpr int kSlots = 256;
constexpr int kZones = 512;
int16_t*             g_blob[kSlots];
int                  g_cap[kSlots];
mmb_dsp::SampleSlot  g_slots[kSlots];
mmb_dsp::Zone        g_zones[kZones];
int                  g_numZones = 0;

mmb_dsp::SamplePlayer  g_voice[kVoices];
mmb_dsp::TapeStrip     g_strip;
mmb_dsp::OutputLimiter g_limiter;
bool  g_gate[kVoices];
float g_voct[kVoices];

void rebind() {
    for (int i = 0; i < kVoices; ++i) {
        g_voice[i].bind(g_slots, kSlots, g_zones, g_numZones);
        g_voice[i].set_level(1.0f);   // niveau zit in de strip
    }
}
}

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
MMB_EXPORT(mmb_zone_set) void mmb_zone_set(
    int idx, int slot, int lowKey, int highKey, int lowVel, int highVel,
    float root, float tuneCents, float gain, float pan,
    int loopMode, int loopStart, int loopEnd, float decay, float release,
    int velTrack, float attack) {
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
    z.attack = attack > 0.0f ? attack : 0.0f;
}
MMB_EXPORT(mmb_zone_count) void mmb_zone_count(int n) {
    g_numZones = n < 0 ? 0 : (n > kZones ? kZones : n);
    rebind();
}
MMB_EXPORT(mmb_active_voices) int mmb_active_voices() {
    int n = 0;
    for (int i = 0; i < kVoices; ++i) if (g_voice[i].active()) ++n;
    return n;
}

void mmb_setup() {
    for (int i = 0; i < kVoices; ++i) { g_voice[i].Init(MMB_NATIVE_RATE); g_gate[i] = false; g_voct[i] = 0; }
    g_strip.Init(MMB_NATIVE_RATE);
    g_limiter.Init(MMB_NATIVE_RATE);
    rebind();
}

void mmb_on_control(int idx, float v) {
    if (idx == C_BANK) return;   // bankkeuze is een editor/Teensy-zaak; de wasm krijgt de blobs
    g_strip.setControl(idx - 1, v);
}

void mmb_process(int frames) {
    const float bend = mmb_connected(IN_BEND) ? mmb_in0(IN_BEND) : 0.f;
    g_strip.setPress(mmb_connected(IN_PRESS) ? mmb_in0(IN_PRESS) : 0.f);
    for (int k = 0; k < kVoices; ++k) {
        g_voct[k] = mmb_in0(IN_VOCT(k)) + bend;
        const bool high = mmb_gate_in(IN_GATE(k));
        if (high && !g_gate[k]) {
            const float velIn = mmb_connected(IN_VEL(k)) ? mmb_in0(IN_VEL(k)) : 0.8f;
            const int velocity = static_cast<int>(velIn * 127.0f);
            const int midi = static_cast<int>(std::lround(60.0f + 12.0f * (g_voct[k] - bend)));
            const float startSeconds = g_strip.noteOn(k, midi);
            const float offset = g_voice[k].tapeStartOffset(midi, velocity, startSeconds);
            if (offset >= 0.f) {
                g_voice[k].set_startOffset(offset);
                g_voice[k].set_voct(g_voct[k] + g_strip.voctOffset(k));
                g_voice[k].noteOn(midi, velocity);
            } else {
                g_voice[k].kill();     // bandje voorbij de opname of geen bank: stilte
                g_strip.noteOff(k);    // en geen lopende band, dus ook geen ruis
            }
        } else if (!high && g_gate[k]) {
            g_strip.noteOff(k);
            g_voice[k].noteOff(-1);
        }
        g_gate[k] = high;
    }
    g_strip.PrepareBlock(frames);
    for (int k = 0; k < kVoices; ++k) {
        if (!g_voice[k].active()) continue;
        if (g_strip.stopped(k)) { g_voice[k].kill(); continue; }
        g_voice[k].set_voct(g_voct[k] + g_strip.voctOffset(k));
        g_voice[k].PrepareBlock();
    }

    float mix[mmb_dsp::kMaxChannels], one[mmb_dsp::kMaxChannels];
    for (int s = 0; s < frames; ++s) {
        for (int c = 0; c < mmb_dsp::kMaxChannels; ++c) mix[c] = 0.f;
        for (int k = 0; k < kVoices; ++k) {
            if (!g_voice[k].active()) continue;
            for (int c = 0; c < mmb_dsp::kMaxChannels; ++c) one[c] = 0.f;
            g_voice[k].Process(one, 2);
            g_strip.Process(k, one, 2);
            mix[0] += one[0]; mix[1] += one[1];
        }
        const float hiss = g_strip.hiss();
        mix[0] += hiss; mix[1] += hiss;
        g_limiter.Process(mix, 2);
        MMB_OUTPUTS[0].buf[s] = mix[0];
        MMB_OUTPUTS[1].buf[s] = mix[1];
        MMB_OUTPUTS[2].buf[s] = g_strip.tapePosition();
        MMB_OUTPUTS[3].buf[s] = g_strip.load();
    }
}
