// CTest — ADR 0009 runtime layer LFO:
//  - Registry self-registration round-trip
//  - Sine cycle: peak / trough / mean values
//  - Bipolar vs unipolar output shape
//  - Run mode Gated freezes/unfreezes phase
//  - Run mode OneShot stops after one cycle
//  - S&H stays constant within a cycle
#include "test_harness.h"
#include "mb/runtime/Lfo.h"
#include "mb/runtime/Registry.h"

#include <cmath>

using namespace mb::runtime;

namespace {

// Drive the LFO `n` ticks. Returns the final value.
float tickN(Lfo& lfo, std::uint32_t n) {
    for (std::uint32_t i = 0; i < n; ++i) lfo.tick();
    return lfo.value();
}

constexpr float kEps = 1e-3f;

}  // namespace

MB_TEST(lfo_self_registers_in_global_registry) {
    MB_REQUIRE(Registry::global().has(Lfo::kTypeId));
    auto mod = Registry::global().create(Lfo::kTypeId, "lfo1");
    MB_REQUIRE(mod != nullptr);
    MB_REQUIRE(mod->typeId() == Lfo::kTypeId);
    MB_REQUIRE(mod->id()     == "lfo1");
}

MB_TEST(lfo_sine_bipolar_default_one_hz) {
    // Default: 1 Hz sine, bipolar, depth 1, free-running.
    // At 1 kHz tick rate, a quarter cycle = 250 ticks.
    Lfo lfo("l");
    // Phase 0 → sin(0) = 0.
    lfo.tick();
    MB_REQUIRE(std::fabs(lfo.value()) < 0.05f);
    // After ~quarter cycle: value should be near +1.
    tickN(lfo, 249);  // total 250 ticks ≈ phase 0.25
    MB_REQUIRE(lfo.value() > 0.95f);
    // After ~three-quarters: near -1.
    tickN(lfo, 500);  // total 750 ≈ phase 0.75
    MB_REQUIRE(lfo.value() < -0.95f);
    // After full cycle: back near 0.
    tickN(lfo, 250);  // total 1000 ≈ phase 1.0 → wraps to 0
    MB_REQUIRE(std::fabs(lfo.value()) < 0.05f);
}

MB_TEST(lfo_unipolar_stays_nonnegative_with_full_depth) {
    Lfo lfo("l");
    lfo.setControl("bipolar", false);
    // Sweep one full cycle, sample 100 times; every sample ≥ 0.
    for (int i = 0; i < 100; ++i) {
        tickN(lfo, 10);          // 10 ms steps
        MB_REQUIRE(lfo.value() >= -kEps);
        MB_REQUIRE(lfo.value() <= 1.0f + kEps);
    }
}

MB_TEST(lfo_depth_scales_output) {
    Lfo lfo("l");
    lfo.setControl("depth", 0.5f);
    // Quarter cycle (peak) at depth 0.5 → ≈ 0.5, not 1.0.
    tickN(lfo, 250);
    MB_REQUIRE(lfo.value() > 0.45f);
    MB_REQUIRE(lfo.value() < 0.55f);
}

MB_TEST(lfo_gated_mode_freezes_when_gate_low) {
    Lfo lfo("l");
    lfo.setControl("run", std::int32_t{1});  // Gated
    // Gate closed: no phase advance.
    tickN(lfo, 500);
    MB_REQUIRE(std::fabs(lfo.phase()) < kEps);
    // Open gate, advance 250 ticks → near peak.
    lfo.setGate(true);
    tickN(lfo, 250);
    MB_REQUIRE(lfo.value() > 0.9f);
    const float frozenValue = lfo.value();
    const float frozenPhase = lfo.phase();
    // Close gate, advance more → phase + value unchanged.
    lfo.setGate(false);
    tickN(lfo, 500);
    MB_REQUIRE(std::fabs(lfo.phase() - frozenPhase) < kEps);
    MB_REQUIRE(std::fabs(lfo.value() - frozenValue) < kEps);
}

MB_TEST(lfo_oneshot_stops_after_one_cycle) {
    Lfo lfo("l");
    lfo.setControl("run", std::int32_t{2});  // OneShot
    // Idle until gate.
    MB_REQUIRE(!lfo.running());
    lfo.setGate(true);
    MB_REQUIRE(lfo.running());
    // Just before completion: still running.
    tickN(lfo, 999);
    MB_REQUIRE(lfo.running());
    // After the wrap tick: stopped.
    tickN(lfo, 2);
    MB_REQUIRE(!lfo.running());
}

MB_TEST(lfo_sample_and_hold_stable_within_cycle) {
    Lfo lfo("l");
    lfo.setControl("wave", std::int32_t{4});  // S&H
    // One tick to populate value; then sample over rest of cycle.
    lfo.tick();
    const float v0 = lfo.value();
    for (int i = 0; i < 800; ++i) {
        lfo.tick();
        MB_REQUIRE(std::fabs(lfo.value() - v0) < kEps);
    }
    // After a wrap, value should (almost certainly) change. We can't
    // assert inequality on a single RNG draw without flakiness; instead
    // verify that across several cycles we see at least one change.
    bool changed = false;
    float prev = lfo.value();
    for (int cycle = 0; cycle < 5; ++cycle) {
        tickN(lfo, 1000);
        if (std::fabs(lfo.value() - prev) > kEps) { changed = true; break; }
        prev = lfo.value();
    }
    MB_REQUIRE(changed);
}

MB_TEST(lfo_reset_resets_phase) {
    Lfo lfo("l");
    tickN(lfo, 300);
    MB_REQUIRE(lfo.phase() > 0.2f);
    lfo.reset();
    MB_REQUIRE(std::fabs(lfo.phase()) < kEps);
}
