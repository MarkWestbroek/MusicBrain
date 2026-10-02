#pragma once
// Acid: een complete basstem naar de TB-303. Eén oscillator (zaag of blok),
// een vierpolig ladderfilter met een scheve onderste pool en een
// hoogdoorlaat in de resonantielus (de resonantie zakt weg in het laag en
// het filter gaat net niet zelf zingen), een filter-envelope met alleen
// Decay, en de twee dingen die het apparaat zijn karakter geven:
//
//   Accent - een noot met accent is luider, zijn filter-envelope is kort en
//            opent verder, en een tweede, tragere schakeling telt de
//            opeenvolgende accenten bij elkaar op: bij een rij accenten
//            klimt het filter per noot hoger (het "wow").
//   Slide  - de toonhoogte glijdt in ~60 ms naar de volgende noot en de
//            envelopes slaan niet opnieuw aan (gebonden noot).
//
// Accent en Slide zijn gate-ingangen die bij het begin van de noot gelezen
// worden: hang er een tweede sequencer-rij, Euclid, Turing of Branches aan.
// Eigen model naar de schema-topologie, op het oor; geen component-voor-
// component simulatie. Filter twee keer overbemonsterd, oscillator met
// polyBLEP. Header-only; gedeeld door Teensy en browser.
#include "oversample.h"

namespace mmb_dsp {

class Acid {
public:
    enum Control { Wave, Tune, Cutoff, Resonance, EnvMod, Decay, Accent, Level, kControls };
    // Gate als laatste: de gastheer zet de CV's in deze volgorde, en de
    // aanslag leest Accent en Slide van hetzelfde moment.
    enum CvIn { Voct, AccentIn, SlideIn, CutoffCv, Gate, kCvIns };
    enum CvOut { Env, kCvOuts };
    static constexpr float kDefaults[kControls] = {0.0f, 0.0f, 0.35f, 0.7f, 0.6f, 0.4f, 0.6f, 0.8f};

    void Init(float sampleRate) {
        *this = Acid();
        sampleRate_ = finiteClamp(sampleRate, 8000, 192000, 44100);
        slide_ = 1 - std::exp(-1 / (0.06f * sampleRate_));
        attack_ = 1 - std::exp(-1 / (0.003f * sampleRate_));
        release_ = 1 - std::exp(-1 / (0.012f * sampleRate_));
        sustain_ = std::exp(-1 / (4.0f * sampleRate_));
        feedbackHp_ = 1 - std::exp(-2 * 3.14159265f * 150 / (2 * sampleRate_));
        pitch_ = 0;
        prepare();
    }

    void setControl(int control, float value) {
        switch (control) {
            case Wave: wave_ = static_cast<int>(finiteClamp(value, 0, 1, 0) + 0.5f); break;
            case Tune: tune_ = finiteClamp(value, -24, 24, 0); break;
            case Cutoff: cutoff_ = finiteClamp(value, 0, 1, 0.35f); break;
            case Resonance: resonance_ = finiteClamp(value, 0, 1, 0.7f); break;
            case EnvMod: envMod_ = finiteClamp(value, 0, 1, 0.6f); break;
            case Decay: decay_ = finiteClamp(value, 0.1f, 3, 0.4f); break;
            case Accent: accent_ = finiteClamp(value, 0, 1, 0.6f); break;
            case Level: level_ = finiteClamp(value, 0, 1, 0.8f); break;
            default: return;
        }
        prepare();
    }

    void setCv(int input, float value) {
        switch (input) {
            case Voct: voct_ = finiteClamp(value, -5, 5, 0); break;
            case AccentIn: accentHigh_ = value >= 0.5f; break;
            case CutoffCv: cutoffCv_ = finiteClamp(value, -1, 1, 0); break;
            case SlideIn: {
                const bool high = value >= 0.5f;
                if (!high && tied_) { tied_ = false; open_ = gateHigh_; }   // boog losgelaten
                slideHigh_ = high;
                break;
            }
            case Gate: {
                const bool high = value >= 0.5f;
                if (high && !gateHigh_) {
                    if (!tied_) trigger();        // gebonden noot: geen nieuwe aanslag
                    tied_ = false;
                    open_ = true;
                } else if (!high && gateHigh_) {
                    if (slideHigh_) tied_ = true; // de boog houdt de noot vast tot de volgende
                    else open_ = false;
                }
                gateHigh_ = high;
                break;
            }
            default: break;
        }
    }
    float cvOut(int output) const { return output == Env ? filterEnv_ : 0; }

    void Process(const float* const*, float* const* out, int frames) {
        for (int frame = 0; frame < frames; ++frame) {
            if ((counter_++ & 7) == 0) controlRate();
            // Oscillator.
            phase_ += increment_;
            if (phase_ >= 1) phase_ -= 1;
            float osc;
            if (wave_ == 0) osc = 2 * phase_ - 1 - blep(phase_, increment_);
            else {
                float shifted = phase_ + 0.5f;
                if (shifted >= 1) shifted -= 1;
                osc = (phase_ < 0.5f ? 1.0f : -1.0f) + blep(phase_, increment_) - blep(shifted, increment_);
                osc *= 0.8f;
            }
            // Envelopes.
            filterEnv_ *= accented_ ? accentDecay_ : decayCoefficient_;
            if (open_) { amp_ += attack_ * (ampTarget_ - amp_); ampTarget_ *= sustain_; }
            else amp_ -= release_ * amp_;
            const float sweepTarget = accented_ ? filterEnv_ : 0;
            accentSweep_ += (sweepTarget > accentSweep_ ? sweepAttack_ : sweepRelease_) * (sweepTarget - accentSweep_);
            // Ladder, twee deelstappen per sample.
            // Zacht de ladder in: de tanh in de lus moet de resonantie
            // begrenzen, niet de oscillator platdrukken.
            const float input = osc * 0.3f * (1 + 0.35f * feedback_);
            float y = 0;
            for (int step = 0; step < 2; ++step) {
                hp_ += feedbackHp_ * (stage_[3] - hp_);
                const float u = std::tanh(input - feedback_ * (stage_[3] - hp_));
                float v = (u - state_[0]) * gFirst_;
                stage_[0] = v + state_[0]; state_[0] = stage_[0] + v;
                for (int pole = 1; pole < 4; ++pole) {
                    v = (stage_[pole - 1] - state_[pole]) * g_;
                    stage_[pole] = v + state_[pole]; state_[pole] = stage_[pole] + v;
                }
                y += stage_[3];
            }
            const float loud = amp_ * (1 + (accented_ ? accent_ * 0.9f : 0));
            const float sample = std::tanh(y * loud * 2.4f) * level_;
            out[0][frame] = sample;
        }
    }

private:
    static float blep(float t, float dt) {
        if (dt <= 0) return 0;
        if (t < dt) { t /= dt; return t + t - t * t - 1; }
        if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
        return 0;
    }
    void trigger() {
        accented_ = accentHigh_;
        filterEnv_ = 1;
        ampTarget_ = 1;
    }
    void prepare() {
        decayCoefficient_ = std::exp(-1 / (decay_ * sampleRate_));
        accentDecay_ = std::exp(-1 / (0.2f * sampleRate_));
        // De accentschakeling laadt trager op naarmate de resonantie hoger staat.
        sweepAttack_ = 1 - std::exp(-1 / ((0.015f + 0.035f * resonance_) * sampleRate_));
        sweepRelease_ = 1 - std::exp(-1 / (0.18f * sampleRate_));
        feedback_ = resonance_ * 4.6f;
    }
    void controlRate() {
        // Toonhoogte: met Slide glijdend, anders direct.
        const float target = voct_ + tune_ * (1 / 12.0f);
        if (slideHigh_) pitch_ += (target - pitch_) * (1 - std::pow(1 - slide_, 8.0f));
        else pitch_ = target;
        const float hz = finiteClamp(261.6256f * std::exp2(pitch_), 5, 0.3f * sampleRate_, 261.6256f);
        increment_ = hz / sampleRate_;
        // Cutoff: knop 60 Hz .. 5 kHz, envelope en accent erbovenop.
        const float octaves = cutoff_ * 6.4f + envMod_ * 4.5f * filterEnv_
                            + (accented_ ? accent_ * 1.2f * filterEnv_ : 0) + accent_ * 1.5f * accentSweep_
                            + cutoffCv_ * 4;
        const float fc = finiteClamp(60.0f * std::exp2(octaves), 30, 14000, 1000);
        const float rate = 2 * sampleRate_;
        const float g = std::tan(3.14159265f * fc / rate);
        const float gFirst = std::tan(3.14159265f * (fc * 2 > 0.45f * rate ? 0.45f * rate : fc * 2) / rate);
        g_ = g / (1 + g);
        gFirst_ = gFirst / (1 + gFirst);
    }

    float sampleRate_ = 44100;
    float tune_ = 0, cutoff_ = 0.35f, resonance_ = 0.7f, envMod_ = 0.6f, decay_ = 0.4f, accent_ = 0.6f, level_ = 0.8f;
    float voct_ = 0, cutoffCv_ = 0, pitch_ = 0;
    float slide_ = 0, attack_ = 0, release_ = 0, sustain_ = 1, feedbackHp_ = 0;
    float decayCoefficient_ = 0, accentDecay_ = 0, sweepAttack_ = 0, sweepRelease_ = 0, feedback_ = 0;
    float phase_ = 0, increment_ = 0, filterEnv_ = 0, amp_ = 0, ampTarget_ = 1, accentSweep_ = 0;
    float g_ = 0.1f, gFirst_ = 0.2f, hp_ = 0;
    float state_[4] = {}, stage_[4] = {};
    unsigned counter_ = 0;
    int wave_ = 0;
    bool gateHigh_ = false, accentHigh_ = false, slideHigh_ = false, accented_ = false, tied_ = false, open_ = false;
};

}  // namespace mmb_dsp
