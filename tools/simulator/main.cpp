// Host-side simulator: feeds canned input events through a Router and prints
// the resulting output commands. A scaffolding placeholder for now; will grow
// into a real REPL/scriptable harness in roadmap stage 1.

#include "mb/PatchBank.h"
#include "mb/Router.h"
#include "mb/host/HostStore.h"
#include <cstdio>

namespace {
const char* kindName(mb::OutputKind k) {
    switch (k) {
        case mb::OutputKind::None:         return "None";
        case mb::OutputKind::RelaySet:     return "RelaySet";
        case mb::OutputKind::CvSet:        return "CvSet";
        case mb::OutputKind::CvSegment:    return "CvSegment";
        case mb::OutputKind::GateSet:      return "GateSet";
        case mb::OutputKind::TriggerPulse: return "TriggerPulse";
        case mb::OutputKind::MidiOut:      return "MidiOut";
        case mb::OutputKind::DisplayDirty: return "DisplayDirty";
    }
    return "?";
}
}

int main() {
    mb::PatchBank bank;
    mb::Patch p;
    p.id = 1;
    p.setName("Hello");
    bank.insert(p);
    bank.setActive(1);

    mb::NullRouter router;
    const mb::InputEvent events[] = {
        {mb::InputKind::MidiProgramChange, 0, 1, 0},
        {mb::InputKind::MidiNoteOn,        0, 60, 100},
    };

    for (const auto& ev : events) {
        auto out = router.handle(ev, bank.active());
        std::printf("event -> %zu cmd(s)\n", out.count);
        for (std::size_t i = 0; i < out.count; ++i) {
            std::printf("  %s\n", kindName(out.commands[i].kind));
        }
    }
    return 0;
}
