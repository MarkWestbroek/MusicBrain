#pragma once
// Dynamische stochastische synthese (GENDYN, Xenakis 1991): geen golfvorm en
// geen fysisch model. Een cyclus bestaat uit M breekpunten; na iedere cyclus
// zet ieder breekpunt een random stap in amplitude en in duur, binnen
// spiegelende grenzen. De golfvorm wandelt dus voortdurend, met een
// herkenbaar ruw karakter. Deze uitvoering is gestemd: de nominale periode
// volgt V/Oct, de duurstappen wandelen symmetrisch rond die periode.
//
// Eigen compacte uitvoering met xorshift-ruis, lineaire of cosinus-
// interpolatie en een optionele terugtrek naar nul (Settle). Geen
// reconstructie van Xenakis' programma of van SuperColliders Gendy.
// Gedeeld door Teensy (GendynModule.h) en browser (gendyn_wasm.cc).
#include <cmath>
#include <cstdint>

namespace mmb_dsp {

class Gendyn {
public:
    static constexpr int kMaxPoints = 24;
    enum Control { Pitch, Points, AmpStep, DurStep, Dist, Smooth, Settle, Seed, Level };

    void Init(float rate) {
        *this = Gendyn();
        rate_ = finiteClamp(rate, 8000.0f, 192000.0f, 44100.0f);
        prepare();
        reseed();
    }

    void setControl(int control, float value) {
        switch (control) {
            case Pitch: pitch_ = finiteClamp(value, -36, 36, 0); break;
            case Points: points_ = static_cast<int>(finiteClamp(value, 3, kMaxPoints, 12) + 0.5f); break;
            case AmpStep: ampStep_ = finiteClamp(value, 0, 1, 0.3f); return;
            case DurStep: durStep_ = finiteClamp(value, 0, 1, 0.3f); return;
            case Dist: dist_ = finiteClamp(value, 0, 1, 0.3f); return;
            case Smooth: smooth_ = finiteClamp(value, 0, 1, 0.5f); return;
            case Settle: settle_ = finiteClamp(value, 0, 1, 0.1f); return;
            case Seed: seed_ = static_cast<int>(finiteClamp(value, 0, 99, 1) + 0.5f); return;
            case Level: level_ = finiteClamp(value, 0, 1, 0.8f); return;
            default: return;
        }
        prepare();
    }

    void setVoct(float value) {
        value = finiteClamp(value, -5, 5, 0);
        if (value != voct_) { voct_ = value; prepare(); }
    }
    void setChaosCv(float value) { chaosCv_ = finiteClamp(value, -1, 1, 0); }

    /** Terug naar de beginvorm (zachte sinus) en de ruis opnieuw gezaaid. */
    void reseed() {
        state_ = 0x9E3779B9u ^ (static_cast<uint32_t>(seed_) * 0x85EBCA6Bu + 1u);
        for (int point = 0; point < kMaxPoints; ++point) {
            amplitude_[point] = 0.6f * std::sin(6.28318530718f * point / points_);
            duration_[point] = 1;
        }
        segment_ = 0;
        position_ = 0;
        dcIn_ = dcOut_ = 0;
    }

    void Tick(float gate, float reset, float& out, float& cycle) {
        const bool highGate = gate >= 0.5f, highReset = reset >= 0.5f;
        if ((highGate && !gateHigh_) || (highReset && !resetHigh_)) reseed();
        gateHigh_ = highGate;
        resetHigh_ = highReset;

        const int next = segment_ + 1 >= points_ ? 0 : segment_ + 1;
        const float from = amplitude_[segment_], to = amplitude_[next];
        float fraction = position_;
        if (smooth_ > 0) {
            const float eased = 0.5f - 0.5f * std::cos(3.14159265359f * fraction);
            fraction += smooth_ * (eased - fraction);
        }
        const float sample = from + (to - from) * fraction;
        cycle = segment_ == 0 ? 1.0f : 0.0f;

        position_ += segmentIncrement_ / duration_[segment_];
        while (position_ >= 1) {
            position_ -= 1;
            walk(segment_);
            segment_ = segment_ + 1 >= points_ ? 0 : segment_ + 1;
            // Een korter segment kan in één sample worden overgeslagen; de
            // lus houdt de positie consistent zonder segmenten te missen.
            if (position_ >= 1) position_ = 0.999f;
        }

        const float blocked = sample - dcIn_ + dcCoefficient_ * dcOut_;
        dcIn_ = sample;
        dcOut_ = blocked;
        out = level_ * (blocked > 1 ? 1 : blocked < -1 ? -1 : blocked);
    }

    float amplitude(int point) const { return point < 0 || point >= kMaxPoints ? 0 : amplitude_[point]; }
    float duration(int point) const { return point < 0 || point >= kMaxPoints ? 0 : duration_[point]; }
    int points() const { return points_; }

private:
    static float finiteClamp(float value, float low, float high, float fallback) {
        return !std::isfinite(value) ? fallback : value < low ? low : value > high ? high : value;
    }

    void prepare() {
        const float root = 261.625565f * std::exp2(voct_ + pitch_ / 12);
        const float frequency = finiteClamp(root, 5, rate_ * 0.2f, 261.625565f);
        segmentIncrement_ = frequency * points_ / rate_;
        dcCoefficient_ = 1 - 6.28318530718f * 5 / rate_;
    }

    /** Uniforme ruis in -1..1 uit xorshift32. */
    float noise() {
        state_ ^= state_ << 13;
        state_ ^= state_ >> 17;
        state_ ^= state_ << 5;
        return static_cast<float>(state_ >> 8) * (2.0f / 16777216.0f) - 1;
    }
    /** Dist mengt uniform (0) met een zwaarstaartige verdeling (1): veel
     *  kleine stappen en af en toe een grote. */
    float step() {
        const float uniform = noise();
        const float heavy = uniform * uniform * uniform;
        return uniform + dist_ * (heavy - uniform);
    }
    static float reflect(float value, float low, float high) {
        while (value > high || value < low) {
            if (value > high) value = 2 * high - value;
            if (value < low) value = 2 * low - value;
        }
        return value;
    }

    void walk(int point) {
        const float ampStep = finiteClamp(ampStep_ + chaosCv_, 0, 1, ampStep_) * 0.5f;
        float amplitude = amplitude_[point] * (1 - settle_ * 0.2f) + ampStep * step();
        amplitude_[point] = reflect(amplitude, -1, 1);
        const float range = durStep_ * 0.5f;
        const float duration = duration_[point] + range * 0.5f * step();
        duration_[point] = range > 0 ? reflect(duration, 1 - range, 1 + range) : 1.0f;
    }

    float rate_ = 44100, pitch_ = 0, ampStep_ = 0.3f, durStep_ = 0.3f, dist_ = 0.3f;
    float smooth_ = 0.5f, settle_ = 0.1f, level_ = 0.8f, voct_ = 0, chaosCv_ = 0;
    int points_ = 12, seed_ = 1;
    float amplitude_[kMaxPoints] = {}, duration_[kMaxPoints] = {};
    float segmentIncrement_ = 0, position_ = 0;
    int segment_ = 0;
    uint32_t state_ = 1;
    float dcIn_ = 0, dcOut_ = 0, dcCoefficient_ = 0;
    bool gateHigh_ = false, resetHigh_ = false;
};

}
