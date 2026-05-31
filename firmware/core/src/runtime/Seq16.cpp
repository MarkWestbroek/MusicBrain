// FW-SQ-1 — Seq16 implementation. See header for design notes.
#include "mb/runtime/Seq16.h"

#include <algorithm>
#include <cmath>

namespace mb::runtime {

namespace {

constexpr float kSecondsPerTick = 1.0f / static_cast<float>(kCvTickRateHz);

// V/Oct: MIDI note 60 (middle C) = 0.0 V; +1 V per octave.
float noteToVolts(float note) { return (note - 60.0f) / 12.0f; }

}  // namespace

Seq16::Seq16(std::string_view id) : CvModule(kTypeId, id) {
    // Arm the first step so a freshly-built sequencer emits a gate immediately.
    stepTicks_ = static_cast<std::int32_t>(kCvTickRateHz / rateHz_);
    gateTicks_ = static_cast<std::int32_t>(stepTicks_ * gateFrac_);
    trigTicks_ = kTrigTicks;
}

void Seq16::setControl(std::string_view controlId, ControlValue value) {
    auto asFloat = [&](float fallback) -> float {
        if (auto* f = std::get_if<float>(&value))        return *f;
        if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
        if (auto* b = std::get_if<bool>(&value))         return *b ? 1.0f : 0.0f;
        return fallback;
    };
    auto asInt = [&](std::int32_t fallback) -> std::int32_t {
        if (auto* i = std::get_if<std::int32_t>(&value)) return *i;
        if (auto* f = std::get_if<float>(&value))        return static_cast<std::int32_t>(*f);
        return fallback;
    };

    // Step controls "s1".."s16".
    if (controlId.size() >= 2 && controlId[0] == 's' &&
        controlId[1] >= '0' && controlId[1] <= '9') {
        int idx = -1;
        const auto num = controlId.substr(1);
        if (num.size() == 1) idx = num[0] - '1';
        else if (num.size() == 2 && num[0] >= '1' && num[0] <= '9'
                 && num[1] >= '0' && num[1] <= '9')
            idx = (num[0] - '0') * 10 + (num[1] - '0') - 1;
        if (idx >= 0 && idx < kSteps) {
            steps_[static_cast<std::size_t>(idx)] =
                std::clamp(asFloat(0.0f), -48.0f, 48.0f);
        }
        return;
    }

    if (controlId == "root") {
        root_ = std::clamp(asFloat(60.0f), 0.0f, 127.0f);
    } else if (controlId == "rate" || controlId == "freq") {
        rateHz_ = std::clamp(asFloat(4.0f), 0.01f, 100.0f);
    } else if (controlId == "gate") {
        gateFrac_ = std::clamp(asFloat(0.5f), 0.01f, 0.99f);
    } else if (controlId == "length") {
        length_ = std::clamp<std::int32_t>(asInt(8), 1, kSteps);
        if (step_ >= length_) step_ = 0;
    } else if (controlId == "run") {
        run_ = static_cast<Run>(std::clamp<std::int32_t>(asInt(0), 0, 2));
    }
}

void Seq16::writeCvPort(std::string_view portId, float value) {
    if (portId == "voct_in") {
        voctIn_ = value;
    } else if (portId == "run_in") {
        runInHigh_ = value >= 0.5f;
    } else if (portId == "reset") {
        const bool high = value >= 0.5f;
        if (high && !lastReset_) {
            step_ = 0;
            phase_ = 0.0f;
            advanceStep();      // re-arm gate/trig at step 0
            step_ = 0;          // advanceStep moved us on; pin back to 0
        }
        lastReset_ = high;
    } else if (portId == "clock") {
        const bool high = value >= 0.5f;
        externalClock_ = true;  // latch into external-clock mode
        if (high && !lastClock_) {
            // External clock only steps in Free mode, or in Gate mode while
            // the run input is high.
            if (run_ == Run::Free || (run_ == Run::Gate && runInHigh_))
                advanceStep();
        }
        lastClock_ = high;
    }
}

void Seq16::advanceStep() {
    step_ = (step_ + 1) % std::max(1, length_);
    stepTicks_ = std::max<std::int32_t>(
        1, static_cast<std::int32_t>(kCvTickRateHz / rateHz_));
    gateTicks_ = std::max<std::int32_t>(
        1, static_cast<std::int32_t>(stepTicks_ * gateFrac_));
    trigTicks_ = kTrigTicks;
}

void Seq16::tick() {
    // Count down active gate / trig pulses regardless of clock source.
    if (gateTicks_ > 0) --gateTicks_;
    if (trigTicks_ > 0) --trigTicks_;

    // Off mode: pure bypass, no internal stepping.
    if (run_ == Run::Off) return;
    // Gate mode without run enable: hold position.
    if (run_ == Run::Gate && !runInHigh_) return;
    // External clock drives stepping in writeCvPort(); skip the internal one.
    if (externalClock_) return;

    phase_ += rateHz_ * kSecondsPerTick;
    if (phase_ >= 1.0f) {
        phase_ -= std::floor(phase_);
        advanceStep();
    }
}

float Seq16::stepVolts() const {
    const std::size_t i = static_cast<std::size_t>(
        std::clamp(step_, 0, kSteps - 1));
    return noteToVolts(root_) + steps_[i] / 12.0f + voctIn_;
}

float Seq16::readCvPort(std::string_view portId) const {
    if (portId == "cv") {
        // Off mode: the sequencer is just a wire (V+ → CV).
        return (run_ == Run::Off) ? voctIn_ : stepVolts();
    }
    if (portId == "gate_out") {
        if (run_ == Run::Off) return runInHigh_ ? 1.0f : 0.0f;
        return gateTicks_ > 0 ? 1.0f : 0.0f;
    }
    if (portId == "trig") {
        if (run_ == Run::Off) return 0.0f;
        return trigTicks_ > 0 ? 1.0f : 0.0f;
    }
    return 0.0f;
}

void Seq16::registerFactory() {
    auto& reg = Registry::global();
    if (reg.has(kTypeId)) return;
    reg.register_(kTypeId, [](std::string_view instanceId) -> std::unique_ptr<Module> {
        return std::make_unique<Seq16>(instanceId);
    });
}

namespace {
const int kSeq16AutoRegister = [] { Seq16::registerFactory(); return 0; }();
}

}  // namespace mb::runtime
