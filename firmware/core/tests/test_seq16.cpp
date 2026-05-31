// CTest — FW-SQ-1 Seq16 (16-step CV/Gate sequencer):
//  - Registry self-registration round-trip
//  - Default output sits at the root (0 V) and steps advance on the rate clock
//  - Per-step semitone offsets map to V/Oct
//  - Gate output is high for the configured fraction of each step
//  - `length` wraps the sequence
//  - Off mode bypasses (voct_in -> cv, run_in -> gate)
//  - Reset returns to step 0
//  - External clock drives stepping and disables the internal rate
#include "test_harness.h"
#include "mb/runtime/Seq16.h"
#include "mb/runtime/Registry.h"

#include <cmath>

using namespace mb::runtime;

namespace {

void tickN(Seq16& s, int n) {
    for (int i = 0; i < n; ++i) s.tick();
}

constexpr float kEps = 1e-3f;

}  // namespace

MB_TEST(seq16_self_registers_in_global_registry) {
    MB_REQUIRE(Registry::global().has(Seq16::kTypeId));
    auto mod = Registry::global().create(Seq16::kTypeId, "seq1");
    MB_REQUIRE(mod != nullptr);
    MB_REQUIRE(mod->typeId() == Seq16::kTypeId);
    MB_REQUIRE(mod->id()     == "seq1");
}

MB_TEST(seq16_default_output_is_root_zero_volts) {
    Seq16 s("s");
    // All steps default to 0 semitones, root 60 -> 0 V.
    s.tick();
    MB_REQUIRE(std::fabs(s.readCvPort("cv")) < kEps);
    MB_REQUIRE(s.currentStep() == 0);
}

MB_TEST(seq16_steps_advance_on_internal_rate) {
    Seq16 s("s");
    // Default rate 4 Hz -> 250 ticks per step.
    s.setControl("s2", 12.0f);   // step index 1 = +1 octave
    MB_REQUIRE(s.currentStep() == 0);
    tickN(s, 250);               // cross one step boundary
    MB_REQUIRE(s.currentStep() == 1);
    MB_REQUIRE(std::fabs(s.readCvPort("cv") - 1.0f) < 1e-2f);
}

MB_TEST(seq16_gate_high_for_half_step_by_default) {
    Seq16 s("s");
    // Gate fraction 0.5 of a 250-tick step -> ~125 ticks high.
    MB_REQUIRE(s.readCvPort("gate_out") > 0.5f);  // armed high at step 0
    tickN(s, 120);
    MB_REQUIRE(s.readCvPort("gate_out") > 0.5f);
    tickN(s, 20);                                  // total 140 > 125
    MB_REQUIRE(s.readCvPort("gate_out") < 0.5f);
}

MB_TEST(seq16_length_wraps_sequence) {
    Seq16 s("s");
    s.setControl("length", 2);
    tickN(s, 250);
    MB_REQUIRE(s.currentStep() == 1);
    tickN(s, 250);
    MB_REQUIRE(s.currentStep() == 0);   // wrapped after 2 steps
}

MB_TEST(seq16_off_mode_bypasses) {
    Seq16 s("s");
    s.setControl("run", 1);             // Off
    s.writeCvPort("voct_in", 0.5f);
    s.writeCvPort("run_in", 1.0f);
    s.tick();
    MB_REQUIRE(std::fabs(s.readCvPort("cv") - 0.5f) < kEps);
    MB_REQUIRE(s.readCvPort("gate_out") > 0.5f);
    s.writeCvPort("run_in", 0.0f);
    MB_REQUIRE(s.readCvPort("gate_out") < 0.5f);
}

MB_TEST(seq16_reset_returns_to_step_zero) {
    Seq16 s("s");
    tickN(s, 500);                      // advance ~2 steps
    MB_REQUIRE(s.currentStep() == 2);
    s.writeCvPort("reset", 1.0f);       // rising edge
    MB_REQUIRE(s.currentStep() == 0);
}

MB_TEST(seq16_external_clock_drives_steps) {
    Seq16 s("s");
    auto clockPulse = [&] {
        s.writeCvPort("clock", 1.0f);
        s.writeCvPort("clock", 0.0f);
    };
    clockPulse();
    MB_REQUIRE(s.currentStep() == 1);
    clockPulse();
    MB_REQUIRE(s.currentStep() == 2);
    // Internal rate must no longer advance once external clock is latched.
    tickN(s, 1000);
    MB_REQUIRE(s.currentStep() == 2);
}
