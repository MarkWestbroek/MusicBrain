// tp_mmb_ladder — Moog-ladder. Native 44,1 kHz, blok 32.
//
// Sinds fw 0.5.103 dezelfde kern als de firmware: mmb_dsp/ladder.h (het
// algoritme van AudioFilterLadder uit de Teensy Audio Library, Richard van
// Hoesel, MIT; zie de kop daar), met ons eigen 4×-filter en een zachte
// uitgangsbegrenzer. Daarvoor was dit een kopie van de bibliotheek, met haar
// FIR van 36 taps en een 16-bit-uitgang die boven ±1 omklapte.

#include "kernel_host.h"
#include "mmb_dsp/ladder.h"

const char* const MMB_TYPE_ID     = "tp_mmb_ladder";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

MmbPort MMB_INPUTS[] = {
    { "in", MMB_AUDIO, 0, {} }, { "cv", MMB_CV, 0, {} },
    { "q_cv", MMB_CV, 0, {} }, { "drive_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;
MmbControl MMB_CONTROLS[] = {
    { "cutoff", 2000.0f }, { "q", 0.7f }, { "drive", 1.0f },
    { "cv_amt", 2.0f }, { "q_cv_amt", 0.5f }, { "drive_cv_amt", 0.5f },
};
const int MMB_NUM_CONTROLS = 6;

// Kernel-volgorde van de CV's: Cv, QCv, DriveCv.
static const int kAudioIn[] = {0}, kCvIn[] = {1, 2, 3}, kAudioOut[] = {0}, kCvOut[] = {0};
MMB_KERNEL_HOST(mmb_dsp::Ladder, kAudioIn, 1, kCvIn, 3, kAudioOut, 1, kCvOut, 0)
