// tp_mmb_dx7 — één DX7-stem op de msfa-kern (spiegel van Dx7Module.h).
//
// Construct A (doc/uml/11-simulation-wasm.md): één stem per instantie, net
// als de firmware. Polyfonie is een PolyGroup ×N — acht instanties, en de
// stemtoewijzer in MIDI-in verdeelt de noten. De vroegere browser-eigen
// 16-stemmige kern met eigen allocator (tools/dx7-wasm) is hiermee vervallen;
// de JS-port en het referentieharnas daar blijven bestaan voor de
// sample-exact-test en compare.mjs.
//
// Banken en de edit-patch komen als blobs binnen (zelfde weg als samples bij
// de sampler): slots 0..7 = factory-ROMs 1A..4B, 8 = USER, 9 = edit-patch
// (156 bytes uitgepakt). De control `edit` (0/1) zet de edit-patch aan; die
// overstemt dan bank+program — de basis van de patcheditor.
//
// Rendert native op 44 100 Hz in blokken van 64 (msfa's N).
#include "mmb_abi.h"
#include <cstdint>
#include <cstring>
#include <cmath>

#include "msfa/synth.h"
#include "msfa/freqlut.h"
#include "msfa/exp2.h"
#include "msfa/sin.h"
#include "msfa/lfo.h"
#include "msfa/pitchenv.h"
#include "msfa/dx7note.h"
#include "msfa/patch.h"
#include "msfa/controllers.h"

namespace { constexpr int kBlock = N; }
#undef N

const char* const MMB_TYPE_ID     = "tp_mmb_dx7";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = kBlock;

enum { IN_VOCT, IN_GATE, IN_VEL };
MmbPort MMB_INPUTS[] = {
    { "voct", MMB_CV, 0, {} }, { "gate", MMB_GATE, 0, {} }, { "vel", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_BANK, C_PROGRAM, C_COARSE, C_FINE, C_LEVEL, C_EDIT };
MmbControl MMB_CONTROLS[] = {
    { "bank", 0.f }, { "program", 0.f }, { "coarse", 0.f }, { "fine", 0.f }, { "level", 0.8f },
    { "edit", 0.f },
};
const int MMB_NUM_CONTROLS = 6;

namespace {

constexpr int kBanks     = 9;      // 8 factory-ROMs + USER
constexpr int kBankBytes = 4096;
constexpr int kSlotEdit  = 9;
constexpr int kPatchBytes = 156;

// E.PIANO 1 (128 bytes packed, uit msfa) — default zolang er geen bank is.
constexpr char kEpiano[128] = {
    95, 29, 20, 50, 99, 95, 0, 0, 41, 0, 19, 0, 115, 24, 79, 2, 0,
    95, 20, 20, 50, 99, 95, 0, 0, 0, 0, 0, 0, 3, 0, 99, 2, 0,
    95, 29, 20, 50, 99, 95, 0, 0, 0, 0, 0, 0, 59, 24, 89, 2, 0,
    95, 20, 20, 50, 99, 95, 0, 0, 0, 0, 0, 0, 59, 8, 99, 2, 0,
    95, 50, 35, 78, 99, 75, 0, 0, 0, 0, 0, 0, 59, 28, 58, 28, 0,
    96, 25, 25, 67, 99, 75, 0, 0, 0, 0, 0, 0, 83, 8, 99, 2, 0,
    94, 67, 95, 60, 50, 50, 50, 50, 4, 6, 34, 33, 0, 0, 56, 24,
    69, 46, 80, 73, 65, 78, 79, 32, 49, 32,
};

char        g_banks[kBanks][kBankBytes];
bool        g_bankLoaded[kBanks];
char        g_edit[kPatchBytes];
bool        g_editLoaded = false;

Dx7Note     g_note;
Lfo         g_lfo;
Controllers g_ctrl;
char        g_patch[kPatchBytes];
bool        g_gate = false;
bool        g_tablesDone = false;
int32_t     g_scratch[kBlock];

int   g_bank = 0, g_program = 0;
float g_coarse = 0.f, g_fine = 0.f, g_level = 0.8f;
bool  g_editOn = false;

const char* packedVoice() {
    if (g_bankLoaded[g_bank]) return g_banks[g_bank] + (g_program & 31) * 128;
    return kEpiano;
}

void applyPatch() {
    if (g_editOn && g_editLoaded) std::memcpy(g_patch, g_edit, sizeof(g_patch));
    else                          UnpackPatch(packedVoice(), g_patch);
    g_lfo.reset(g_patch + 137);
}

/** Toonhoogte: gehele midinote + fractie via de pitch-controller, zoals
 *  Dx7Module::applyPitch (msfa's bend is 3 halve tonen fullscale). */
int setPitch(float semis) {
    const float base = std::floor(semis);
    float frac = semis - base;
    int m = static_cast<int>(base);
    if (m < 0)   { m = 0;   frac = 0.f; }
    if (m > 127) { m = 127; frac = 0.f; }
    g_ctrl.values_[kControllerPitch] = 0x2000 + static_cast<int>(frac * (0x2000 / 3.0f));
    return m;
}

}  // namespace

// ── blobs: banken (slot 0..8) en edit-patch (slot 9) ──────────────────
MMB_EXPORT(mmb_blob_ptr) int16_t* mmb_blob_ptr(int slot, int bytes) {
    if (slot >= 0 && slot < kBanks && bytes == kBankBytes) return reinterpret_cast<int16_t*>(g_banks[slot]);
    if (slot == kSlotEdit && bytes == kPatchBytes)         return reinterpret_cast<int16_t*>(g_edit);
    return nullptr;
}
MMB_EXPORT(mmb_blob_commit) void mmb_blob_commit(int slot, int, float, int) {
    if (slot >= 0 && slot < kBanks) g_bankLoaded[slot] = true;
    else if (slot == kSlotEdit)     g_editLoaded = true;
    applyPatch();
}

void mmb_setup() {
    if (!g_tablesDone) {
        g_tablesDone = true;
        Freqlut::init(MMB_NATIVE_RATE);
        Exp2::init();
        Tanh::init();
        Sin::init();
        Lfo::init(MMB_NATIVE_RATE);
        PitchEnv::init(MMB_NATIVE_RATE);
    }
    std::memset(g_patch, 0, sizeof(g_patch));
    g_ctrl.values_[kControllerPitch] = 0x2000;
    applyPatch();
}

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_BANK:    g_bank = v < 0 ? 0 : (v >= kBanks ? kBanks - 1 : static_cast<int>(v)); break;
        case C_PROGRAM: g_program = static_cast<int>(v) & 31; break;
        case C_COARSE:  g_coarse = v; break;
        case C_FINE:    g_fine = v; break;
        case C_LEVEL:   g_level = v < 0 ? 0 : (v > 1 ? 1 : v); break;
        case C_EDIT:    g_editOn = v >= 0.5f; break;
    }
    // Patch/bank-wissel geldt vanaf de volgende noot (zoals de firmware);
    // de lopende noot speelt door op zijn eigen kopie in Dx7Note.
    if (idx != C_COARSE && idx != C_FINE && idx != C_LEVEL) applyPatch();
}

void mmb_process(int frames) {
    const float voct = mmb_in0(IN_VOCT);
    const bool high = mmb_gate_in(IN_GATE);
    if (high && !g_gate) {
        const float velIn = mmb_connected(IN_VEL) ? mmb_in0(IN_VEL) : 0.8f;
        int vel = static_cast<int>(velIn * 127.0f);
        if (vel < 1) vel = 1; if (vel > 127) vel = 127;
        applyPatch();
        const int m = setPitch(60.0f + 12.0f * voct + g_coarse + g_fine * 0.01f);
        g_note.init(g_patch, m, vel);
        g_lfo.keydown();
    } else if (!high && g_gate) {
        g_note.keyup();
    }
    g_gate = high;

    // msfa rekent per blok van 64; de host levert precies MMB_BLOCK frames.
    float* dst = MMB_OUTPUTS[0].buf;
    std::memset(g_scratch, 0, sizeof(g_scratch));                  // compute() telt op
    g_note.compute(g_scratch, g_lfo.getsample(), g_lfo.getdelay(), &g_ctrl);
    const float scale = g_level * (1.0f / 32768.0f);
    const int n = frames < kBlock ? frames : kBlock;
    for (int i = 0; i < n; ++i) {
        // Schaling zoals Dx7Module::update: >>4, clip ±2^24, >>9.
        int32_t val = g_scratch[i] >> 4;
        if (val < -(1 << 24)) val = -(1 << 24);
        if (val >= (1 << 24)) val = (1 << 24) - 1;
        val >>= 9;
        dst[i] = static_cast<float>(val) * scale;
    }
    for (int i = n; i < frames; ++i) dst[i] = 0.f;
}
