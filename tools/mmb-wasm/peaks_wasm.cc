// tp_mmb_peaks — Mutable Instruments Peaks drums (spiegel van PeaksModule.h).
// Native 48 kHz, blokken van 32. Eén drum per instantie (control `drum`).
#include "mmb_abi.h"
#include "peaks/drums/bass_drum.h"
#include "peaks/drums/snare_drum.h"
#include "peaks/drums/high_hat.h"
#include "peaks/drums/fm_drum.h"
#include "peaks/gate_processor.h"

const char* const MMB_TYPE_ID     = "tp_mmb_peaks";
const float       MMB_NATIVE_RATE = 48000.0f;
const int         MMB_BLOCK       = 32;

enum { IN_GATE, IN_VOCT, IN_ACCENT };
MmbPort MMB_INPUTS[] = { { "gate", MMB_GATE, 0, {} }, { "voct", MMB_CV, 0, {} }, { "accent_cv", MMB_CV, 0, {} } };
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

enum { C_DRUM, C_TONE, C_DECAY, C_SNAP, C_COARSE, C_LEVEL };
MmbControl MMB_CONTROLS[] = {
    { "drum", 0.f }, { "tone", 0.5f }, { "decay", 0.5f }, { "snap", 0.5f }, { "coarse", 0.f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 6;

namespace {
peaks::BassDrum  g_bd;
peaks::SnareDrum g_sd;
peaks::HighHat   g_hh;
peaks::FmDrum    g_fm;
int   g_drum = 0;
float g_tone = 0.5f, g_decay = 0.5f, g_snap = 0.5f, g_voct = 0.f, g_coarse = 0.f, g_level = 0.8f;
bool  g_gatePrev = false, g_pending = false, g_gateHigh = false;
int   g_held = 0;

uint16_t u16(float v) { return static_cast<uint16_t>(mmb_clamp01(v) * 65535.0f); }

void reconfigure() {
    const int16_t pitch = static_cast<int16_t>((g_voct * 12.0f + g_coarse) * 128.0f);
    uint16_t p[4];
    switch (g_drum) {
        case 0:
            p[0] = static_cast<uint16_t>(32768 + pitch); p[1] = u16(0.4f + 0.6f * g_snap); p[2] = u16(g_tone); p[3] = u16(g_decay);
            g_bd.Configure(p, peaks::CONTROL_MODE_FULL); break;
        case 1:
            p[0] = static_cast<uint16_t>(32768 + pitch); p[1] = u16(g_tone); p[2] = u16(g_snap); p[3] = u16(g_decay);
            g_sd.Configure(p, peaks::CONTROL_MODE_FULL); break;
        case 2: break;   // HighHat: vaste 808-hat
        default:
            p[0] = static_cast<uint16_t>(32768 + pitch); p[1] = u16(g_snap); p[2] = u16(g_decay); p[3] = u16(g_tone);
            g_fm.Configure(p, peaks::CONTROL_MODE_FULL); break;
    }
}
}

void mmb_setup() {
    g_bd.Init(); g_sd.Init(); g_hh.Init(); g_fm.Init();
    reconfigure();
}

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_DRUM:   { int d = static_cast<int>(v); if (d < 0) d = 0; if (d > 3) d = 3; g_drum = d; break; }
        case C_TONE:   g_tone = mmb_clamp01(v); break;
        case C_DECAY:  g_decay = mmb_clamp01(v); break;
        case C_SNAP:   g_snap = mmb_clamp01(v); break;
        case C_COARSE: g_coarse = v; break;
        case C_LEVEL:  g_level = mmb_clamp01(v); break;
    }
    reconfigure();
}

void mmb_process(int frames) {
    if (mmb_connected(IN_VOCT)) { const float v = mmb_in0(IN_VOCT); if (v != g_voct) { g_voct = v; reconfigure(); } }
    for (int k = 0; k < frames; ++k) {
        const bool high = MMB_INPUTS[IN_GATE].buf[k] >= 0.5f;
        if (high && !g_gatePrev) g_pending = true;
        g_gatePrev = high;

        peaks::GateFlags gf = peaks::GATE_FLAG_LOW;
        if (g_pending) {
            g_pending = false;
            gf = static_cast<peaks::GateFlags>(peaks::GATE_FLAG_HIGH | peaks::GATE_FLAG_RISING);
            g_gateHigh = true; g_held = 0;
        } else if (g_gateHigh) {
            gf = peaks::GATE_FLAG_HIGH;
            if (++g_held > 96) { g_gateHigh = false; g_held = 0; }   // ~2 ms puls
        }
        int16_t s = 0;
        switch (g_drum) {
            case 0: g_bd.Process(&gf, &s, 1); break;
            case 1: g_sd.Process(&gf, &s, 1); break;
            case 2: g_hh.Process(&gf, &s, 1); break;
            default: g_fm.Process(&gf, &s, 1); break;
        }
        float y = static_cast<float>(s) * (1.0f / 32768.0f) * g_level;
        if (y > 1.f) y = 1.f; else if (y < -1.f) y = -1.f;
        MMB_OUTPUTS[0].buf[k] = y;
    }
}
