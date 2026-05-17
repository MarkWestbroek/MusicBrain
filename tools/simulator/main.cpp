// Host-side simulator: drives MatrixRouter against a virtual SPI bus with
// modelled DAC8568 + GateBoard breakouts, and streams an NDJSON trace of
// every event to stdout. See doc/Simulation.md.

#include "mb/MatrixRouter.h"
#include "mb/Patch.h"
#include "mb/PatchBank.h"
#include "mb/SynthPatch.h"
#include "mb_sim/Clock.h"
#include "mb_sim/RouterBridge.h"
#include "mb_sim/Trace.h"
#include "mb_sim/VirtualSpiBus.h"
#include "mb_sim/chips/Dac8568.h"
#include "mb_sim/chips/GateBoard.h"

#include <cstdint>
#include <iostream>

namespace {

mb::Patch buildDefaultPatch() {
    mb::Patch p;
    p.id = 1;
    p.setName("default 8v");
    mb::synth::SynthPatchV1 sp{};
    sp.voiceCount = 8;
    sp.caseId     = 0;
    sp.firstSlot  = 0;
    sp.pitchBits  = 16;
    mb::synth::writeBlob(p, sp);
    return p;
}

}  // namespace

int main(int /*argc*/, char** /*argv*/) {
    mb::sim::Clock          clock;
    mb::sim::Trace          trace(std::cout);
    mb::sim::VirtualSpiBus  bus(clock, trace);
    mb::sim::Dac8568        dac (clock, trace, bus, /*channelBase*/0x0000);
    mb::sim::GateBoard      gates(clock, trace, bus, /*channelBase*/0x0000);
    mb::sim::RouterBridge   bridge(bus);

    mb::PatchBank bank;
    mb::Patch     p = buildDefaultPatch();
    bank.insert(p);
    bank.setActive(1);

    mb::MatrixRouter router;

    // Built-in demo: a 1-second C major chord, voices allocated round-robin.
    const uint8_t chord[] = {60, 64, 67};
    for (uint8_t n : chord) {
        clock.advance(50);
        mb::InputEvent on{};
        on.kind = mb::InputKind::MidiNoteOn; on.payload = n; on.data = 100;
        bridge.dispatch(router.handle(on, bank.active()));
    }
    clock.advance(1'000'000);
    for (uint8_t n : chord) {
        mb::InputEvent off{};
        off.kind = mb::InputKind::MidiNoteOff; off.payload = n;
        bridge.dispatch(router.handle(off, bank.active()));
        clock.advance(10);
    }

    return 0;
}
