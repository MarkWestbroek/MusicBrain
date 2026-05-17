#pragma once
// Router that drives the project-1 effect switcher: program-change selects a
// patch, applies its relay mask in one shot, and refreshes the display.
// Footswitch input is mapped to PC up / PC down (id 0 = up, id 1 = down).
//
// Like MatrixRouter, this stays pure: no I/O, no time. The caller holds the
// concrete IRelayBoard/IDisplay and invokes them based on the RouterResult.

#include "PatchBank.h"
#include "Router.h"
#include "SwitcherPatch.h"
#include <cstdint>

namespace mb {

class SwitcherRouter : public Router {
public:
    explicit SwitcherRouter(PatchBank& bank) : bank_(bank) {}

    RouterResult handle(const InputEvent& ev, const Patch* active) override;

private:
    RouterResult selectProgram(ProgramId id);

    PatchBank& bank_;
};

}  // namespace mb
