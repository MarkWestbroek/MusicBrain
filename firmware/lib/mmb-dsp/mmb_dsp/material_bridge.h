#pragma once
#include <cmath>

namespace mmb_dsp {

class MaterialBridge {
public:
    enum Control { Pitch, Spread, Coupling, Decay, Memory, Recovery, Pickup, Level };

    void Init(float rate) {
        *this = MaterialBridge();
        rate_ = finiteClamp(rate, 8000.0f, 192000.0f, 44100.0f);
        prepare();
    }

    void setControl(int control, float value) {
        switch (control) {
            case Pitch: pitch_ = finiteClamp(value, -36, 36, 0); break;
            case Spread: spread_ = finiteClamp(value, 0, 1, 0.35f); break;
            case Coupling: coupling_ = finiteClamp(value, 0, 1, 0.5f); break;
            case Decay: decay_ = finiteClamp(value, 0.05f, 8, 2); break;
            case Memory: memory_ = finiteClamp(value, 0, 1, 0.7f); break;
            case Recovery: recovery_ = finiteClamp(value, 0.1f, 10, 2); break;
            case Pickup: pickup_ = finiteClamp(value, 0, 1, 0.25f); break;
            case Level: level_ = finiteClamp(value, 0, 1, 0.8f); break;
            default: return;
        }
        prepare();
    }

    void setVoct(float value) {
        value = finiteClamp(value, -5, 5, 0);
        if (value != voct_) { voct_ = value; prepare(); }
    }

    void clear() {
        for (int node = 0; node < 4; ++node) real_[node] = imag_[node] = 0;
        stress_ = 0;
        contact_ = 1;
        broken_ = false;
    }

    void Tick(float input, float gateA, float gateB, float velocity, float reset,
              float& left, float& right) {
        const bool highA = gateA >= 0.5f, highB = gateB >= 0.5f;
        const bool highReset = reset >= 0.5f;
        if (highReset && !resetHigh_) clear();
        velocity = finiteClamp(velocity, 0, 1, 0);
        if (!highReset) {
            if (highA && !gateAHigh_) real_[0] += 1.2f * velocity;
            if (highB && !gateBHigh_) real_[3] += 1.2f * velocity;
            real_[0] += 0.008f * finiteClamp(input, -1, 1, 0);
        }
        gateAHigh_ = highA;
        gateBHigh_ = highB;
        resetHigh_ = highReset;

        float energy = energyTotal();
        if (energy > 4) {
            const float scale = 2 / std::sqrt(energy);
            for (int node = 0; node < 4; ++node) { real_[node] *= scale; imag_[node] *= scale; }
            energy = 4;
        }
        const float target = energy < 1 ? energy : 1;
        stress_ += (target - stress_) * (target > stress_ ? attack_ : release_);
        if (stress_ > 0.60f) broken_ = true;
        else if (stress_ < 0.25f) broken_ = false;
        contact_ += ((broken_ ? 0.08f : 1.0f) - contact_) * slew_;
        const float damping = damping_ * (1 - memory_ * stress_ * 8 / rate_);
        for (int node = 0; node < 4; ++node) {
            const float next = cosine_[node] * real_[node] - sine_[node] * imag_[node];
            imag_[node] = damping * (sine_[node] * real_[node] + cosine_[node] * imag_[node]);
            real_[node] = damping * next;
        }
        exchange(0, 1, couplingStep_);
        exchange(1, 2, couplingStep_ * (1 - memory_ * (1 - contact_)));
        exchange(2, 3, couplingStep_);
        for (int node = 0; node < 4; ++node) {
            if (std::fabs(real_[node]) < 1e-18f) real_[node] = 0;
            if (std::fabs(imag_[node]) < 1e-18f) imag_[node] = 0;
        }
        left = level_ * 0.45f * ((1 - pickup_) * real_[0] + pickup_ * real_[1]);
        right = level_ * 0.45f * ((1 - pickup_) * real_[3] + pickup_ * real_[2]);
    }

    float energyTotal() const {
        float energy = 0;
        for (int node = 0; node < 4; ++node) energy += real_[node] * real_[node] + imag_[node] * imag_[node];
        return energy;
    }
    float stress() const { return stress_; }
    bool broken() const { return broken_; }

private:
    static float finiteClamp(float value, float low, float high, float fallback) {
        return !std::isfinite(value) ? fallback : value < low ? low : value > high ? high : value;
    }

    void prepare() {
        const float root = 261.625565f * std::exp2(voct_ + pitch_ / 12);
        const float ratios[4] = {1, 1.01f + 0.49f * spread_, 1.005f + spread_, 1.015f + 1.741f * spread_};
        for (int node = 0; node < 4; ++node) {
            const float frequency = finiteClamp(root * ratios[node], 10, rate_ * 0.20f, 261.625565f);
            const float angle = 6.28318530718f * frequency / rate_;
            cosine_[node] = std::cos(angle);
            sine_[node] = std::sin(angle);
        }
        damping_ = std::exp(-6.907755279f / (decay_ * rate_));
        attack_ = 1 - std::exp(-1 / (0.025f * rate_));
        release_ = 1 - std::exp(-1 / (recovery_ * rate_));
        slew_ = 1 - std::exp(-1 / (0.01f * rate_));
        couplingStep_ = coupling_ * 1800 / rate_;
    }

    void exchange(int first, int second, float amount) {
        const float denominator = 1 + amount * amount;
        const float cosine = (1 - amount * amount) / denominator;
        const float sine = 2 * amount / denominator;
        const float realFirst = real_[first], imagFirst = imag_[first];
        real_[first] = cosine * realFirst - sine * imag_[second];
        imag_[first] = cosine * imagFirst + sine * real_[second];
        const float realSecond = real_[second];
        real_[second] = cosine * realSecond - sine * imagFirst;
        imag_[second] = cosine * imag_[second] + sine * realFirst;
    }

    float rate_ = 44100, pitch_ = 0, spread_ = 0.35f, coupling_ = 0.5f;
    float decay_ = 2, memory_ = 0.7f, recovery_ = 2, pickup_ = 0.25f, level_ = 0.8f, voct_ = 0;
    float real_[4] = {}, imag_[4] = {}, cosine_[4] = {}, sine_[4] = {};
    float damping_ = 0, attack_ = 0, release_ = 0, slew_ = 0, couplingStep_ = 0;
    float stress_ = 0, contact_ = 1;
    bool broken_ = false, gateAHigh_ = false, gateBHigh_ = false, resetHigh_ = false;
};

}