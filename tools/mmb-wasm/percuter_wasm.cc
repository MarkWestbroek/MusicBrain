// tp_mmb_percuter — acht digitale drumkanalen naar de Dynacord Percuter
// (spiegel van PercuterModule.h; de DSP is mmb_dsp::Percuter, dezelfde header
// als de firmware). Kanaal k speelt slot k van de samplebank; de editor zet
// de bank van de sampler ook in dit type (WasmModule.bankAliases).
// Native 44,1 kHz, blok 32.
#include "mmb_abi.h"
#include <cstdlib>
#include "mmb_dsp/percuter.h"

const char* const MMB_TYPE_ID     = "tp_mmb_percuter";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

using Kernel = mmb_dsp::Percuter;
constexpr int kCh = Kernel::kChannels;

// In de volgorde van de kernel: vel_1..8, pitch, trig_1..8.
MmbPort MMB_INPUTS[] = {
    { "vel_1", MMB_CV, 0, {} }, { "vel_2", MMB_CV, 0, {} }, { "vel_3", MMB_CV, 0, {} }, { "vel_4", MMB_CV, 0, {} },
    { "vel_5", MMB_CV, 0, {} }, { "vel_6", MMB_CV, 0, {} }, { "vel_7", MMB_CV, 0, {} }, { "vel_8", MMB_CV, 0, {} },
    { "pitch", MMB_CV, 0, {} },
    { "trig_1", MMB_GATE, 0, {} }, { "trig_2", MMB_GATE, 0, {} }, { "trig_3", MMB_GATE, 0, {} }, { "trig_4", MMB_GATE, 0, {} },
    { "trig_5", MMB_GATE, 0, {} }, { "trig_6", MMB_GATE, 0, {} }, { "trig_7", MMB_GATE, 0, {} }, { "trig_8", MMB_GATE, 0, {} },
};
const int MMB_NUM_INPUTS = Kernel::kCvIns;
MmbPort MMB_OUTPUTS[] = {
    { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} },
    { "out_1", MMB_AUDIO, 0, {} }, { "out_2", MMB_AUDIO, 0, {} }, { "out_3", MMB_AUDIO, 0, {} }, { "out_4", MMB_AUDIO, 0, {} },
    { "out_5", MMB_AUDIO, 0, {} }, { "out_6", MMB_AUDIO, 0, {} }, { "out_7", MMB_AUDIO, 0, {} }, { "out_8", MMB_AUDIO, 0, {} },
};
const int MMB_NUM_OUTPUTS = 2 + kCh;

// Bank eerst, dan de kernel-controls in hun volgorde (index − 1).
MmbControl MMB_CONTROLS[] = {
    { "bank", 0.f }, { "tune", 0.f }, { "filter", 1.f }, { "level", 0.8f },
    { "level_1", 0.8f }, { "level_2", 0.8f }, { "level_3", 0.8f }, { "level_4", 0.8f },
    { "level_5", 0.8f }, { "level_6", 0.8f }, { "level_7", 0.8f }, { "level_8", 0.8f },
    { "pan_1", 0.f }, { "pan_2", 0.f }, { "pan_3", 0.f }, { "pan_4", 0.f },
    { "pan_5", 0.f }, { "pan_6", 0.f }, { "pan_7", 0.f }, { "pan_8", 0.f },
    { "decay_1", 1.f }, { "decay_2", 1.f }, { "decay_3", 1.f }, { "decay_4", 1.f },
    { "decay_5", 1.f }, { "decay_6", 1.f }, { "decay_7", 1.f }, { "decay_8", 1.f },
    { "tune_1", 0.f }, { "tune_2", 0.f }, { "tune_3", 0.f }, { "tune_4", 0.f },
    { "tune_5", 0.f }, { "tune_6", 0.f }, { "tune_7", 0.f }, { "tune_8", 0.f },
};
const int MMB_NUM_CONTROLS = 1 + Kernel::kControls;

namespace {
constexpr int kSlots = 64;
int16_t*            g_blob[kSlots];
int                 g_cap[kSlots];
mmb_dsp::SampleSlot g_slots[kSlots];
Kernel              g_kernel;
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
    g_slots[slot].data     = g_blob[slot];
    g_slots[slot].frames   = frames;
    g_slots[slot].channels = channels < 1 ? 1 : channels;
    g_slots[slot].rate     = rate > 0.f ? rate : MMB_NATIVE_RATE;
    g_kernel.bind(g_slots, kSlots);
}

void mmb_setup() { g_kernel.Init(MMB_NATIVE_RATE); g_kernel.bind(g_slots, kSlots); }
void mmb_on_control(int index, float value) { if (index > 0) g_kernel.setControl(index - 1, value); }
void mmb_process(int frames) {
    for (int k = 0; k < Kernel::kCvIns; ++k) g_kernel.setCv(k, mmb_connected(k) ? mmb_in0(k) : 0.0f);
    float* outputs[MMB_NUM_OUTPUTS];
    for (int k = 0; k < MMB_NUM_OUTPUTS; ++k) outputs[k] = MMB_OUTPUTS[k].buf;
    g_kernel.Process(nullptr, outputs, frames);
}
