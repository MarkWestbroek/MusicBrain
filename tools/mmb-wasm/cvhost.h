// Gedeelde gastheer voor firmware-CvModules in de browser-simulator.
//
// Chord, Quant en Grids zijn in de firmware `mb::runtime::CvModule`s die
// alleen van de pure core afhangen (C++17, geen Arduino). Er valt dus niets
// te verhuizen of na te bouwen: de wrapper compileert de firmwareklasse zelf
// en stuurt hem aan zoals de CvGraph dat op de Teensy doet — per tick de
// verbonden ingangen schrijven, `tick()`, de uitgangen lezen. Op 1 kHz, blok
// 1, net als Marbles en Stages.
//
// Een wrapper levert de tabellen (MMB_INPUTS/OUTPUTS/CONTROLS, met de namen
// uit de catalogus) en `cvhost_make()`, die de module aanmaakt.
#pragma once
#include "mmb_abi.h"
#include "mb/runtime/CvModule.h"

mb::runtime::CvModule* cvhost_make();

namespace {
// Platte pointer: geen globals met constructor in deze -nostartfiles-build.
mb::runtime::CvModule* g_cvmod = nullptr;
}  // namespace

void mmb_setup() { g_cvmod = cvhost_make(); }

void mmb_on_control(int idx, float v) {
    // Alle drie de modules lezen hun knoppen als float in (ook de gehele,
    // via static_cast), dus float is voor elke control goed.
    if (g_cvmod) g_cvmod->setControl(MMB_CONTROLS[idx].id, mb::runtime::ControlValue{v});
}

void mmb_process(int frames) {
    if (!g_cvmod) return;
    for (int k = 0; k < frames; ++k) {
        // Zoals de CvGraph: alleen verbonden poorten krijgen een waarde. Een
        // losgetrokken kabel laat de laatste waarde staan, net als op de Teensy.
        for (int i = 0; i < MMB_NUM_INPUTS; ++i)
            if (mmb_connected(i)) g_cvmod->writeCvPort(MMB_INPUTS[i].id, MMB_INPUTS[i].buf[k]);
        g_cvmod->tick();
        for (int o = 0; o < MMB_NUM_OUTPUTS; ++o)
            MMB_OUTPUTS[o].buf[k] = g_cvmod->readCvPort(MMB_OUTPUTS[o].id);
    }
}
