// tp_mmb_cmi — Fairlight CMI-stem: golfvormsynthese (spiegel van CmiModule.h;
// de DSP is mmb_dsp::Cmi, dezelfde header als de firmware). 44,1 kHz, blok 32.
// De 32 golfvormen komen als blob (slot 0, 4096 samples int16), zoals de
// firmware ze via het `wavetable`-bericht krijgt.
#include "kernel_host.h"
#include "mmb_dsp/cmi.h"

const char* const MMB_TYPE_ID     = "tp_mmb_cmi";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[] = {
    { "voct", MMB_CV, 0, {} }, { "gate", MMB_GATE, 0, {} }, { "vel", MMB_CV, 0, {} }, { "seg_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} }, { "pos", MMB_CV, 0, {} } };
const int MMB_NUM_OUTPUTS = 2;
MmbControl MMB_CONTROLS[] = {
    { "coarse", 0.0f }, { "fine", 0.0f }, { "seg", 40.0f }, { "smooth", 0.3f }, { "loop", 24.0f },
    { "attack", 4.0f }, { "release", 300.0f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 8;

// Kernel-volgorde van de CV's: Voct, Vel, SegCv, Gate.
static const int kAudioIn[] = {0}, kCvIn[] = {0, 2, 3, 1}, kAudioOut[] = {0}, kCvOut[] = {1};
MMB_KERNEL_HOST(mmb_dsp::Cmi, kAudioIn, 0, kCvIn, 4, kAudioOut, 1, kCvOut, 1)

namespace { int16_t g_table[mmb_dsp::Cmi::kTableWithProfiles]; }
MMB_EXPORT(mmb_blob_ptr) int16_t* mmb_blob_ptr(int slot, int bytes) {
    return slot == 0 && bytes <= static_cast<int>(sizeof(g_table)) ? g_table : nullptr;
}
MMB_EXPORT(mmb_blob_commit) void mmb_blob_commit(int slot, int frames, float, int) {
    if (slot != 0 || frames < 2) return;
    g_kernel.setTable(g_table, frames > mmb_dsp::Cmi::kTableWithProfiles ? mmb_dsp::Cmi::kTableWithProfiles : frames);
}
