// tp_mmb_sid — SID 6581/8580, eigen emulatie (spiegel van SidModule.h; de DSP
// is mmb_dsp::SidMulti, dezelfde header als de firmware). Native 44,1 kHz,
// blok 32.
//
// Multi-module zoals de sampler: 1–4 chips met elk drie stem-cellen
// (voct_1..12/gate_1..12; cel 1–3 = chip 1, 4–6 = chip 2, …); wie welke cel
// bespeelt beslist MIDI-in (PolyGroup). Uitgangen: mono, stereo (Spread) en
// elke chip apart. EXT IN per chip (ext_in = chip 1, ext_2..4).
#include "mmb_abi.h"
#include "mmb_dsp/sid.h"

const char* const MMB_TYPE_ID     = "tp_mmb_sid";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

constexpr int kCells = mmb_dsp::SidMulti::kCells;

MmbPort MMB_INPUTS[] = {
    { "voct_1", MMB_CV, 0, {} },  { "voct_2", MMB_CV, 0, {} },  { "voct_3", MMB_CV, 0, {} },
    { "voct_4", MMB_CV, 0, {} },  { "voct_5", MMB_CV, 0, {} },  { "voct_6", MMB_CV, 0, {} },
    { "voct_7", MMB_CV, 0, {} },  { "voct_8", MMB_CV, 0, {} },  { "voct_9", MMB_CV, 0, {} },
    { "voct_10", MMB_CV, 0, {} }, { "voct_11", MMB_CV, 0, {} }, { "voct_12", MMB_CV, 0, {} },
    { "gate_1", MMB_GATE, 0, {} },  { "gate_2", MMB_GATE, 0, {} },  { "gate_3", MMB_GATE, 0, {} },
    { "gate_4", MMB_GATE, 0, {} },  { "gate_5", MMB_GATE, 0, {} },  { "gate_6", MMB_GATE, 0, {} },
    { "gate_7", MMB_GATE, 0, {} },  { "gate_8", MMB_GATE, 0, {} },  { "gate_9", MMB_GATE, 0, {} },
    { "gate_10", MMB_GATE, 0, {} }, { "gate_11", MMB_GATE, 0, {} }, { "gate_12", MMB_GATE, 0, {} },
    { "bend", MMB_CV, 0, {} },      { "pw_cv", MMB_CV, 0, {} },
    { "cutoff_cv", MMB_CV, 0, {} },
    { "ext_in", MMB_AUDIO, 0, {} }, { "ext_2", MMB_AUDIO, 0, {} }, { "ext_3", MMB_AUDIO, 0, {} }, { "ext_4", MMB_AUDIO, 0, {} },
};
const int MMB_NUM_INPUTS = 2 * kCells + 3 + mmb_dsp::SidMulti::kMaxChips;
inline int IN_VOCT(int k) { return k; }
inline int IN_GATE(int k) { return kCells + k; }
enum { IN_BEND = 2 * kCells, IN_PW, IN_CUTOFF, IN_EXT };   // IN_EXT + j = chip j

// Zelfde volgorde als mmb_dsp::SidMulti::Out.
MmbPort MMB_OUTPUTS[] = {
    { "out", MMB_AUDIO, 0, {} }, { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} },
    { "sid_1", MMB_AUDIO, 0, {} }, { "sid_2", MMB_AUDIO, 0, {} }, { "sid_3", MMB_AUDIO, 0, {} }, { "sid_4", MMB_AUDIO, 0, {} },
};
const int MMB_NUM_OUTPUTS = mmb_dsp::SidMulti::kNumOuts;

enum { C_TRI, C_SAW, C_PULSE, C_NOISE, C_PW, C_RING, C_SYNC, C_ATTACK, C_DECAY, C_SUSTAIN, C_RELEASE,
       C_COARSE, C_FINE, C_VOLUME, C_LEVEL, C_COMBO, C_CUTOFF, C_RES, C_FILT, C_LP, C_BP, C_HP, C_MODEL, C_CURVE,
       C_CHIPS, C_SPREAD };
MmbControl MMB_CONTROLS[] = {
    { "tri", 0.f }, { "saw", 0.f }, { "pulse", 1.f }, { "noise", 0.f }, { "pw", 0.5f },
    { "ring", 0.f }, { "sync", 0.f },
    { "attack", 0.f }, { "decay", 9.f }, { "sustain", 10.f }, { "release", 9.f },
    { "coarse", 0.f }, { "fine", 0.f }, { "volume", 15.f }, { "level", 0.8f }, { "combo", 7.f },
    { "cutoff", 1024.f }, { "res", 0.f }, { "filt", 0.f }, { "lp", 1.f }, { "bp", 0.f }, { "hp", 0.f },
    { "model", 0.f }, { "curve", 0.5f },
    { "chips", 1.f }, { "spread", 0.7f },
};
const int MMB_NUM_CONTROLS = 26;

namespace {
mmb_dsp::SidMulti g_sid;
int nib(float v) { return static_cast<int>(v + 0.5f); }
}

void mmb_setup() { g_sid.Init(MMB_NATIVE_RATE); }

void mmb_on_control(int idx, float v) {
    using C = mmb_dsp::SidChip;
    using S = mmb_dsp::SidSynth;
    const bool on = v >= 0.5f;
    switch (idx) {
        case C_TRI:     g_sid.all([&](S& s) { s.setWaveBit(C::kTri, on); }); break;
        case C_SAW:     g_sid.all([&](S& s) { s.setWaveBit(C::kSaw, on); }); break;
        case C_PULSE:   g_sid.all([&](S& s) { s.setWaveBit(C::kPulse, on); }); break;
        case C_NOISE:   g_sid.all([&](S& s) { s.setWaveBit(C::kNoise, on); }); break;
        case C_PW:      g_sid.all([&](S& s) { s.setPw(v); }); break;
        case C_RING:    g_sid.all([&](S& s) { s.setRing(on); }); break;
        case C_SYNC:    g_sid.all([&](S& s) { s.setSync(on); }); break;
        case C_ATTACK:  g_sid.all([&](S& s) { s.setAttack(nib(v)); }); break;
        case C_DECAY:   g_sid.all([&](S& s) { s.setDecay(nib(v)); }); break;
        case C_SUSTAIN: g_sid.all([&](S& s) { s.setSustain(nib(v)); }); break;
        case C_RELEASE: g_sid.all([&](S& s) { s.setRelease(nib(v)); }); break;
        case C_COARSE:  g_sid.all([&](S& s) { s.setCoarse(v); }); break;
        case C_FINE:    g_sid.all([&](S& s) { s.setFine(v); }); break;
        case C_VOLUME:  g_sid.all([&](S& s) { s.setVolume(nib(v)); }); break;
        case C_LEVEL:   g_sid.all([&](S& s) { s.setLevel(v); }); break;
        case C_COMBO:   g_sid.all([&](S& s) { s.setCombo(v); }); break;
        case C_CUTOFF:  g_sid.all([&](S& s) { s.setCutoff(v); }); break;
        case C_RES:     g_sid.all([&](S& s) { s.setRes(nib(v)); }); break;
        case C_FILT:    g_sid.all([&](S& s) { s.setFilt(on); }); break;
        case C_LP:      g_sid.all([&](S& s) { s.setMode(S::kLp, on); }); break;
        case C_BP:      g_sid.all([&](S& s) { s.setMode(S::kBp, on); }); break;
        case C_HP:      g_sid.all([&](S& s) { s.setMode(S::kHp, on); }); break;
        case C_MODEL:   g_sid.all([&](S& s) { s.setModel(nib(v)); }); break;
        case C_CURVE:   g_sid.all([&](S& s) { s.setCurve(v); }); break;
        case C_CHIPS:   g_sid.setChips(nib(v)); break;
        case C_SPREAD:  g_sid.setSpread(v); break;
    }
}

void mmb_process(int frames) {
    for (int k = 0; k < kCells; ++k) {
        g_sid.setVoct(k, mmb_in0(IN_VOCT(k)));
        g_sid.gate(k, mmb_gate_in(IN_GATE(k)));
    }
    const float bend = mmb_connected(IN_BEND) ? mmb_in0(IN_BEND) : 0.f;
    const float pw = mmb_connected(IN_PW) ? mmb_in0(IN_PW) : 0.f;
    const float cut = mmb_connected(IN_CUTOFF) ? mmb_in0(IN_CUTOFF) : 0.f;
    g_sid.all([&](mmb_dsp::SidSynth& s) { s.setBend(bend); s.setPwCv(pw); s.setCutoffCv(cut); });
    constexpr int kChips = mmb_dsp::SidMulti::kMaxChips;
    bool has[kChips];
    for (int j = 0; j < kChips; ++j) has[j] = mmb_connected(IN_EXT + j);
    float y[mmb_dsp::SidMulti::kNumOuts], x[kChips];
    for (int i = 0; i < frames; ++i) {
        for (int j = 0; j < kChips; ++j) x[j] = has[j] ? MMB_INPUTS[IN_EXT + j].buf[i] : 0.f;
        g_sid.Process(x, y);
        for (int o = 0; o < MMB_NUM_OUTPUTS; ++o) MMB_OUTPUTS[o].buf[i] = y[o];
    }
}
