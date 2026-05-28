// ADR 0009 — Lfo implementation. See header for design notes.
#include "mb/runtime/Lfo.h"

#include <algorithm>
#include <cmath>

namespace mb::runtime {

namespace {

// Compile-time inverse of the tick rate (seconds per tick). Avoids a
// division in the hot path; the compiler folds it.
constexpr float kSecondsPerTick = 1.0f / static_cast<float>(kCvTickRateHz);

// Convert a raw xorshift32 output to a float in [-1, +1]. Top 24 bits
// only — plenty of resolution for an S&H sample, and avoids the IEEE-754
// sign-bit weirdness around 0.
float randomFloatBipolar(std::uint32_t r) {
    constexpr float kInv = 1.0f / static_cast<float>(1u << 23);
    return static_cast<float>(static_cast<int32_t>(r >> 8) - (1 << 23)) * kInv;
}

}  // namespace

Lfo::Lfo(std::string_view id) : CvModule(kTypeId, id) {}

std::uint32_t Lfo::nextRandom() {
    // xorshift32 — period 2^32 - 1, fast, deterministic.
    std::uint32_t x = rng_;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    rng_ = x;
    return x;
}

void Lfo::setControl(std::string_view controlId, ControlValue value) {
    auto asFloat = [&](float fallback) -> float {
        if (auto* f = std::get_if<float>(&value))         return *f;
        if (auto* i = std::get_if<std::int32_t>(&value))  return static_cast<float>(*i);
        if (auto* b = std::get_if<bool>(&value))          return *b ? 1.0f : 0.0f;
        return fallback;
    };
    auto asInt = [&](std::int32_t fallback) -> std::int32_t {
        if (auto* i = std::get_if<std::int32_t>(&value))  return *i;
        if (auto* f = std::get_if<float>(&value))         return static_cast<std::int32_t>(*f);
        return fallback;
    };
    auto asBool = [&](bool fallback) -> bool {
        if (auto* b = std::get_if<bool>(&value))          return *b;
        if (auto* i = std::get_if<std::int32_t>(&value))  return *i != 0;
        return fallback;
    };

    if (controlId == "rate" || controlId == "freq") {
        rateHz_ = std::clamp(asFloat(1.0f), 0.001f, 5000.0f);
    } else if (controlId == "depth" || controlId == "amount") {
        depth_ = std::clamp(asFloat(1.0f), 0.0f, 1.0f);
    } else if (controlId == "wave" || controlId == "shape") {
        const auto idx = std::clamp<std::int32_t>(asInt(0), 0, 4);
        wave_ = static_cast<Wave>(idx);
    } else if (controlId == "bipolar") {
        bipolar_ = asBool(true);
    } else if (controlId == "run") {
        const auto idx = std::clamp<std::int32_t>(asInt(0), 0, 2);
        run_ = static_cast<Run>(idx);
        // Mode change resets the running flag to its mode-default so the
        // user gets predictable behaviour after flipping the switch.
        if (run_ == Run::Always)  running_ = true;
        if (run_ == Run::Gated)   running_ = lastGate_;
        if (run_ == Run::OneShot) running_ = false;
    }
}

void Lfo::setGate(bool open) {
    const bool rising = open && !lastGate_;
    lastGate_ = open;
    switch (run_) {
        case Run::Always:                                   break;  // ignored
        case Run::Gated:    running_ = open;                break;
        case Run::OneShot:
            if (rising) { running_ = true; phase_ = 0.0f; }
            break;
    }
}

void Lfo::reset() {
    phase_ = 0.0f;
    // Refresh the S&H sample immediately so a manual reset doesn't leave
    // the output stuck on the previous cycle's value.
    shCached_ = randomFloatBipolar(nextRandom());
}

void Lfo::tick() {
    if (!running_) {
        // Still recompute value_ so a `depth` / `bipolar` change while
        // halted is reflected on the output without needing a re-trigger.
        value_ = applyShape(waveValue(phase_));
        return;
    }

    const float prevPhase = phase_;
    phase_ += rateHz_ * kSecondsPerTick;
    if (phase_ >= 1.0f) {
        phase_ -= std::floor(phase_);             // wrap to [0,1)
        // Cycle boundary crossed → new S&H sample.
        shCached_ = randomFloatBipolar(nextRandom());
        // OneShot stops at the end of its first cycle. We leave `phase_`
        // at its wrapped position (≈ 0) so the output continues to make
        // sense if the gate retriggers later.
        if (run_ == Run::OneShot) running_ = false;
    }
    (void)prevPhase;  // reserved for future "phase-reset on rate change" logic

    value_ = applyShape(waveValue(phase_));
}

float Lfo::waveValue(float phase) const {
    // All branches return a value in [-1, +1]. Keep the math branchless
    // where it is cheap; this runs at the CV tick rate, not the audio
    // rate, so a switch is fine on modern Cortex-M cores.
    constexpr float kTau = 6.28318530717958647692f;
    switch (wave_) {
        case Wave::Sine:
            return std::sin(kTau * phase);
        case Wave::Triangle:
            // 0..0.5 → -1..+1, 0.5..1 → +1..-1
            return phase < 0.5f ? (4.0f * phase - 1.0f)
                                : (3.0f - 4.0f * phase);
        case Wave::Sawtooth:
            // Up-ramp -1..+1 (matches Tone.LFO 'sawtooth').
            return 2.0f * phase - 1.0f;
        case Wave::Square:
            return phase < 0.5f ? 1.0f : -1.0f;
        case Wave::SampleAndHold:
            return shCached_;
    }
    return 0.0f;
}

float Lfo::applyShape(float raw) const {
    // Bipolar: scale by depth → [-depth, +depth].
    // Unipolar: shift+scale to [0, depth] so 0% depth = silent floor at 0.
    if (bipolar_) return raw * depth_;
    return (raw * 0.5f + 0.5f) * depth_;
}

void Lfo::registerFactory() {
    auto& reg = Registry::global();
    if (reg.has(kTypeId)) return;
    reg.register_(kTypeId, [](std::string_view instanceId) -> std::unique_ptr<Module> {
        return std::make_unique<Lfo>(instanceId);
    });
}

namespace {
const int kLfoAutoRegister = [] { Lfo::registerFactory(); return 0; }();
}

}  // namespace mb::runtime
