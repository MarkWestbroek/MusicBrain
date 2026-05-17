// Host-side simulator: drives MatrixRouter against a virtual SPI bus with
// modelled DAC8568 + GateBoard breakouts, and streams an NDJSON trace of
// every event to stdout. See doc/Simulation.md.
//
// Modes:
//   mb_simulator           one-shot C-major triad (exits after ~1 s)
//   mb_simulator --loop    repeat the demo forever (for the Scope panel)

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

#include <chrono>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <thread>

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

void playDemo(mb::sim::Clock& clock, mb::MatrixRouter& router,
              mb::sim::RouterBridge& bridge, const mb::Patch& patch) {
    const uint8_t chord[] = {60, 64, 67};
    for (uint8_t n : chord) {
        clock.advance(50);
        mb::InputEvent on{};
        on.kind = mb::InputKind::MidiNoteOn; on.payload = n; on.data = 100;
        bridge.dispatch(router.handle(on, &patch));
    }
    clock.advance(1'000'000);
    for (uint8_t n : chord) {
        mb::InputEvent off{};
        off.kind = mb::InputKind::MidiNoteOff; off.payload = n;
        bridge.dispatch(router.handle(off, &patch));
        clock.advance(10);
    }
}

}  // namespace

int main(int argc, char** argv) {
    bool loop = false;
    for (int i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "--loop") == 0) loop = true;
    }

    // Line-buffer stdout so scope-bridge sees each NDJSON line as it's emitted.
    std::cout.setf(std::ios::unitbuf);

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

    do {
        playDemo(clock, router, bridge, *bank.active());
        if (loop) {
            // Real-time pacing between repeats so the scope animation looks
            // natural rather than dumping all frames at once.
            std::this_thread::sleep_for(std::chrono::milliseconds(1500));
            clock.advance(500'000);
        }
    } while (loop);

    return 0;
}
