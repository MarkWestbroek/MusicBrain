// tp_mmb_ms20 — Korg35/MS-20 Sallen-Key VCF (spiegel van Ms20Module.h; de DSP
// zelf is mmb_dsp::Korg35, dezelfde header als de firmware). Native 44,1 kHz,
// blok 32, zoals de andere 44,1 kHz-modules; de smoothing blijft op de
// Teensy-cadans via `kPrepareEvery`.
#include "mmb_abi.h"
#include "mmb_dsp/korg35.h"

const char* const MMB_TYPE_ID     = "tp_mmb_ms20";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_AUDIO, IN_CV, IN_QCV, IN_DRIVECV };
MmbPort MMB_INPUTS[] = {
    { "in", MMB_AUDIO, 0, {} }, { "cv", MMB_CV, 0, {} },
    { "q_cv", MMB_CV, 0, {} }, { "drive_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 4;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

// Defaults gelijk aan de moduledefinitie in seedModules.ts.
enum { C_CUTOFF, C_Q, C_DRIVE, C_CV_AMT, C_Q_CV_AMT, C_DRIVE_CV_AMT, C_TYPE };
MmbControl MMB_CONTROLS[] = {
    { "cutoff", 2000.0f }, { "q", 0.3f }, { "drive", 1.0f }, { "cv_amt", 2.0f },
    { "q_cv_amt", 0.5f }, { "drive_cv_amt", 0.5f }, { "type", 0.0f },
};
const int MMB_NUM_CONTROLS = 7;

namespace {
mmb_dsp::Korg35 g_k35;
float g_octaves    = 2.0f;   ///< Cutoff-CV-diepte in octaven (0 … 7).
float g_qCvAmt     = 0.5f;   ///< Res-CV-diepte, in resonantie-eenheden.
float g_driveCvAmt = 0.5f;   ///< Drive-CV-diepte; ±1 × amt = ×4 … ÷4.

/** De kernel smooth't één stap per `Prepare()`; op de Teensy gebeurt dat één
 *  keer per `AUDIO_BLOCK_SAMPLES` (128). Ons blok is 32, dus bereiden we één
 *  keer per vier blokken voor — anders regelt een sweep vier keer zo snel in
 *  als op de hardware. De doelwaarden zelf zetten we wél elk blok, net als de
 *  CvGraph die op 1 kHz schrijft. */
constexpr int kPrepareEvery = 128 / MMB_BLOCK;
int g_prepIn = 0;
}  // namespace

void mmb_setup() { g_k35.Init(MMB_NATIVE_RATE); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_CUTOFF:        g_k35.set_cutoff(v); break;
        case C_Q:             g_k35.set_resonance(v); break;
        case C_DRIVE:         g_k35.set_drive(v); break;
        // Zoals AudioFilterKorg35::octaveControl(): diepte geclampt, de CV zelf niet.
        case C_CV_AMT:        g_octaves = v < 0.0f ? 0.0f : (v > 7.0f ? 7.0f : v); break;
        case C_Q_CV_AMT:      g_qCvAmt = v; break;
        case C_DRIVE_CV_AMT:  g_driveCvAmt = v; break;
        case C_TYPE:          g_k35.set_mode(static_cast<int>(v)); break;  // 0 LP 12 dB, 1 HP 6 dB
    }
}

void mmb_process(int frames) {
    // CV op control-rate, zoals de CvGraph: één waarde per blok, en alleen
    // als er een kabel op zit — anders staat de knop.
    float cv = mmb_connected(IN_CV) ? mmb_in0(IN_CV) : 0.0f;
    if (cv < -1.0f) cv = -1.0f; else if (cv > 1.0f) cv = 1.0f;
    g_k35.set_cutoff_octaves(g_octaves * cv);
    g_k35.set_resonance_cv(mmb_connected(IN_QCV) ? mmb_in0(IN_QCV) * g_qCvAmt : 0.0f);
    g_k35.set_drive_cv(mmb_connected(IN_DRIVECV) ? mmb_in0(IN_DRIVECV) * g_driveCvAmt : 0.0f);

    if (g_prepIn <= 0) { g_k35.Prepare(); g_prepIn = kPrepareEvery; }
    --g_prepIn;
    for (int k = 0; k < frames; ++k) {
        float y = g_k35.Tick(MMB_INPUTS[IN_AUDIO].buf[k]);
        // De firmware schrijft hier int16 zonder clamp; bij zelf-oscillatie
        // mét drive vouwt dat om. Hier begrenzen we — een simulator die
        // klaterend overstuurt leert je niets over de patch.
        if (y > 1.0f) y = 1.0f; else if (y < -1.0f) y = -1.0f;
        MMB_OUTPUTS[0].buf[k] = y;
    }
}
