// tp_mmb_env_follower / tp_mmb_env_follower_mono — envelope follower (spiegel
// van EnvFollowerModule.h; de DSP zelf is mmb_dsp::EnvFollower, dezelfde header
// als de firmware). Native 44,1 kHz, blok 32.
//
// Eén bron, twee binaries: build.sh compileert dit bestand nog een keer met
// -DMMB_EF_CELLS=1 voor de enkelvoudige variant. Bij één cel heten de jacks
// kaal (in/env/gate), net als in de firmware.
//
// Elke cel: audio in → env (cv, 0..1) + gate. De uitgangsbuffers worden per
// blok met één waarde gevuld: de envelope is per definitie traag, en de host
// resamplet toch naar de contextrate.
#include "mmb_abi.h"
#include "mmb_dsp/env_follower.h"

#ifndef MMB_EF_CELLS
#define MMB_EF_CELLS 8
#endif

static constexpr int kCells = MMB_EF_CELLS;

const float MMB_NATIVE_RATE = 44100.0f;
const int   MMB_BLOCK       = 32;

#if MMB_EF_CELLS == 1

const char* const MMB_TYPE_ID = "tp_mmb_env_follower_mono";
MmbPort MMB_INPUTS[]  = { { "in", MMB_AUDIO, 0, {} } };
MmbPort MMB_OUTPUTS[] = { { "env", MMB_CV, 0, {} }, { "gate", MMB_GATE, 0, {} } };

#else

const char* const MMB_TYPE_ID = "tp_mmb_env_follower";
MmbPort MMB_INPUTS[] = {
    { "in_1", MMB_AUDIO, 0, {} }, { "in_2", MMB_AUDIO, 0, {} },
    { "in_3", MMB_AUDIO, 0, {} }, { "in_4", MMB_AUDIO, 0, {} },
    { "in_5", MMB_AUDIO, 0, {} }, { "in_6", MMB_AUDIO, 0, {} },
    { "in_7", MMB_AUDIO, 0, {} }, { "in_8", MMB_AUDIO, 0, {} },
};
// env_N op index N-1, gate_N op kCells + N-1 — zie mmb_process().
MmbPort MMB_OUTPUTS[] = {
    { "env_1", MMB_CV, 0, {} }, { "env_2", MMB_CV, 0, {} },
    { "env_3", MMB_CV, 0, {} }, { "env_4", MMB_CV, 0, {} },
    { "env_5", MMB_CV, 0, {} }, { "env_6", MMB_CV, 0, {} },
    { "env_7", MMB_CV, 0, {} }, { "env_8", MMB_CV, 0, {} },
    { "gate_1", MMB_GATE, 0, {} }, { "gate_2", MMB_GATE, 0, {} },
    { "gate_3", MMB_GATE, 0, {} }, { "gate_4", MMB_GATE, 0, {} },
    { "gate_5", MMB_GATE, 0, {} }, { "gate_6", MMB_GATE, 0, {} },
    { "gate_7", MMB_GATE, 0, {} }, { "gate_8", MMB_GATE, 0, {} },
};

#endif

const int MMB_NUM_INPUTS  = kCells;
const int MMB_NUM_OUTPUTS = kCells * 2;

enum { C_ATTACK, C_RELEASE, C_SENS, C_MODE, C_THRESH };
MmbControl MMB_CONTROLS[] = {
    { "attack", 5.0f }, { "release", 120.0f }, { "sens", 0.0f },
    { "mode", 1.0f }, { "thresh", 0.1f },
};
const int MMB_NUM_CONTROLS = 5;

namespace {
mmb_dsp::EnvFollower g_cell[kCells];
}

void mmb_setup() {
    for (int i = 0; i < kCells; ++i) g_cell[i].Init(MMB_NATIVE_RATE);
}

void mmb_on_control(int idx, float v) {
    // Alle controls zijn module-globaal: één draai geldt voor elke cel.
    for (int i = 0; i < kCells; ++i) {
        switch (idx) {
            case C_ATTACK:  g_cell[i].set_attack_ms(v);  break;
            case C_RELEASE: g_cell[i].set_release_ms(v); break;
            case C_SENS:    g_cell[i].set_sens_db(v);    break;
            case C_MODE:    g_cell[i].set_mode(static_cast<int>(v + 0.5f)); break;
            case C_THRESH:  g_cell[i].set_threshold(v);  break;
            default: return;
        }
    }
}

void mmb_process(int frames) {
    for (int i = 0; i < kCells; ++i) {
        // Een losse cel houdt zijn release aan de gang op stilte; de
        // ingangsbuffer staat dan al op nul, dus die loopt gewoon mee.
        g_cell[i].ProcessBlock(MMB_INPUTS[i].buf, frames);
        mmb_fill_out(i,          g_cell[i].env(), frames);
        mmb_fill_out(kCells + i, g_cell[i].gate() ? 1.0f : 0.0f, frames);
    }
}
