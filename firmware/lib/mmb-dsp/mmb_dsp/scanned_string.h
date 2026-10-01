#pragma once
// Scanned synthesis (Verplank, Mathews, Shaw 2000): een gesloten ring van
// 64 massa's met veren naar de buren en een terugveer naar de ruststand
// beweegt traag (fysicastap op ~5,5 kHz, met "Speed" verder vertraagd). De
// vorm van de ring wordt op audiotempo uitgelezen als golftabel op de
// toonhoogte van V/Oct en Pitch. De golfvorm leeft dus: een aanslag zet hem
// in beweging, een druk vervormt hem tot een stilstaande vorm, loslaten laat
// hem terugveren. Dit is een eigen compacte uitvoering, geen reconstructie
// van de oorspronkelijke Max/MSP- of CSound-implementatie.
//
// Gedeeld door Teensy (ScannedModule.h) en browser (scanned_wasm.cc).
// Geen heap, geen samplebuffers; toestand is 64 posities en 64 snelheden.
#include <cmath>

namespace mmb_dsp {

class ScannedString {
public:
    static constexpr int kNodes = 64;
    enum Control { Pitch, Tension, Damping, Restore, Speed, Position, Width, Level };

    void Init(float rate) {
        *this = ScannedString();
        rate_ = finiteClamp(rate, 8000.0f, 192000.0f, 44100.0f);
        prepare();
    }

    void setControl(int control, float value) {
        switch (control) {
            case Pitch: pitch_ = finiteClamp(value, -36, 36, 0); break;
            case Tension: tension_ = finiteClamp(value, 0, 1, 0.6f); break;
            case Damping: damping_ = finiteClamp(value, 0, 1, 0.3f); break;
            case Restore: restore_ = finiteClamp(value, 0, 1, 0.3f); break;
            case Speed: speed_ = finiteClamp(value, 0.02f, 1, 0.15f); break;
            case Position: position_ = finiteClamp(value, 0, 1, 0.5f); return;
            case Width: width_ = finiteClamp(value, 0, 1, 0.3f); return;
            case Level: level_ = finiteClamp(value, 0, 1, 0.8f); return;
            default: return;
        }
        prepare();
    }

    void setVoct(float value) {
        value = finiteClamp(value, -5, 5, 0);
        if (value != voct_) { voct_ = value; prepare(); }
    }

    void setPositionCv(float value) { positionCv_ = finiteClamp(value, -1, 1, 0); }

    void clear() {
        for (int node = 0; node < kNodes; ++node) x_[node] = v_[node] = 0;
        inputAccumulator_ = 0;
        dcIn_ = dcOut_ = 0;
    }

    void Tick(float input, float gate, float velocity, float press, float reset, float& out) {
        const bool highGate = gate >= 0.5f, highReset = reset >= 0.5f;
        if (highReset && !resetHigh_) clear();
        velocity = finiteClamp(velocity, 0, 1, 0);
        press = finiteClamp(press, 0, 1, 0);
        input = finiteClamp(input, -1, 1, 0);
        if (highGate && !gateHigh_ && !highReset) strike(velocity);
        gateHigh_ = highGate;
        resetHigh_ = highReset;

        inputAccumulator_ += input;
        ++inputCount_;
        stepAccumulator_ += stepsPerSample_;
        if (stepAccumulator_ >= 1) {
            stepAccumulator_ -= 1;
            step(highReset ? 0 : press, inputAccumulator_ / inputCount_);
            inputAccumulator_ = 0;
            inputCount_ = 0;
        }

        // Uitlezen als golftabel met lineaire interpolatie.
        const int index = static_cast<int>(phase_);
        const float fraction = phase_ - index;
        const int next = index + 1 == kNodes ? 0 : index + 1;
        const float sample = x_[index] + (x_[next] - x_[index]) * fraction;
        phase_ += phaseIncrement_;
        if (phase_ >= kNodes) phase_ -= kNodes;
        // DC-blokker (~5 Hz): de vorm mag een gemiddelde hebben, de uitgang niet.
        const float blocked = sample - dcIn_ + dcCoefficient_ * dcOut_;
        dcIn_ = sample;
        dcOut_ = blocked;
        out = level_ * blocked;
    }

    /** RMS-uitwijking van de ring, 0..1: hoe sterk de golfvorm vervormd is. */
    float energy() const {
        float sum = 0;
        for (int node = 0; node < kNodes; ++node) sum += x_[node] * x_[node];
        const float rms = std::sqrt(sum / kNodes);
        return rms > 1 ? 1 : rms;
    }
    /** Mechanische energie van het massa-veersysteem (voor invariantentests). */
    float mechanicalEnergy() const {
        float energy = 0;
        for (int node = 0; node < kNodes; ++node) {
            const int next = node + 1 == kNodes ? 0 : node + 1;
            const float stretch = x_[next] - x_[node];
            energy += v_[node] * v_[node] + kappa_ * stretch * stretch + gamma_ * x_[node] * x_[node];
        }
        return energy;
    }
    float displacement(int node) const { return x_[node]; }

private:
    static float finiteClamp(float value, float low, float high, float fallback) {
        return !std::isfinite(value) ? fallback : value < low ? low : value > high ? high : value;
    }

    void prepare() {
        const float root = 261.625565f * std::exp2(voct_ + pitch_ / 12);
        const float frequency = finiteClamp(root, 10, rate_ * 0.1f, 261.625565f);
        phaseIncrement_ = frequency * kNodes / rate_;
        stepsPerSample_ = kStepRate / rate_;
        const float s2 = speed_ * speed_;
        kappa_ = tension_ * 0.25f * s2;                  // buurveer; < 0,25 houdt de ring stabiel
        gamma_ = (0.02f + 0.98f * restore_) * 0.02f * s2;  // terugveer naar rust
        decay_ = std::exp(-0.0036f * damping_ * speed_);
        pressGain_ = 0.008f * s2;                        // evenwicht ~0,8 bij Restore 0,5
        inputGain_ = 0.004f * s2;
        strikeGain_ = 0.09f * speed_;
        dcCoefficient_ = 1 - 6.28318530718f * 5 / rate_;
    }

    float bump(int node) const {
        const float centre = finiteClamp(position_ + positionCv_, 0, 1, position_) * kNodes;
        float distance = std::fabs(node - centre);
        if (distance > kNodes * 0.5f) distance = kNodes - distance;
        const float width = 1.5f + 10 * width_;
        const float ratio = distance / width;
        return std::exp(-ratio * ratio);
    }

    void strike(float velocity) {
        for (int node = 0; node < kNodes; ++node) v_[node] += strikeGain_ * velocity * bump(node);
    }

    void step(float press, float input) {
        const float force = press * pressGain_ + input * inputGain_;
        const bool shaped = force != 0;
        float acceleration[kNodes];
        for (int node = 0; node < kNodes; ++node) {
            const int previous = node == 0 ? kNodes - 1 : node - 1;
            const int next = node + 1 == kNodes ? 0 : node + 1;
            acceleration[node] = kappa_ * (x_[previous] - 2 * x_[node] + x_[next]) - gamma_ * x_[node]
                               + (shaped ? force * bump(node) : 0.0f);
        }
        for (int node = 0; node < kNodes; ++node) {
            v_[node] = (v_[node] + acceleration[node]) * decay_;
            x_[node] += v_[node];
            // Harde grens als "fret": begrenst de uitwijking en voegt geen energie toe.
            if (x_[node] > 1) { x_[node] = 1; if (v_[node] > 0) v_[node] = 0; }
            else if (x_[node] < -1) { x_[node] = -1; if (v_[node] < 0) v_[node] = 0; }
            if (std::fabs(x_[node]) < 1e-12f) x_[node] = 0;
            if (std::fabs(v_[node]) < 1e-12f) v_[node] = 0;
        }
    }

    static constexpr float kStepRate = 5512.5f;

    float rate_ = 44100, pitch_ = 0, tension_ = 0.6f, damping_ = 0.3f, restore_ = 0.3f, speed_ = 0.15f;
    float position_ = 0.5f, width_ = 0.3f, level_ = 0.8f, voct_ = 0, positionCv_ = 0;
    float x_[kNodes] = {}, v_[kNodes] = {};
    float phase_ = 0, phaseIncrement_ = 0, stepsPerSample_ = 0, stepAccumulator_ = 0;
    float kappa_ = 0, gamma_ = 0, decay_ = 1, pressGain_ = 0, inputGain_ = 0, strikeGain_ = 0;
    float inputAccumulator_ = 0;
    int inputCount_ = 0;
    float dcIn_ = 0, dcOut_ = 0, dcCoefficient_ = 0;
    bool gateHigh_ = false, resetHigh_ = false;
};

}
