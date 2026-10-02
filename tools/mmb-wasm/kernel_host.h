// Gedeelde gastheer voor mmb_dsp-kernels met de uniforme interface
// (Init / setControl / setCv / cvOut / Process), de wasm-tegenhanger van
// firmware/app-modular-brain/src/KernelStream.h.
//
// De wrapper levert de gewone tabellen (MMB_INPUTS/OUTPUTS/CONTROLS, in de
// volgorde van de Control-enum van de kernel) en vier lijstjes die zeggen
// welke poort welke rol heeft, en roept dan MMB_KERNEL_HOST aan:
//
//   static const int kAudioIn[]  = {0};       // MMB_INPUTS-index per audiokanaal
//   static const int kCvIn[]     = {1, 2};    // MMB_INPUTS-index per CvIn van de kernel
//   static const int kAudioOut[] = {0};       // MMB_OUTPUTS-index per audiokanaal
//   static const int kCvOut[]    = {1};       // MMB_OUTPUTS-index per CvOut van de kernel
//   MMB_KERNEL_HOST(mmb_dsp::Lpg, kAudioIn, 1, kCvIn, 2, kAudioOut, 1, kCvOut, 1)
//
// Een lege rol: geef een lijstje met één dummy en tel 0.
//
// Net als op de Teensy gaan CV's en gates per blok naar de kernel (hier 32
// samples, daar 128); een losse CV-ingang telt als 0.
#pragma once
#include "mmb_abi.h"

#define MMB_KERNEL_HOST(KERNEL, AIN, NAIN, CIN, NCIN, AOUT, NAOUT, COUT, NCOUT)          \
    namespace { KERNEL g_kernel; }                                                        \
    void mmb_setup() { g_kernel.Init(MMB_NATIVE_RATE); }                                  \
    void mmb_on_control(int index, float value) { g_kernel.setControl(index, value); }    \
    void mmb_process(int frames) {                                                        \
        for (int k = 0; k < (NCIN); ++k)                                                  \
            g_kernel.setCv(k, mmb_connected((CIN)[k]) ? mmb_in0((CIN)[k]) : 0.0f);        \
        const float* inputs[(NAIN) > 0 ? (NAIN) : 1] = {};                                \
        for (int k = 0; k < (NAIN); ++k)                                                  \
            inputs[k] = mmb_connected((AIN)[k]) ? MMB_INPUTS[(AIN)[k]].buf : nullptr;     \
        float* outputs[(NAOUT) > 0 ? (NAOUT) : 1] = {};                                   \
        for (int k = 0; k < (NAOUT); ++k) outputs[k] = MMB_OUTPUTS[(AOUT)[k]].buf;        \
        g_kernel.Process(inputs, outputs, frames);                                        \
        for (int k = 0; k < (NCOUT); ++k)                                                 \
            mmb_fill_out((COUT)[k], g_kernel.cvOut(k), frames);                           \
    }
