// tp_mmb_stk_sound — physical-modelling stem op de Synthesis ToolKit (spiegel
// van StkSoundModule.h; de DSP is de gevendorde STK in firmware/lib/stk,
// dezelfde bron als de firmware). Native 44,1 kHz, blok 32.
//
// De STK-modellen zijn sample-gebaseerd (`tick()`), dus er zit hier geen
// resampler tussen: één tick per uitgangssample, precies als op de Teensy.
#include <cmath>

#include "mmb_abi.h"

#include "stk/Stk.h"
#include "stk/Instrmnt.h"
#include "stk/BandedWG.h"
#include "stk/BlowHole.h"
#include "stk/Bowed.h"
#include "stk/Brass.h"
#include "stk/Clarinet.h"
#include "stk/Flute.h"
#include "stk/Mandolin.h"
#include "stk/Plucked.h"
#include "stk/Saxofony.h"

const char* const MMB_TYPE_ID     = "tp_mmb_stk_sound";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_VOCT, IN_GATE, IN_STRENGTH, IN_TIMBRE, IN_MOD };
MmbPort MMB_INPUTS[] = {
    { "voct", MMB_CV, 0, {} }, { "gate", MMB_GATE, 0, {} },
    { "strength", MMB_CV, 0, {} }, { "timbre", MMB_CV, 0, {} },
    { "modulation", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 5;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

// Defaults gelijk aan de moduledefinitie in seedModules.ts.
enum { C_SOUND, C_LEVEL, C_TIMBRE, C_MODULATION, C_STRENGTH };
MmbControl MMB_CONTROLS[] = {
    { "sound", 0.0f }, { "level", 0.8f }, { "timbre", 0.5f },
    { "modulation", 0.5f }, { "strength", 0.8f },
};
const int MMB_NUM_CONTROLS = 5;

namespace {

/** Volgorde gelijk aan de switch op het paneel. */
enum class Sound { Plucked, Clarinet, Bowed, Flute, Brass, Saxophony, BlowHole, BandedWG, Mandolin, kCount };

// Rauwe pointer, geen unique_ptr: deze binaries linken met `-nostartfiles`
// en `--no-entry`, dus de machinerie achter globals met een constructor of
// destructor (__cxa_atexit, de start-sectie) is er niet op te vertrouwen — een
// globale unique_ptr bleek na `mmb_init()` weer leeg. Alle andere wrappers
// gebruiken om dezelfde reden platte globals. Eén instrument per module, dus
// handmatig opruimen is één regel.
stk::Instrmnt* g_instr = nullptr;
Sound g_sound = Sound::Plucked;
float g_note = 60.0f;      ///< Huidige toonhoogte in MIDI-noten.
bool  g_gate = false;
float g_level = 0.8f;
// Knopstanden; de CV's tellen erbij op en worden samen geclampt (firmware).
float g_knobTimbre = 0.5f, g_knobMod = 0.5f, g_knobStrength = 0.8f;
float g_timbre = 0.5f, g_mod = 0.5f, g_strength = 0.8f;

float sat(float v) { return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }
float midiToHz(float n) { return 440.0f * std::pow(2.0f, (n - 69.0f) / 12.0f); }

/** CC-nummers zoals StkSoundModule ze gebruikt: timbre, modulatie, sterkte. */
void applyControls() {
    if (!g_instr) return;
    g_instr->controlChange(2,  g_timbre   * 127.0f);
    g_instr->controlChange(11, g_mod      * 127.0f);
    g_instr->controlChange(1,  g_strength * 127.0f);
}

void selectSound(Sound s) {
    g_sound = s;
    // Constructor-argument is de láágste speelbare frequentie (delay-lengte),
    // niet de speeltoonhoogte. 27,5 Hz = A0, zoals de firmware.
    constexpr stk::StkFloat kLowestHz = 27.5f;
    const float freq = midiToHz(g_note);
    stk::Instrmnt* fresh = nullptr;
    switch (s) {
        case Sound::Plucked:   fresh = new stk::Plucked(kLowestHz);  break;
        case Sound::Clarinet:  fresh = new stk::Clarinet(kLowestHz); break;
        case Sound::Bowed:     fresh = new stk::Bowed(kLowestHz);    break;
        case Sound::Flute:     fresh = new stk::Flute(kLowestHz);    break;
        case Sound::Brass:     fresh = new stk::Brass(kLowestHz);    break;
        case Sound::Saxophony: fresh = new stk::Saxofony(kLowestHz); break;
        case Sound::BlowHole:  fresh = new stk::BlowHole(kLowestHz); break;
        case Sound::BandedWG:  fresh = new stk::BandedWG();          break;
        case Sound::Mandolin:  fresh = new stk::Mandolin(kLowestHz); break;
        default: break;
    }
    if (!fresh) return;
    fresh->setFrequency(freq);
    if (g_gate) fresh->noteOn(freq, g_strength);
    stk::Instrmnt* old = g_instr;
    g_instr = fresh;
    delete old;
    applyControls();
}

}  // namespace

void mmb_setup() {
    stk::Stk::setSampleRate(MMB_NATIVE_RATE);
    selectSound(Sound::Plucked);
}

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_SOUND: {
            const int i = static_cast<int>(v + 0.5f);
            if (i >= 0 && i < static_cast<int>(Sound::kCount)) selectSound(static_cast<Sound>(i));
            break;
        }
        case C_LEVEL:      g_level = sat(v); break;
        case C_TIMBRE:     g_knobTimbre = sat(v); break;
        case C_MODULATION: g_knobMod = sat(v); break;
        case C_STRENGTH:   g_knobStrength = sat(v); break;
    }
}

void mmb_process(int frames) {
    // CV telt op bij de knop en wordt samen geclampt — zoals writeCvPort.
    g_timbre   = sat(g_knobTimbre   + (mmb_connected(IN_TIMBRE)   ? mmb_in0(IN_TIMBRE)   : 0.0f));
    g_mod      = sat(g_knobMod      + (mmb_connected(IN_MOD)      ? mmb_in0(IN_MOD)      : 0.0f));
    g_strength = sat(g_knobStrength + (mmb_connected(IN_STRENGTH) ? mmb_in0(IN_STRENGTH) : 0.0f));

    // V/Oct: MIDI 60 = 0 V. De firmware volgt de toonhoogte live, ook tijdens
    // een klinkende noot (`setPitch` → `setFrequency`).
    if (mmb_connected(IN_VOCT)) {
        g_note = 60.0f + 12.0f * mmb_in0(IN_VOCT);
        if (g_instr) g_instr->setFrequency(midiToHz(g_note));
    }
    // Pas hierná de controls: `setFrequency` herberekent bij sommige modellen
    // juist de parameter die CC#2 zet (Brass stelt zijn lipspanning af op de
    // nieuwe toon). Andersom wint de toonhoogte elk blok en doet de
    // Timbre-knop niets — gemeten: Brass reageerde niet op timbre.
    applyControls();

    // Gate: flankdetectie in de wrapper, zoals elke mmb-wasm-module.
    const bool high = mmb_gate_in(IN_GATE);
    if (high != g_gate) {
        g_gate = high;
        if (g_instr) {
            if (high) g_instr->noteOn(midiToHz(g_note), g_strength);
            else      g_instr->noteOff(g_strength);
        }
    }

    // Bij een mislukte StkFrames-allocatie leest STK's hot-path ongeguard
    // door: dan zwijgen we, net als de firmware.
    const bool ok = g_instr && !stk::Stk::memoryFailure();
    for (int k = 0; k < frames; ++k) {
        float y = ok ? static_cast<float>(g_instr->tick()) : 0.0f;
        if (y > 1.0f) y = 1.0f; else if (y < -1.0f) y = -1.0f;
        MMB_OUTPUTS[0].buf[k] = y * g_level;
    }
}
