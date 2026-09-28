// tp_mmb_sid — SID 6581/8580, eigen emulatie (spiegel van SidModule.h; de DSP
// is mmb_dsp::SidSynth, dezelfde header als de firmware). Native 44,1 kHz,
// blok 32, mono.
//
// Multi-module zoals de sampler: drie stem-cellen voct_k/gate_k; wie welke
// cel bespeelt beslist MIDI-in (PolyGroup). De SID-registers worden per blok
// bijgewerkt, zoals de firmware ze per CV-tick schrijft.
#include "mmb_abi.h"
#include "mmb_dsp/sid.h"

const char* const MMB_TYPE_ID     = "tp_mmb_sid";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

constexpr int kVoices = mmb_dsp::SidSynth::kVoices;

MmbPort MMB_INPUTS[] = {
    { "voct_1", MMB_CV, 0, {} },   { "voct_2", MMB_CV, 0, {} },   { "voct_3", MMB_CV, 0, {} },
    { "gate_1", MMB_GATE, 0, {} }, { "gate_2", MMB_GATE, 0, {} }, { "gate_3", MMB_GATE, 0, {} },
    { "bend", MMB_CV, 0, {} },     { "pw_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 2 * kVoices + 2;
inline int IN_VOCT(int k) { return k; }
inline int IN_GATE(int k) { return kVoices + k; }
enum { IN_BEND = 2 * kVoices, IN_PW };

MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_TRI, C_SAW, C_PULSE, C_NOISE, C_PW, C_RING, C_SYNC, C_ATTACK, C_DECAY, C_SUSTAIN, C_RELEASE,
       C_COARSE, C_FINE, C_VOLUME, C_LEVEL };
MmbControl MMB_CONTROLS[] = {
    { "tri", 0.f }, { "saw", 0.f }, { "pulse", 1.f }, { "noise", 0.f }, { "pw", 0.5f },
    { "ring", 0.f }, { "sync", 0.f },
    { "attack", 0.f }, { "decay", 9.f }, { "sustain", 10.f }, { "release", 9.f },
    { "coarse", 0.f }, { "fine", 0.f }, { "volume", 15.f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 15;

namespace {
mmb_dsp::SidSynth g_sid;
int nib(float v) { return static_cast<int>(v + 0.5f); }
}

void mmb_setup() { g_sid.Init(MMB_NATIVE_RATE); }

void mmb_on_control(int idx, float v) {
    using C = mmb_dsp::SidChip;
    switch (idx) {
        case C_TRI:     g_sid.setWaveBit(C::kTri,   v >= 0.5f); break;
        case C_SAW:     g_sid.setWaveBit(C::kSaw,   v >= 0.5f); break;
        case C_PULSE:   g_sid.setWaveBit(C::kPulse, v >= 0.5f); break;
        case C_NOISE:   g_sid.setWaveBit(C::kNoise, v >= 0.5f); break;
        case C_PW:      g_sid.setPw(v); break;
        case C_RING:    g_sid.setRing(v >= 0.5f); break;
        case C_SYNC:    g_sid.setSync(v >= 0.5f); break;
        case C_ATTACK:  g_sid.setAttack(nib(v)); break;
        case C_DECAY:   g_sid.setDecay(nib(v)); break;
        case C_SUSTAIN: g_sid.setSustain(nib(v)); break;
        case C_RELEASE: g_sid.setRelease(nib(v)); break;
        case C_COARSE:  g_sid.setCoarse(v); break;
        case C_FINE:    g_sid.setFine(v); break;
        case C_VOLUME:  g_sid.setVolume(nib(v)); break;
        case C_LEVEL:   g_sid.setLevel(v); break;
    }
}

void mmb_process(int frames) {
    for (int k = 0; k < kVoices; ++k) {
        g_sid.setVoct(k, mmb_in0(IN_VOCT(k)));
        g_sid.gate(k, mmb_gate_in(IN_GATE(k)));
    }
    g_sid.setBend(mmb_connected(IN_BEND) ? mmb_in0(IN_BEND) : 0.f);
    g_sid.setPwCv(mmb_connected(IN_PW) ? mmb_in0(IN_PW) : 0.f);
    float* out = MMB_OUTPUTS[0].buf;
    for (int i = 0; i < frames; ++i) out[i] = g_sid.Process();
}
