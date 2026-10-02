// tp_mmb_rhythm — ritmebox met de presets van de CR-78 (spiegel van
// RhythmBoxModule.h; de DSP is mmb_dsp::RhythmBox, dezelfde header als de
// firmware). 44,1 kHz, blok 32.
#include "kernel_host.h"
#include "mmb_dsp/rhythm_box.h"

const char* const MMB_TYPE_ID     = "tp_mmb_rhythm";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[] = {
    { "start", MMB_GATE, 0, {} }, { "clock", MMB_GATE, 0, {} }, { "reset", MMB_GATE, 0, {} },
};
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = {
    { "out_l", MMB_AUDIO, 0, {} }, { "out_r", MMB_AUDIO, 0, {} },
    { "step", MMB_GATE, 0, {} }, { "bar", MMB_GATE, 0, {} }, { "acc", MMB_GATE, 0, {} },
};
const int MMB_NUM_OUTPUTS = 5;
MmbControl MMB_CONTROLS[] = {
    { "rhythm", 0.0f }, { "variation", 2.0f }, { "tempo", 120.0f }, { "run", 1.0f }, { "extclock", 0.0f },
    { "accent", 0.6f }, { "bass", 0.8f }, { "snare", 0.8f }, { "metal", 0.7f }, { "perc", 0.7f }, { "level", 0.8f },
};
const int MMB_NUM_CONTROLS = 11;

static const int kAudioIn[] = {0}, kCvIn[] = {0, 1, 2}, kAudioOut[] = {0, 1}, kCvOut[] = {2, 3, 4};
MMB_KERNEL_HOST(mmb_dsp::RhythmBox, kAudioIn, 0, kCvIn, 3, kAudioOut, 2, kCvOut, 3)
