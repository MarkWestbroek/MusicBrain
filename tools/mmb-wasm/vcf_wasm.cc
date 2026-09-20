// tp_mmb_vcf — state-variable filter (spiegel van VcfModule.h; de DSP zelf is
// mmb_dsp::Svf, dezelfde header als de firmware). Native 44,1 kHz, blok 32.
//
// Blok 32, zoals de andere 44,1 kHz-modules: de worklet rendert per
// render-quantum ~118 native samples, dus hoe groter het blok, hoe meer
// invoer hij vooruit moet lopen — en hoe meer voorsprong hij daarvoor moet
// bufferen (latency). De parameter-smoothing houden we wél op de
// Teensy-cadans — zie `kPrepareEvery`.
#include <cmath>

#include "mmb_abi.h"
#include "mmb_dsp/svf.h"

const char* const MMB_TYPE_ID     = "tp_mmb_vcf";
const float       MMB_NATIVE_RATE = 44100.0f;
const int         MMB_BLOCK       = 32;

enum { IN_AUDIO, IN_CV, IN_QCV };
MmbPort MMB_INPUTS[] = {
    { "in", MMB_AUDIO, 0, {} }, { "cv", MMB_CV, 0, {} }, { "q_cv", MMB_CV, 0, {} },
};
const int MMB_NUM_INPUTS = 3;
MmbPort MMB_OUTPUTS[] = { { "out", MMB_AUDIO, 0, {} } };
const int MMB_NUM_OUTPUTS = 1;

// Defaults gelijk aan de moduledefinitie in seedModules.ts.
enum { C_CUTOFF, C_Q, C_CV_AMT, C_Q_CV_AMT, C_TYPE };
MmbControl MMB_CONTROLS[] = {
    { "cutoff", 2000.0f }, { "q", 0.7f }, { "cv_amt", 1.0f },
    { "q_cv_amt", 2.0f }, { "type", 0.0f },
};
const int MMB_NUM_CONTROLS = 5;

namespace {
mmb_dsp::Svf g_svf;
float g_base   = 2000.0f;   ///< Cutoff-knop in Hz.
float g_cvAmt  = 1.0f;      ///< Cutoff-CV-diepte in octaven.
float g_baseQ  = 0.7f;      ///< Q-knop, catalogus-eenheid 0,7 … 5,0.
float g_qCvAmt = 2.0f;      ///< Q-CV-diepte in dezelfde eenheid.

/** Spiegelt `VcfModule::applyResonance()`: de catalogus draagt nog de oude
 *  `AudioFilterStateVariable`-eenheid (0,7 … 5,0), de kernel wil 0 … 1. */
void applyResonance(float qCv) {
    float q = g_baseQ + g_qCvAmt * qCv;
    if (q < 0.7f) q = 0.7f; else if (q > 5.0f) q = 5.0f;
    g_svf.set_resonance((q - 0.7f) / 4.3f);
}

/** De kernel smooth't één stap per `Prepare()`; op de Teensy gebeurt dat één
 *  keer per `AUDIO_BLOCK_SAMPLES` (128). Ons blok is 32, dus bereiden we één
 *  keer per vier blokken voor — anders regelt een sweep vier keer zo snel in
 *  als op de hardware. De doelwaarden zelf zetten we wél elk blok, net als de
 *  CvGraph die op 1 kHz schrijft. */
constexpr int kPrepareEvery = 128 / MMB_BLOCK;
int g_prepIn = 0;
}  // namespace

void mmb_setup() { g_svf.Init(MMB_NATIVE_RATE); }

void mmb_on_control(int idx, float v) {
    switch (idx) {
        case C_CUTOFF:   g_base   = v; break;
        case C_Q:        g_baseQ  = v; break;
        case C_CV_AMT:   g_cvAmt  = v; break;
        case C_Q_CV_AMT: g_qCvAmt = v; break;
        case C_TYPE:     g_svf.set_mode(static_cast<int>(v)); break;  // 0 LP, 1 HP, 2 BP
    }
}

void mmb_process(int frames) {
    // CV op control-rate, zoals de CvGraph: één waarde per blok, en alleen
    // als er een kabel op zit — anders staat de knop.
    float cv = mmb_connected(IN_CV) ? mmb_in0(IN_CV) : 0.0f;
    if (cv < -1.0f) cv = -1.0f; else if (cv > 1.0f) cv = 1.0f;
    g_svf.set_cutoff(g_base * std::exp2(g_cvAmt * cv));
    applyResonance(mmb_connected(IN_QCV) ? mmb_in0(IN_QCV) : 0.0f);

    if (g_prepIn <= 0) { g_svf.Prepare(); g_prepIn = kPrepareEvery; }
    --g_prepIn;
    for (int k = 0; k < frames; ++k) {
        float y = g_svf.Tick(MMB_INPUTS[IN_AUDIO].buf[k]);
        if (y > 1.0f) y = 1.0f; else if (y < -1.0f) y = -1.0f;
        MMB_OUTPUTS[0].buf[k] = y;
    }
}
