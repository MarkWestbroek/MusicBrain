// End-to-end smoke test: build a SynthPatchV1, hand a MIDI NoteOn into
// MatrixRouter, dispatch the resulting commands onto a VirtualSpiBus, and
// confirm a real DAC voltage + gate state appears at the modelled chips.

#include "mb/MatrixRouter.h"
#include "mb/Patch.h"
#include "mb/SynthPatch.h"
#include "mb_sim/Clock.h"
#include "mb_sim/RouterBridge.h"
#include "mb_sim/Trace.h"
#include "mb_sim/VirtualSpiBus.h"
#include "mb_sim/chips/Dac8568.h"
#include "mb_sim/chips/GateBoard.h"
#include "../../core/tests/test_harness.h"
#include <cmath>
#include <sstream>

// Builds the canonical 8-voice patch on caseId=0, firstSlot=0 (so pitch
// channels are 0x0000, 0x0002, ..., 0x000E and gates 0x0001 ..0x000F).
static mb::Patch buildPatch() {
    mb::Patch p;
    p.id   = 1;
    p.setName("sim e2e");
    mb::synth::SynthPatchV1 sp{};
    sp.voiceCount = 8;
    sp.caseId     = 0;
    sp.firstSlot  = 0;
    sp.pitchBits  = 16;
    MB_REQUIRE(mb::synth::writeBlob(p, sp));
    return p;
}

MB_TEST(sim_e2e_noteon_emits_cv_and_gate) {
    mb::sim::Clock          clock;
    std::ostringstream      traceBuf;
    mb::sim::Trace          trace(traceBuf);
    mb::sim::VirtualSpiBus  bus(clock, trace);
    mb::sim::Dac8568        dac (clock, trace, bus, /*channelBase*/0x0000);
    mb::sim::GateBoard      gates(clock, trace, bus, /*channelBase*/0x0000);
    mb::sim::RouterBridge   bridge(bus);

    mb::Patch         patch  = buildPatch();
    mb::MatrixRouter  router;

    // NoteOn middle C → first voice → pitch ch 0x0000, gate ch 0x0001.
    mb::InputEvent ev{};
    ev.kind    = mb::InputKind::MidiNoteOn;
    ev.payload = 60;
    ev.data    = 100;
    clock.advance(1000);
    const auto r = router.handle(ev, &patch);
    bridge.dispatch(r);

    // Middle C = 0 V on this scale (cv = (60-60)/60).
    MB_REQUIRE(std::fabs(dac.voltage(0x0000) - 0.0f) < 1e-3f);
    MB_REQUIRE(gates.state(0x0001) == true);
    MB_REQUIRE(bus.framesSent() >= 2);
}

MB_TEST(sim_e2e_noteon_72_is_one_volt) {
    mb::sim::Clock          clock;
    std::ostringstream      traceBuf;
    mb::sim::Trace          trace(traceBuf);
    mb::sim::VirtualSpiBus  bus(clock, trace);
    mb::sim::Dac8568        dac (clock, trace, bus, 0x0000);
    mb::sim::GateBoard      gates(clock, trace, bus, 0x0000);
    mb::sim::RouterBridge   bridge(bus);

    mb::Patch        patch = buildPatch();
    mb::MatrixRouter router;

    mb::InputEvent ev{};
    ev.kind    = mb::InputKind::MidiNoteOn;
    ev.payload = 72;  // one octave up → +1.0 V on a /60 scale w/ ±5V FSR
    ev.data    = 100;
    bridge.dispatch(router.handle(ev, &patch));

    // (72-60)/60 = 0.2 of full scale; full-scale = ±5V → 1.0 V.
    MB_REQUIRE(std::fabs(dac.voltage(0x0000) - 1.0f) < 1e-2f);
    MB_REQUIRE(gates.state(0x0001));
}

MB_TEST(sim_e2e_noteoff_clears_gate) {
    mb::sim::Clock          clock;
    std::ostringstream      traceBuf;
    mb::sim::Trace          trace(traceBuf);
    mb::sim::VirtualSpiBus  bus(clock, trace);
    mb::sim::Dac8568        dac (clock, trace, bus, 0x0000);
    mb::sim::GateBoard      gates(clock, trace, bus, 0x0000);
    mb::sim::RouterBridge   bridge(bus);

    mb::Patch        patch = buildPatch();
    mb::MatrixRouter router;

    mb::InputEvent on{};
    on.kind    = mb::InputKind::MidiNoteOn;
    on.payload = 64;
    on.data    = 100;
    bridge.dispatch(router.handle(on, &patch));
    MB_REQUIRE(gates.state(0x0001));

    mb::InputEvent off{};
    off.kind    = mb::InputKind::MidiNoteOff;
    off.payload = 64;
    bridge.dispatch(router.handle(off, &patch));
    MB_REQUIRE(!gates.state(0x0001));
}

MB_TEST(sim_e2e_trace_contains_cv_and_gate_lines) {
    mb::sim::Clock          clock;
    std::ostringstream      traceBuf;
    mb::sim::Trace          trace(traceBuf);
    mb::sim::VirtualSpiBus  bus(clock, trace);
    mb::sim::Dac8568        dac (clock, trace, bus, 0x0000);
    mb::sim::GateBoard      gates(clock, trace, bus, 0x0000);
    mb::sim::RouterBridge   bridge(bus);

    mb::Patch        patch = buildPatch();
    mb::MatrixRouter router;

    mb::InputEvent ev{};
    ev.kind    = mb::InputKind::MidiNoteOn;
    ev.payload = 60;
    clock.advance(42);
    bridge.dispatch(router.handle(ev, &patch));

    const std::string out = traceBuf.str();
    MB_REQUIRE(out.find("\"kind\":\"spi\"")   != std::string::npos);
    MB_REQUIRE(out.find("\"kind\":\"cv\"")    != std::string::npos);
    MB_REQUIRE(out.find("\"kind\":\"gate\"")  != std::string::npos);
    MB_REQUIRE(out.find("\"t_us\":42")        != std::string::npos);
    MB_REQUIRE(out.find("\"ch\":\"0x0000\"")  != std::string::npos);
    MB_REQUIRE(out.find("\"ch\":\"0x0001\"")  != std::string::npos);
}
