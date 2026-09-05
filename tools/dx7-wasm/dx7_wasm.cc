// MusicBrain — DX7 (msfa) → WebAssembly.
//
// Dunne C-API rond de gevendorde msfa-kern (firmware/lib/msfa, Apache-2.0),
// zodat de editor-simulator exact dezelfde DSP draait als Dx7Module.h op
// de Teensy. Geen heap, geen libc-I/O: alles is statisch, de host (JS)
// schrijft banken en leest audio via geëxporteerde buffers.
//
// Stemmen: kDx7Voices onafhankelijke Dx7Note+Lfo-paren met een eigen
// allocator (round-robin met stealing van de oudste). Op de Teensy is één
// Dx7Module één stem (poly via polyExpand); in de browser is de simulator
// monofoon, dus doet dit blok de polyfonie zelf.
//
// Rendert native op 44 100 Hz (zoals de firmware); de worklet resamplet.
//
// Bouwen: tools/dx7-wasm/build.sh  (wasi-sdk, zie daar).

#include <cstdint>
#include <cstring>

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

// Native (referentie-harnas, ref.cc) heeft geen export_name-attribuut.
#ifdef __wasm__
#define DX7_EXPORT(name) extern "C" __attribute__((export_name(#name)))
#else
#define DX7_EXPORT(name) extern "C"
#endif

namespace {

constexpr int kVoices     = 16;
constexpr int kBanks      = 9;      // 8 factory-ROMs + USER
constexpr int kBankBytes  = 4096;
constexpr int kMaxFrames  = 1024;   // per dx7_render-aanroep (veelvoud van 64)
constexpr double kRate    = 44100.0;

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

struct Voice {
    Dx7Note     note;
    Lfo         lfo;
    Controllers ctrl;
    char        patch[156];
    int         midinote = -1;   // -1 = vrij
    bool        gate     = false;
    uint32_t    age      = 0;
    int         quiet    = 0;    // opeenvolgende stille blokken na keyup
};

Voice    g_voices[kVoices];
char     g_banks[kBanks][kBankBytes];
bool     g_bankLoaded[kBanks];
int      g_bank    = 0;
int      g_program = 0;
int      g_coarse  = 0;     // semitonen
float    g_fine    = 0.0f;  // cents
float    g_level   = 0.8f;
uint32_t g_age     = 0;
bool     g_tablesDone = false;

float    g_out[kMaxFrames];
int32_t  g_scratch[kBlock];

const char* packedVoice() {
    if (g_bankLoaded[g_bank]) return g_banks[g_bank] + (g_program & 31) * 128;
    return kEpiano;
}

void applyPatch(Voice& v) {
    UnpackPatch(packedVoice(), v.patch);
    v.lfo.reset(v.patch + 137);
}

// Pitch: geheel midinote + fractie via de pitch-controller, zoals
// Dx7Module::applyPitch (msfa's bend is 3 semitonen fullscale).
void setPitch(Voice& v, float semis) {
    float base = semis >= 0 ? static_cast<float>(static_cast<int>(semis)) : static_cast<float>(static_cast<int>(semis) - 1);
    float frac = semis - base;
    int m = static_cast<int>(base);
    if (m < 0)   { m = 0;   frac = 0.0f; }
    if (m > 127) { m = 127; frac = 0.0f; }
    v.midinote = m;
    v.ctrl.values_[kControllerPitch] = 0x2000 + static_cast<int>(frac * (0x2000 / 3.0f));
}

}  // namespace

DX7_EXPORT(dx7_init) void dx7_init() {
    if (g_tablesDone) return;
    g_tablesDone = true;
    Freqlut::init(kRate);
    Exp2::init();
    Tanh::init();
    Sin::init();
    Lfo::init(kRate);
    PitchEnv::init(kRate);
    for (int i = 0; i < kVoices; ++i) {
        std::memset(g_voices[i].patch, 0, sizeof(g_voices[i].patch));
        g_voices[i].ctrl.values_[kControllerPitch] = 0x2000;
        applyPatch(g_voices[i]);
    }
}

/** Adres van bank b (0..8), 4096 bytes; de host schrijft er packed voices in. */
DX7_EXPORT(dx7_bank_ptr) char* dx7_bank_ptr(int b) {
    if (b < 0 || b >= kBanks) return nullptr;
    return g_banks[b];
}
DX7_EXPORT(dx7_bank_loaded) void dx7_bank_loaded(int b, int loaded) {
    if (b < 0 || b >= kBanks) return;
    g_bankLoaded[b] = loaded != 0;
}

DX7_EXPORT(dx7_set_bank)    void dx7_set_bank(int b)    { g_bank = b < 0 ? 0 : (b >= kBanks ? kBanks - 1 : b); }
DX7_EXPORT(dx7_set_program) void dx7_set_program(int p) { g_program = p & 31; }
DX7_EXPORT(dx7_set_coarse)  void dx7_set_coarse(int s)  { g_coarse = s; }
DX7_EXPORT(dx7_set_fine)    void dx7_set_fine(float c)  { g_fine = c; }
DX7_EXPORT(dx7_set_level)   void dx7_set_level(float l) { g_level = l < 0 ? 0 : (l > 1 ? 1 : l); }

/** Naam (10 tekens) van de huidige voice naar out (11 bytes). */
DX7_EXPORT(dx7_voice_name) void dx7_voice_name(char* out) {
    std::memcpy(out, packedVoice() + 118, 10);
    out[10] = '\0';
}

DX7_EXPORT(dx7_note_on) void dx7_note_on(int midinote, int velocity) {
    if (velocity < 1) velocity = 1;
    if (velocity > 127) velocity = 127;
    // Zelfde noot nog open → hertrigger die stem.
    Voice* v = nullptr;
    for (int i = 0; i < kVoices; ++i) {
        if (g_voices[i].midinote == midinote && g_voices[i].gate) { v = &g_voices[i]; break; }
    }
    if (!v) for (int i = 0; i < kVoices; ++i) if (g_voices[i].midinote < 0) { v = &g_voices[i]; break; }
    if (!v) {
        // Steel: eerst een losgelaten stem, anders de oudste.
        uint32_t best = 0xffffffffu;
        for (int i = 0; i < kVoices; ++i) {
            uint32_t a = g_voices[i].age + (g_voices[i].gate ? 0x40000000u : 0u);
            if (a < best) { best = a; v = &g_voices[i]; }
        }
    }
    applyPatch(*v);                       // patch/bank kan intussen gewisseld zijn
    setPitch(*v, static_cast<float>(midinote) + g_coarse + g_fine * 0.01f);
    v->note.init(v->patch, v->midinote, velocity);
    v->lfo.keydown();
    v->gate  = true;
    v->age   = ++g_age;
    v->quiet = 0;
    v->midinote = midinote;               // bewaar de *gespeelde* noot voor note-off
    // setPitch zette midinote op de getransponeerde waarde; init() heeft die
    // al gelezen, dus hier terug naar de MIDI-noot als sleutel.
}

DX7_EXPORT(dx7_note_off) void dx7_note_off(int midinote) {
    for (int i = 0; i < kVoices; ++i) {
        Voice& v = g_voices[i];
        if (v.midinote == midinote && v.gate) { v.note.keyup(); v.gate = false; }
    }
}

DX7_EXPORT(dx7_all_off) void dx7_all_off() {
    for (int i = 0; i < kVoices; ++i) {
        if (g_voices[i].gate) { g_voices[i].note.keyup(); g_voices[i].gate = false; }
    }
}

DX7_EXPORT(dx7_active_voices) int dx7_active_voices() {
    int n = 0;
    for (int i = 0; i < kVoices; ++i) if (g_voices[i].midinote >= 0) ++n;
    return n;
}

DX7_EXPORT(dx7_out_ptr) float* dx7_out_ptr() { return g_out; }

/** Render `frames` (veelvoud van 64, ≤ kMaxFrames) mono float-samples op
 *  44,1 kHz in g_out. Schaling zoals Dx7Module::update: >>4, clip ±2^24,
 *  >>9, /32768, × level. */
DX7_EXPORT(dx7_render) int dx7_render(int frames) {
    if (frames > kMaxFrames) frames = kMaxFrames;
    frames -= frames % kBlock;
    std::memset(g_out, 0, sizeof(float) * frames);
    const float scale = g_level * (1.0f / 32768.0f);

    for (int vi = 0; vi < kVoices; ++vi) {
        Voice& v = g_voices[vi];
        if (v.midinote < 0) continue;
        int32_t peak = 0;
        for (int off = 0; off < frames; off += kBlock) {
            std::memset(g_scratch, 0, sizeof(g_scratch));   // compute() telt op
            const int32_t lfoValue = v.lfo.getsample();
            const int32_t lfoDelay = v.lfo.getdelay();
            v.note.compute(g_scratch, lfoValue, lfoDelay, &v.ctrl);
            float* dst = g_out + off;
            for (int i = 0; i < kBlock; ++i) {
                int32_t val = g_scratch[i] >> 4;
                if (val < -(1 << 24)) val = -(1 << 24);
                if (val >= (1 << 24)) val = (1 << 24) - 1;
                val >>= 9;
                const int32_t a = val < 0 ? -val : val;
                if (a > peak) peak = a;
                dst[i] += static_cast<float>(val) * scale;
            }
        }
        // Stem vrijgeven: losgelaten en ~0,15 s (10 blokken van 64) stil.
        if (!v.gate) {
            v.quiet = peak < 2 ? v.quiet + frames / kBlock : 0;
            if (v.quiet >= 100) v.midinote = -1;
        }
    }
    return frames;
}
