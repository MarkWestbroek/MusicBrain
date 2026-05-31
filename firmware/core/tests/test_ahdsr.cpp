// CTest — covers ADR 0009 runtime layer:
//  - Registry round-trip (Ahdsr self-registers, factory builds an instance)
//  - Phase machine progression at 1 kHz tick rate
//  - Sustain hold-forever + release falls back to zero
//  - Loop mode restarts from Attack after Release
#include "test_harness.h"
#include "mb/runtime/Ahdsr.h"
#include "mb/runtime/Registry.h"

using namespace mb::runtime;

namespace {

// Drive the envelope `n` ticks. Returns the last value computed.
float tickN(Ahdsr& env, std::uint32_t n) {
    for (std::uint32_t i = 0; i < n; ++i) env.tick();
    return env.value();
}

}  // namespace

MB_TEST(ahdsr_self_registers_in_global_registry) {
    // The Ahdsr.cpp translation unit installs the factory at static-init
    // time. If linking pulled it in, the global registry knows the type.
    MB_REQUIRE(Registry::global().has(Ahdsr::kTypeId));
    auto mod = Registry::global().create(Ahdsr::kTypeId, "env1");
    MB_REQUIRE(mod != nullptr);
    MB_REQUIRE(mod->typeId() == Ahdsr::kTypeId);
    MB_REQUIRE(mod->id()     == "env1");
}

MB_TEST(ahdsr_idle_before_gate) {
    Ahdsr env("e");
    MB_REQUIRE(env.phase() == Ahdsr::Phase::Zero);
    MB_REQUIRE(env.value() == 0.0f);
    MB_REQUIRE(!env.active());
    tickN(env, 100);
    MB_REQUIRE(env.value() == 0.0f);
}

MB_TEST(ahdsr_attack_decay_sustain_release_progression) {
    Ahdsr env("e");
    // Short, deterministic times so the test runs in milliseconds-of-ticks.
    env.setControl("attack",  ControlValue{ 10.0f});  // 10 ms → 10 ticks
    env.setControl("hold",    ControlValue{  0.0f});
    env.setControl("decay",   ControlValue{ 20.0f});  // 20 ticks
    env.setControl("sustain", ControlValue{  0.5f});
    env.setControl("release", ControlValue{ 40.0f});  // 40 ticks

    env.setGate(true);
    MB_REQUIRE(env.phase() == Ahdsr::Phase::Attack);

    // After 10 ticks attack should have peaked and advanced past Attack
    // (Hold is skipped because hold=0, so we land in Decay).
    tickN(env, 10);
    MB_REQUIRE(env.phase() == Ahdsr::Phase::Decay);

    // 20 more ticks → decay finishes at sustain level (0.5).
    tickN(env, 20);
    MB_REQUIRE(env.phase() == Ahdsr::Phase::Sustain);
    MB_REQUIRE(env.value() > 0.49f && env.value() < 0.51f);

    // Sustain holds forever.
    tickN(env, 500);
    MB_REQUIRE(env.phase() == Ahdsr::Phase::Sustain);
    MB_REQUIRE(env.value() > 0.49f && env.value() < 0.51f);

    // Release from sustain level (0.5) over 40 ticks.
    env.setGate(false);
    MB_REQUIRE(env.phase() == Ahdsr::Phase::Release);
    tickN(env, 40);
    MB_REQUIRE(env.phase() == Ahdsr::Phase::Zero);
    MB_REQUIRE(env.value() == 0.0f);
    MB_REQUIRE(!env.active());
}

MB_TEST(ahdsr_hold_phase_inserted_when_hold_nonzero) {
    Ahdsr env("e");
    env.setControl("attack",  ControlValue{ 5.0f});
    env.setControl("hold",    ControlValue{15.0f});
    env.setControl("decay",   ControlValue{ 5.0f});
    env.setControl("sustain", ControlValue{ 0.3f});
    env.setGate(true);
    tickN(env, 5);
    MB_REQUIRE(env.phase() == Ahdsr::Phase::Hold);
    MB_REQUIRE(env.value() > 0.99f);
    tickN(env, 15);
    MB_REQUIRE(env.phase() == Ahdsr::Phase::Decay);
}

MB_TEST(ahdsr_loop_restarts_after_release) {
    Ahdsr env("e");
    env.setControl("attack",  ControlValue{2.0f});
    env.setControl("hold",    ControlValue{0.0f});
    env.setControl("decay",   ControlValue{2.0f});
    env.setControl("sustain", ControlValue{0.0f});  // skip sustain → release immediately at value 0
    env.setControl("release", ControlValue{2.0f});
    env.setControl("loop",    ControlValue{true});

    env.setGate(true);
    // Attack(2) + Decay(2) → sustain=0 → still in Sustain (gate open).
    tickN(env, 4);
    MB_REQUIRE(env.phase() == Ahdsr::Phase::Sustain);
    // Now close the gate to trigger release → loop should re-enter Attack.
    env.setGate(false);
    tickN(env, 2);
    MB_REQUIRE(env.phase() == Ahdsr::Phase::Attack);
}

MB_TEST(ahdsr_curve_changes_attack_midpoint) {
    // 100-ms attack so we can sample at the exact midpoint (tick 50).
    // Linear   : value(0.5) ≈ 0.5
    // Exp (p²) : value(0.5) ≈ 0.25
    // Log      : value(0.5) ≈ 0.75
    auto sampleAt = [](Ahdsr::Curve c) {
        Ahdsr env("e");
        env.setControl("attack",  ControlValue{100.0f});
        env.setControl("decay",   ControlValue{100.0f});
        env.setControl("sustain", ControlValue{  0.0f});
        env.setControl("curve",   ControlValue{static_cast<std::int32_t>(c)});
        env.setGate(true);
        tickN(env, 50);
        return env.value();
    };
    const float lin = sampleAt(Ahdsr::Curve::Linear);
    const float exp = sampleAt(Ahdsr::Curve::Exponential);
    const float log = sampleAt(Ahdsr::Curve::Logarithmic);
    MB_REQUIRE(lin > 0.49f && lin < 0.52f);
    MB_REQUIRE(exp > 0.23f && exp < 0.27f);
    MB_REQUIRE(log > 0.73f && log < 0.77f);
}

// Default (retrig off): a rising edge during Decay/Sustain/Release continues
// the slope from the current value — the attack does NOT restart from 0.
MB_TEST(ahdsr_default_retrigger_continues_from_current_value) {
    Ahdsr env("e");
    env.setControl("attack",  ControlValue{100.0f});
    env.setControl("decay",   ControlValue{ 10.0f});
    env.setControl("sustain", ControlValue{  0.5f});
    env.setControl("release", ControlValue{100.0f});

    env.setGate(true);
    tickN(env, 100 + 10);                       // reach Sustain (≈0.5)
    MB_REQUIRE(env.phase() == Ahdsr::Phase::Sustain);
    env.setGate(false);
    tickN(env, 20);                             // partway down the release
    const float beforeRetrig = env.value();
    MB_REQUIRE(beforeRetrig > 0.1f);

    // Rising edge while in Release. Without retrig the value is preserved
    // (no jump to 0) and the phase clock is advanced to match.
    env.setGate(true);
    MB_REQUIRE(env.phase() == Ahdsr::Phase::Attack);
    MB_REQUIRE(env.value() > beforeRetrig - 0.02f);   // did not reset to 0
}

// Retrig on: every rising edge restarts the attack from 0, regardless of the
// current value — the consistent-filter-wah behaviour (ED-RV-7).
MB_TEST(ahdsr_retrigger_mode_restarts_from_zero) {
    Ahdsr env("e");
    env.setControl("attack",  ControlValue{100.0f});
    env.setControl("decay",   ControlValue{ 10.0f});
    env.setControl("sustain", ControlValue{  0.5f});
    env.setControl("release", ControlValue{100.0f});
    env.setControl("retrig",  ControlValue{true});

    env.setGate(true);
    tickN(env, 100 + 10);                       // reach Sustain (≈0.5)
    MB_REQUIRE(env.phase() == Ahdsr::Phase::Sustain);
    MB_REQUIRE(env.value() > 0.45f);

    // Rising edge while sustaining high → hard restart from 0.
    env.setGate(true);
    MB_REQUIRE(env.phase() == Ahdsr::Phase::Attack);
    MB_REQUIRE(env.value() == 0.0f);
}
