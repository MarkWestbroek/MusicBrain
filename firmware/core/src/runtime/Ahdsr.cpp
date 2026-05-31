// ADR 0009 — Ahdsr implementation. See header for design notes.
#include "mb/runtime/Ahdsr.h"

#include <algorithm>
#include <cmath>

namespace mb::runtime {

Ahdsr::Ahdsr(std::string_view id) : Envelope(kTypeId, id) {}

void Ahdsr::setControl(std::string_view controlId, ControlValue value) {
    // The TS layer-2 model sends times in milliseconds (float) and the
    // sustain level / loop as a float / bool. Anything else is ignored —
    // unknown controls are a no-op on purpose so a host can replay an
    // older patch against newer firmware.
    auto asFloat = [&](float fallback) -> float {
        if (auto* f = std::get_if<float>(&value))   return *f;
        if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
        return fallback;
    };
    auto asBool = [&](bool fallback) -> bool {
        if (auto* b = std::get_if<bool>(&value)) return *b;
        return fallback;
    };

    if      (controlId == "attack")  attackTicks_  = msToTicks(asFloat(10.0f));
    else if (controlId == "hold")    holdTicks_    = msToTicks(asFloat(0.0f));
    else if (controlId == "decay")   decayTicks_   = msToTicks(asFloat(200.0f));
    else if (controlId == "sustain") sustainLevel_ = std::clamp(asFloat(0.7f), 0.0f, 1.0f);
    else if (controlId == "release") releaseTicks_ = msToTicks(asFloat(300.0f));
    else if (controlId == "loop")    loop_         = asBool(false);
    else if (controlId == "retrig" || controlId == "reset")
        retrig_ = asBool(false);
    else if (controlId == "curve") {
        // Accept either an int (panel switch index) or float (legacy patches).
        std::int32_t idx = 0;
        if (auto* i = std::get_if<std::int32_t>(&value)) idx = *i;
        else if (auto* f = std::get_if<float>(&value))   idx = static_cast<std::int32_t>(*f);
        curve_ = static_cast<Curve>(std::clamp<std::int32_t>(idx, 0, 2));
    }
}

void Ahdsr::setGate(bool open) {
    if (open) {
        // Rising edge. From Zero we start a clean Attack; from Decay /
        // Sustain / Release we retrigger Attack but jump the phase clock
        // forward so the slope continues from the *current* value
        // (avoids audible clicks). Mirrors the prototype's `GateOpen()`.
        if (retrig_) {
            // Retrigger mode overrides the click-suppression: every rising
            // edge restarts the attack from 0 so the sweep is identical on
            // every note (consistent filter-wah). CvGraph only writes the
            // gate on a real transition, so this *is* the rising edge.
            phase_ = Phase::Attack;
            phaseTicks_ = 0;
            value_ = 0.0f;
        } else if (phase_ == Phase::Zero) {
            phase_ = Phase::Attack;
            phaseTicks_ = 0;
        } else if (phase_ == Phase::Decay || phase_ == Phase::Sustain
                || phase_ == Phase::Release) {
            phase_ = Phase::Attack;
            // y = value_; t = y * Ta  →  start at that virtual t.
            phaseTicks_ = (attackTicks_ == 0)
                ? 0
                : static_cast<std::uint32_t>(value_ * attackTicks_);
        }
        // Hold / Attack while already open: no-op (sticky gate).
    } else {
        // Falling edge → release from current level.
        if (phase_ == Phase::Attack || phase_ == Phase::Hold
         || phase_ == Phase::Decay  || phase_ == Phase::Sustain) {
            releaseFromLevel_ = value_;
            phase_ = Phase::Release;
            phaseTicks_ = 0;
        }
    }
}

void Ahdsr::tick() {
    if (phase_ == Phase::Zero || phase_ == Phase::Sustain) {
        // Idle: still compute value (so a sustain-level change is picked
        // up immediately) but no timing transitions to evaluate.
        value_ = computeValue();
        return;
    }
    ++phaseTicks_;
    value_ = computeValue();

    switch (phase_) {
        case Phase::Attack:
            if (phaseTicks_ >= attackTicks_ || value_ >= 1.0f) {
                value_ = 1.0f;
                advancePhase();
            }
            break;
        case Phase::Hold:
            if (phaseTicks_ >= holdTicks_) advancePhase();
            break;
        case Phase::Decay:
            if (value_ <= sustainLevel_) {
                value_ = sustainLevel_;
                advancePhase();
            }
            break;
        case Phase::Release:
            if (value_ <= 0.0f) {
                value_ = 0.0f;
                advancePhase();
            }
            break;
        default: break;
    }
}

float Ahdsr::computeValue() const {
    switch (phase_) {
        case Phase::Zero:    return 0.0f;
        case Phase::Attack: {
            const float p = attackTicks_ == 0 ? 1.0f
                              : static_cast<float>(phaseTicks_) / attackTicks_;
            return shape(p);
        }
        case Phase::Hold:    return 1.0f;
        case Phase::Decay: {
            const float p = decayTicks_ == 0 ? 1.0f
                              : static_cast<float>(phaseTicks_) / decayTicks_;
            return 1.0f - (1.0f - sustainLevel_) * shape(p);
        }
        case Phase::Sustain: return sustainLevel_;
        case Phase::Release: {
            const float p = releaseTicks_ == 0 ? 1.0f
                              : static_cast<float>(phaseTicks_) / releaseTicks_;
            return releaseFromLevel_ * (1.0f - shape(p));
        }
    }
    return 0.0f;
}

float Ahdsr::shape(float p) const {
    // Clamp first — thresholds in tick() may push p slightly past 1.0 on
    // the last tick of a phase due to the integer counter.
    p = std::clamp(p, 0.0f, 1.0f);
    switch (curve_) {
        case Curve::Linear:      return p;
        // Exp: slow start, fast finish (matches Tone's exponential ramp
        // perception for the *attack* segment). Exponent 2 is a good
        // compromise between "barely audible curve" and "too steep".
        case Curve::Exponential: return p * p;
        // Log: fast start, slow finish (the inverse). 1 - (1-p)^2.
        case Curve::Logarithmic: { const float q = 1.0f - p; return 1.0f - q * q; }
    }
    return p;
}

void Ahdsr::advancePhase() {
    switch (phase_) {
        case Phase::Zero:    phase_ = Phase::Attack;  break;
        case Phase::Attack:  phase_ = (holdTicks_ > 0) ? Phase::Hold : Phase::Decay; break;
        case Phase::Hold:    phase_ = Phase::Decay;   break;
        case Phase::Decay:   phase_ = Phase::Sustain; break;
        case Phase::Sustain: releaseFromLevel_ = value_; phase_ = Phase::Release; break;
        case Phase::Release: phase_ = loop_ ? Phase::Attack : Phase::Zero; break;
    }
    phaseTicks_ = 0;
}

void Ahdsr::registerFactory() {
    auto& reg = Registry::global();
    if (reg.has(kTypeId)) return;
    reg.register_(kTypeId, [](std::string_view instanceId) -> std::unique_ptr<Module> {
        return std::make_unique<Ahdsr>(instanceId);
    });
}

// Static initialiser — ensures the factory is registered before main().
namespace {
const int kAhdsrAutoRegister = [] { Ahdsr::registerFactory(); return 0; }();
}

}  // namespace mb::runtime
