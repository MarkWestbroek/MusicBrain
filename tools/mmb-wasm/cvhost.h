// Gedeelde gastheer voor firmware-CvModules in de browser-simulator.
//
// Chord, Quant, Grids, AHDSR, LFO, CvMath en de sequencer zijn in de firmware
// `mb::runtime::CvModule`s die alleen van de pure core afhangen (C++17, geen
// Arduino). Er valt dus niets te verhuizen of na te bouwen: de wrapper
// compileert de firmwareklasse zelf en stuurt hem aan zoals de Teensy dat
// doet. Op 1 kHz, blok 1, net als Marbles en Stages.
//
// Twee dingen doet de gastheer precies zoals de firmware, omdat modules erop
// leunen:
//
//  * **Een ingang wordt alleen geschreven als de waarde verandert** — zo doet
//    `CvGraph::tickBridge()` het. De AHDSR rekent daarop: elke
//    `writeCvPort("gate", 1)` is voor hem een opgaande flank, dus wie elke
//    tick schrijft, slaat de envelope duizend keer per seconde opnieuw aan.
//  * **Een control krijgt het type dat de Teensy uit de patch-JSON leest**
//    (`ProjectRuntime.h`): een toggle wordt `bool`, een geheel getal `int32`
//    (JSON kent geen 1.0 — `JSON.stringify(1.0)` is `"1"`), de rest `float`.
//    De worklet geeft alles als getal door, dus de wrapper noemt zijn toggles
//    in `CVHOST_TOGGLES` vóór de include. Ahdsr leest `loop` alleen als bool
//    en Lfo `bipolar` niet als float — met het verkeerde type negeren ze hem.
//
// Een wrapper levert de tabellen (MMB_INPUTS/OUTPUTS/CONTROLS, met de namen
// uit de catalogus) en `cvhost_make()`, die de module aanmaakt. Dat mag ook
// een gewone `Module` zijn zonder tick (CvMath): `tick()` gaat, net als in
// `main.cpp`, alleen naar wat `asCvModule()` teruggeeft.
#pragma once
#include <cmath>
#include <cstdint>
#include <cstring>

#include "mmb_abi.h"
#include "mb/runtime/CvModule.h"

#ifndef CVHOST_TOGGLES
#define CVHOST_TOGGLES nullptr
#endif

mb::runtime::Module* cvhost_make();

namespace {
// Platte globals: geen constructor-machinerie in deze -nostartfiles-build.
constexpr int kCvMaxInputs = 32;
mb::runtime::Module*   g_cvmod  = nullptr;
mb::runtime::CvModule* g_cvtick = nullptr;
float g_cvLast[kCvMaxInputs];
bool  g_cvPrimed[kCvMaxInputs];

bool cvhost_is_toggle(const char* id) {
    static const char* const kToggles[] = { CVHOST_TOGGLES };
    for (const char* t : kToggles)
        if (t && std::strcmp(t, id) == 0) return true;
    return false;
}
}  // namespace

void mmb_setup() {
    g_cvmod  = cvhost_make();
    g_cvtick = g_cvmod ? g_cvmod->asCvModule() : nullptr;
}

void mmb_on_control(int idx, float v) {
    if (!g_cvmod) return;
    const char* id = MMB_CONTROLS[idx].id;
    mb::runtime::ControlValue cv{v};
    if (cvhost_is_toggle(id))
        cv = mb::runtime::ControlValue{v >= 0.5f};
    else if (v == std::floor(v) && std::fabs(v) < 2147483648.0f)
        cv = mb::runtime::ControlValue{static_cast<std::int32_t>(v)};
    g_cvmod->setControl(id, cv);
}

void mmb_process(int frames) {
    if (!g_cvmod) return;
    for (int k = 0; k < frames; ++k) {
        // Zoals de CvGraph: alleen verbonden poorten, en alleen bij een
        // nieuwe waarde. Een losgetrokken kabel laat de laatste waarde staan,
        // net als op de Teensy; steek je hem weer in, dan volgt een schrijf.
        for (int i = 0; i < MMB_NUM_INPUTS && i < kCvMaxInputs; ++i) {
            if (!mmb_connected(i)) { g_cvPrimed[i] = false; continue; }
            const float v = MMB_INPUTS[i].buf[k];
            if (!g_cvPrimed[i] || v != g_cvLast[i]) {
                g_cvmod->writeCvPort(MMB_INPUTS[i].id, v);
                g_cvLast[i] = v;
                g_cvPrimed[i] = true;
            }
        }
        if (g_cvtick) g_cvtick->tick();
        for (int o = 0; o < MMB_NUM_OUTPUTS; ++o)
            MMB_OUTPUTS[o].buf[k] = g_cvmod->readCvPort(MMB_OUTPUTS[o].id);
    }
}
