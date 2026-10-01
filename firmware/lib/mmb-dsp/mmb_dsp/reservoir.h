#pragma once
// Resource-coupled synthesis: een eindige, langzaam herstellende bron waar
// tot vier stemmen tegelijk uit putten (lucht, snaarspanning, voeding).
// Iedere belasting (envelope, gate, 0..1) trekt de bron leeg; de bron vult
// exponentieel bij. De uitgang per stem is de eigen belasting maal het
// aanbod, zodat een harde noot tijdelijk minder overlaat voor de volgende en
// het herstel hoorbaar is. Controlrate (1 kHz), geen audio.
//
// Gedeeld door Teensy (ReservoirModule.h) en browser (reservoir_wasm.cc via
// cvhost.h, die de firmwareklasse zelf draait).
#include <cmath>

namespace mmb_dsp {

class Reservoir {
public:
    static constexpr int kVoices = 4;
    enum Control { Drain, Recover, Floor, Curve, Thresh };

    void Init(float tickRate) {
        *this = Reservoir();
        tickRate_ = finiteClamp(tickRate, 10, 100000, 1000);
        prepare();
    }

    void setControl(int control, float value) {
        switch (control) {
            case Drain: drain_ = finiteClamp(value, 0, 1, 0.5f); break;
            case Recover: recover_ = finiteClamp(value, 0.1f, 20, 2); break;
            case Floor: floor_ = finiteClamp(value, 0, 1, 0.1f); break;
            case Curve: curve_ = finiteClamp(value, 0.25f, 4, 1); break;
            case Thresh: thresh_ = finiteClamp(value, 0, 1, 0.15f); break;
            default: return;
        }
        prepare();
    }

    void setLoad(int voice, float value) {
        if (voice < 0 || voice >= kVoices) return;
        load_[voice] = finiteClamp(value, 0, 1, 0);
    }
    void setRefill(float value) { refill_ = finiteClamp(value, 0, 1, 0); }

    void clear() {
        level_ = 1;
        empty_ = false;
    }

    /** Eén tick op tickRate (1 kHz op de Teensy). */
    void tick(bool reset) {
        if (reset) { clear(); return; }
        float total = 0;
        for (int voice = 0; voice < kVoices; ++voice) total += load_[voice];
        // Verbruik: bij Drain 1 en één volle stem is de bron in 1 s leeg.
        level_ -= drain_ * total * dt_;
        // Herstel: exponentieel naar vol, plus directe bijvulling via CV.
        level_ += (1 - level_) * recoverCoefficient_ + refill_ * 2 * dt_;
        if (level_ < 0) level_ = 0;
        if (level_ > 1) level_ = 1;
        if (level_ < thresh_) empty_ = true;
        else if (level_ > thresh_ + 0.1f) empty_ = false;
        supply_ = floor_ + (1 - floor_) * std::pow(level_, curve_);
    }

    float level() const { return level_; }
    float starve() const { return 1 - level_; }
    float supply() const { return supply_; }
    bool empty() const { return empty_; }
    float output(int voice) const {
        return voice < 0 || voice >= kVoices ? 0.0f : load_[voice] * supply_;
    }

private:
    static float finiteClamp(float value, float low, float high, float fallback) {
        return !std::isfinite(value) ? fallback : value < low ? low : value > high ? high : value;
    }
    void prepare() {
        dt_ = 1 / tickRate_;
        recoverCoefficient_ = 1 - std::exp(-dt_ / recover_);
        supply_ = floor_ + (1 - floor_) * std::pow(level_, curve_);
    }

    float tickRate_ = 1000, dt_ = 0.001f;
    float drain_ = 0.5f, recover_ = 2, floor_ = 0.1f, curve_ = 1, thresh_ = 0.15f;
    float recoverCoefficient_ = 0;
    float load_[kVoices] = {}, refill_ = 0;
    float level_ = 1, supply_ = 1;
    bool empty_ = false;
};

}
