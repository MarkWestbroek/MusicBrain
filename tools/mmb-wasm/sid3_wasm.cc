// tp_mmb_sid3 — SID 3-osc (spiegel van Sid3Module.h): dezelfde engine als
// tp_mmb_sid (mmb_dsp::SidSynth), maar met instellingen per stem en
// Stack/Split. Native 44,1 kHz, blok 32, mono.
#include "mmb_abi.h"
#include "mmb_dsp/sid.h"

const char* const MMB_TYPE_ID     = "tp_mmb_sid3";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

constexpr int kVoices = mmb_dsp::SidSynth::kVoices;

MmbPort MMB_INPUTS[] = {
    { "voct_1", MMB_CV, 0, {} },   { "voct_2", MMB_CV, 0, {} },   { "voct_3", MMB_CV, 0, {} },
    { "gate_1", MMB_GATE, 0, {} }, { "gate_2", MMB_GATE, 0, {} }, { "gate_3", MMB_GATE, 0, {} },
    { "bend", MMB_CV, 0, {} },     { "pw_cv", MMB_CV, 0, {} },
    { "cutoff_cv", MMB_CV, 0, {} }, { "ext_in", MMB_AUDIO, 0, {} },
};
const int MMB_NUM_INPUTS = 2 * kVoices + 4;
inline int IN_VOCT(int k) { return k; }
inline int IN_GATE(int k) { return kVoices + k; }
enum { IN_BEND = 2 * kVoices, IN_PW, IN_CUTOFF, IN_EXT };

MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

// Per stem, in deze volgorde, voor k = 1..3: index = (k − 1) · kPer + naam.
enum { V_TRI, V_SAW, V_PULSE, V_NOISE, V_PW, V_RING, V_SYNC, V_ATTACK, V_DECAY, V_SUSTAIN, V_RELEASE,
       V_COARSE, V_FINE, V_FILT, kPer };
enum { C_STACK = kVoices * kPer, C_COMBO, C_VOLUME, C_LEVEL, C_CUTOFF, C_RES, C_LP, C_BP, C_HP, C_MODEL, C_CURVE };
#define SID3_VOICE(k, tri, saw, pulse, coarse, fine) \
    { "tri_" #k, tri }, { "saw_" #k, saw }, { "pulse_" #k, pulse }, { "noise_" #k, 0.f }, { "pw_" #k, 0.5f }, \
    { "ring_" #k, 0.f }, { "sync_" #k, 0.f }, { "attack_" #k, 0.f }, { "decay_" #k, 9.f }, \
    { "sustain_" #k, 10.f }, { "release_" #k, 9.f }, { "coarse_" #k, coarse }, { "fine_" #k, fine }, \
    { "filt_" #k, 0.f }
MmbControl MMB_CONTROLS[] = {
    // Standaardstemmen, gelijk aan het paneel: pulse; saw 8 ct hoger; driehoek een octaaf lager.
    SID3_VOICE(1, 0.f, 0.f, 1.f, 0.f, 0.f),
    SID3_VOICE(2, 0.f, 1.f, 0.f, 0.f, 8.f),
    SID3_VOICE(3, 1.f, 0.f, 0.f, -12.f, 0.f),
    { "stack", 1.f }, { "combo", 7.f }, { "volume", 15.f }, { "level", 0.8f },
    { "cutoff", 1024.f }, { "res", 0.f }, { "lp", 1.f }, { "bp", 0.f }, { "hp", 0.f },
    { "model", 0.f }, { "curve", 0.5f },
};
const int MMB_NUM_CONTROLS = kVoices * kPer + 11;

namespace {
mmb_dsp::SidSynth g_sid;
int nib(float v) { return static_cast<int>(v + 0.5f); }
}

void mmb_setup() { g_sid.Init(MMB_NATIVE_RATE); }

void mmb_on_control(int idx, float v) {
    using C = mmb_dsp::SidChip;
    if (idx < kVoices * kPer) {
        const int k = idx / kPer;
        switch (idx % kPer) {
            case V_TRI:     g_sid.setWaveBit(k, C::kTri,   v >= 0.5f); break;
            case V_SAW:     g_sid.setWaveBit(k, C::kSaw,   v >= 0.5f); break;
            case V_PULSE:   g_sid.setWaveBit(k, C::kPulse, v >= 0.5f); break;
            case V_NOISE:   g_sid.setWaveBit(k, C::kNoise, v >= 0.5f); break;
            case V_PW:      g_sid.setPw(k, v); break;
            case V_RING:    g_sid.setRing(k, v >= 0.5f); break;
            case V_SYNC:    g_sid.setSync(k, v >= 0.5f); break;
            case V_ATTACK:  g_sid.setAttack(k, nib(v)); break;
            case V_DECAY:   g_sid.setDecay(k, nib(v)); break;
            case V_SUSTAIN: g_sid.setSustain(k, nib(v)); break;
            case V_RELEASE: g_sid.setRelease(k, nib(v)); break;
            case V_COARSE:  g_sid.setCoarse(k, v); break;
            case V_FINE:    g_sid.setFine(k, v); break;
            case V_FILT:    g_sid.setFilt(k, v >= 0.5f); break;
        }
        return;
    }
    switch (idx) {
        case C_STACK:  g_sid.setStack(v >= 0.5f); break;
        case C_COMBO:  g_sid.setCombo(v); break;
        case C_VOLUME: g_sid.setVolume(nib(v)); break;
        case C_LEVEL:  g_sid.setLevel(v); break;
        case C_CUTOFF: g_sid.setCutoff(v); break;
        case C_RES:    g_sid.setRes(nib(v)); break;
        case C_LP:     g_sid.setMode(mmb_dsp::SidSynth::kLp, v >= 0.5f); break;
        case C_BP:     g_sid.setMode(mmb_dsp::SidSynth::kBp, v >= 0.5f); break;
        case C_HP:     g_sid.setMode(mmb_dsp::SidSynth::kHp, v >= 0.5f); break;
        case C_MODEL:  g_sid.setModel(nib(v)); break;
        case C_CURVE:  g_sid.setCurve(v); break;
    }
}

void mmb_process(int frames) {
    for (int k = 0; k < kVoices; ++k) {
        g_sid.setVoct(k, mmb_in0(IN_VOCT(k)));
        g_sid.gate(k, mmb_gate_in(IN_GATE(k)));
    }
    g_sid.setBend(mmb_connected(IN_BEND) ? mmb_in0(IN_BEND) : 0.f);
    g_sid.setPwCv(mmb_connected(IN_PW) ? mmb_in0(IN_PW) : 0.f);
    g_sid.setCutoffCv(mmb_connected(IN_CUTOFF) ? mmb_in0(IN_CUTOFF) : 0.f);
    const float* ext = MMB_INPUTS[IN_EXT].buf;
    const bool hasExt = mmb_connected(IN_EXT);
    float* out = MMB_OUTPUTS[0].buf;
    for (int i = 0; i < frames; ++i) out[i] = g_sid.Process(hasExt ? ext[i] : 0.f);
}
