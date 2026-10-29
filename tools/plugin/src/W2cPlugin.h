#pragma once
// Eén module als plugin via wasm2c: de .wasm uit editor/public/wasm
// (dezelfde die de simulator draait) als C, met een eigen instantie per
// exemplaar (W2cRuntime.h). Gemeten even snel als native en bit-gelijk of
// onhoorbaar verschillend (doc/plans/plugin.md, "Meerdere exemplaren").
//
// De gegenereerde plugin.cpp voegt mod_vt.h in (gen_w2c.py, in de bouwmap)
// en geeft die tabel als W2cModuleHost::table().

#include "HostProcessor.h"
#include "W2cRuntime.h"
#include "mod_vt.h"

namespace mmb_plugin {

/** De Host van HostProcessor: één instantie van de module van deze plugin. */
struct W2cModuleHost : W2cHost {
    W2cModuleHost() : W2cHost(kW2c_mod) {}
};

using W2cProcessor = HostProcessor<W2cModuleHost>;

}  // namespace mmb_plugin
