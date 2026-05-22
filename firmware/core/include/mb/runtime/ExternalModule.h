#pragma once
// ADR 0009 — external module representation (firmware skeleton).
//
// An ExternalModule is a passive routing handle: it carries no audio or CV
// processing on the brain. The brain only knows where its CV/gate outputs
// terminate on the internal bus (which breakout / which channel), and which
// patch-time controls (if any) the user has assigned to it.
//
// The web simulator voices ExternalModule by proxy — see TS layer 1
// `ModuleDefinition.simulatedBy`. On the device, the proxy is absent: the
// real Eurorack hardware is the implementation.

#include "Module.h"

namespace mb::runtime {

class ExternalModule : public Module {
public:
    using Module::Module;

    // External modules have no live-control behaviour on the brain itself;
    // any control changes are forwarded to whichever breakout owns the
    // physical destination (see ADR 0006 bus framing).
    void setControl(std::string_view /*controlId*/, ControlValue /*value*/) override {}
};

}  // namespace mb::runtime
