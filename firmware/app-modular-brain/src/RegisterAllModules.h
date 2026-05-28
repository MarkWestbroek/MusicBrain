/**
 * @file RegisterAllModules.h
 * @brief Linker bootstrap — ensures every module factory survives dead-code
 *        elimination at link time.
 *
 * @details
 * PlatformIO builds firmware libraries as static archives (`.a` files).
 * The linker only pulls in an object file from an archive if at least one
 * symbol from that file is referenced elsewhere in the program.  Because
 * each module registers itself via a **static initialiser** inside its own
 * translation unit, the linker discards the entire object when nothing
 * directly calls a symbol from it — and the factory silently disappears
 * from the global Registry.
 *
 * This header works around the issue by providing a single function,
 * `registerAllRuntimeModules()`, that calls `registerFactory()` on each
 * module class.  Calling it from `main.cpp::setup()` before any
 * `ProjectRuntime::applyConfig()` is called gives the linker enough
 * references to retain every required object file.
 *
 * **Registration order matters for `tp_mmb_ahdsr`:**
 * `mb::runtime::Ahdsr` auto-registers itself via a static initialiser in
 * `Ahdsr.cpp`.  `AhdsrAudioModule::registerFactory()` must be called
 * **after** that initialiser has run (which it always has, before `setup()`)
 * so that the audio-capable factory overwrites the pure-CV one.
 * `Registry::register_()` uses insert-or-assign semantics, so the last
 * registration for a given typeId wins.
 *
 * **Adding a new module:**
 * 1. Include its header below.
 * 2. Add one `MyNewModule::registerFactory();` line inside the function.
 * That's all — no other file needs to change.
 */
#pragma once

#include "mb/runtime/MidiIn.h"
#include "mb/runtime/Lfo.h"

// Audio-domain module wrappers (app-modular-brain specific)
#include "AhdsrAudioModule.h"
#include "VcoModule.h"
#include "VcaModule.h"
#include "VcfModule.h"
#include "OutModule.h"
#include "mb/runtime/CvMath.h"

namespace mmb_link {

/** @brief Register every known module type with the global Registry.
 *  Must be called once from `setup()`, before any `ProjectRuntime::applyConfig()`. */
inline void registerAllRuntimeModules() {
    mb::runtime::MidiInModule::registerFactory();
    mb::runtime::Lfo::registerFactory();
    mb::runtime::CvMath::registerFactory();

    // Audio-domain module wrappers — registered last so they win over any
    // static-init factories from core library TUs (specifically Ahdsr.cpp).
    VcoModule::registerFactory();
    VcaModule::registerFactory();
    VcfModule::registerFactory();
    OutModule::registerFactory();
    AhdsrAudioModule::registerFactory();  // must be last: overwrites Ahdsr's auto-registration
}

}  // namespace mmb_link
