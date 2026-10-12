// tp_mmb_beads — Mutable Instruments Beads (spiegel van BeadsModule.h). De
// DSP en de omrekening van knoppen en CV zitten in mi-beads/beads_host.h,
// gedeeld met de firmware. Native 44,1 kHz, blok 32; BeadsHost zet intern om
// naar de rate van het medium (24/32/48 kHz).
#include "mmb_abi.h"
#include "beads_host.h"

const char* const MMB_TYPE_ID     = "tp_mmb_beads";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_L, IN_R, IN_FREEZE, IN_SEED, IN_TIME, IN_SIZE, IN_SHAPE, IN_PITCH, IN_DENSITY };
MmbPort MMB_INPUTS[] = {
    { "in_l", MMB_AUDIO, 0, {} }, { "in_r", MMB_AUDIO, 0, {} },
    { "freeze", MMB_GATE, 0, {} }, { "seed", MMB_GATE, 0, {} },
    { "time_cv", MMB_CV, 0, {} }, { "size_cv", MMB_CV, 0, {} }, { "shape_cv", MMB_CV, 0, {} },
    { "pitch_cv", MMB_CV, 0, {} }, { "density_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 9;
enum { OUT_L, OUT_R };
MmbPort MMB_OUTPUTS[] = { { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;

enum { C_TIME, C_SIZE, C_SHAPE, C_PITCH, C_DENSITY, C_TIME_AMT, C_SIZE_AMT, C_SHAPE_AMT, C_PITCH_AMT,
       C_FEEDBACK, C_MIX, C_REVERB, C_QUALITY, C_FREEZE_BTN, C_SEED_BTN, C_SEED_LOCK };
MmbControl MMB_CONTROLS[] = {
    { "time", 0.5f }, { "size", 0.5f }, { "shape", 0.5f }, { "pitch", 0.5f }, { "density", 0.5f },
    { "time_amt", 0.f }, { "size_amt", 0.f }, { "shape_amt", 0.f }, { "pitch_amt", 0.f },
    { "feedback", 0.f }, { "mix", 0.5f }, { "reverb", 0.f }, { "quality", 3.f },
    { "freeze_btn", 0.f }, { "seed_btn", 0.f }, { "seed_lock", 1.f },
};
const int MMB_NUM_CONTROLS = 16;

namespace {
uint8_t  g_delay[mmb_beads::kDelayBytes];
uint16_t g_reverb[mmb_beads::kReverbWords];
mmb_beads::BeadsHost g_host;   // BSS: genuld, zoals de MI-code verwacht
mmb_beads::Controls g_c;
}

void mmb_setup() { g_host.Init(g_delay, g_reverb); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_TIME: g_c.time = v; break;
        case C_SIZE: g_c.size = v; break;
        case C_SHAPE: g_c.shape = v; break;
        case C_PITCH: g_c.pitch = v; break;
        case C_DENSITY: g_c.density = v; break;
        case C_TIME_AMT: g_c.time_amt = v; break;
        case C_SIZE_AMT: g_c.size_amt = v; break;
        case C_SHAPE_AMT: g_c.shape_amt = v; break;
        case C_PITCH_AMT: g_c.pitch_amt = v; break;
        case C_FEEDBACK: g_c.feedback = v; break;
        case C_MIX: g_c.mix = v; break;
        case C_REVERB: g_c.reverb = v; break;
        case C_QUALITY: g_c.quality = static_cast<int>(v + 0.5f); break;
        case C_FREEZE_BTN: g_c.freeze = v >= 0.5f; break;
        case C_SEED_BTN: g_c.seed = v >= 0.5f; break;
        case C_SEED_LOCK: g_c.seed_lock = v >= 0.5f; break;
    }
}

void mmb_process(int frames) {
    mmb_beads::Cv cv;
    cv.has_time = mmb_connected(IN_TIME);       cv.time = mmb_in0(IN_TIME);
    cv.has_size = mmb_connected(IN_SIZE);       cv.size = mmb_in0(IN_SIZE);
    cv.has_shape = mmb_connected(IN_SHAPE);     cv.shape = mmb_in0(IN_SHAPE);
    cv.has_pitch = mmb_connected(IN_PITCH);     cv.pitch = mmb_in0(IN_PITCH);
    cv.has_density = mmb_connected(IN_DENSITY); cv.density = mmb_in0(IN_DENSITY);
    cv.has_seed = mmb_connected(IN_SEED);       cv.seed = mmb_connected(IN_SEED) && mmb_gate_in(IN_SEED);
    cv.freeze = mmb_connected(IN_FREEZE) && mmb_gate_in(IN_FREEZE);
    g_host.Process(g_c, cv,
                   mmb_connected(IN_L) ? MMB_INPUTS[IN_L].buf : nullptr,
                   mmb_connected(IN_R) ? MMB_INPUTS[IN_R].buf : nullptr,
                   MMB_OUTPUTS[OUT_L].buf, MMB_OUTPUTS[OUT_R].buf, frames);
}
