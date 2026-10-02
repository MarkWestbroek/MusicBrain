#pragma once
// Elektrische piano: een tine of een reed voor een pickup.
//
// De klank van een elektrische piano zit maar voor de helft in wat er
// trilt; de andere helft is hoe de pickup dat "ziet". Dit model doet beide
// apart:
//
// Wat trilt: per toets een grondtoon die traag uitsterft en een hoge,
// niet-harmonische boventoon die snel wegsterft (de tweede trilvorm van een
// ingeklemde staaf, 6,27 keer de grondtoon): de "bel" in de aanslag. Harder
// aanslaan geeft meer uitwijking en verhoudingsgewijs meer bel.
//
// Wat de pickup ziet:
//   Type 0, Tine (Rhodes-familie): een magneet met spoel. De spanning is de
//     snelheid van de tine maal de helling van het magneetveld op die plek.
//     Staat de tine recht voor de pickup (Timbre 0), dan passeert hij het
//     midden twee keer per trilling en klinkt vooral het octaaf: dun en
//     glazig. Schuif je hem ernaast (Timbre omhoog), dan komt de grondtoon
//     terug: vol en rond. Dat is de stelschroef waarmee een technicus het
//     instrument "voiced". Grote uitwijking drijft het veld in zijn kromming:
//     de blaf bij hard spelen.
//   Type 1, Reed (Wurlitzer-familie): een stalen tong voor een
//     condensatorplaat. De gevoeligheid stijgt scherp als de tong de plaat
//     nadert: holler, nasaler, en de noot sterft sneller uit.
//
// Twaalf stem-cellen (V/Oct, velocity, gate), stereo uit met het
// heen-en-weer-tremolo van het koffermodel. Geen samples, geen
// overbemonstering (de pickup maakt weinig hoge boventonen).
// Header-only; gedeeld door Teensy en browser.
#include "oversample.h"

namespace mmb_dsp {

class EPiano {
public:
    static constexpr int kVoices = 12;
    enum Control { Type, Timbre, Bell, Decay, Drive, Tremolo, TremRate, Level, Damper, kControls };
    // CV's: 0..11 V/Oct, 12..23 velocity, 24 sustainpedaal, 25..36 gate (de
    // gate als laatste: de aanslag leest toonhoogte en velocity van hetzelfde
    // moment).
    static constexpr int kVelBase = kVoices, kSustain = 2 * kVoices, kGateBase = 2 * kVoices + 1, kCvIns = 3 * kVoices + 1;
    static constexpr int kCvOuts = 0;
    static constexpr float kDefaults[kControls] = {0.0f, 0.35f, 0.5f, 0.5f, 0.4f, 0.3f, 4.5f, 0.8f, 0.6f};

    void Init(float sampleRate) {
        *this = EPiano();
        sampleRate_ = finiteClamp(sampleRate, 8000, 192000, 44100);
        setControl(Damper, kDefaults[Damper]);
        strike_ = 1 - std::exp(-1 / (0.0015f * sampleRate_));
    }

    void setControl(int control, float value) {
        switch (control) {
            case Type: type_ = static_cast<int>(finiteClamp(value, 0, 1, 0) + 0.5f); break;
            case Timbre: timbre_ = finiteClamp(value, 0, 1, 0.35f); break;
            case Bell: bell_ = finiteClamp(value, 0, 1, 0.5f); break;
            case Decay: decay_ = finiteClamp(value, 0, 1, 0.5f); break;
            case Drive: drive_ = finiteClamp(value, 0, 1, 0.4f); break;
            case Tremolo: tremolo_ = finiteClamp(value, 0, 1, 0.3f); break;
            case TremRate: tremRate_ = finiteClamp(value, 0.5f, 12, 4.5f); break;
            case Level: level_ = finiteClamp(value, 0, 1, 0.8f); break;
            case Damper: {
                // Hoe snel de demper een losgelaten toets stilt: 0 = geen
                // dempers (alles klinkt vrij uit, zoals met het pedaal vast),
                // 0,5 ~ 95 ms, 1 = 15 ms.
                const float damper = finiteClamp(value, 0, 1, 0.6f);
                damper_ = damper < 0.02f ? 1.0f : std::exp(-1 / (0.015f * std::pow(40.0f, 1 - damper) * sampleRate_));
                break;
            }
            default: break;
        }
    }

    void setCv(int input, float value) {
        if (input >= 0 && input < kVoices) voct_[input] = finiteClamp(value, -5, 5, 0);
        else if (input >= kVelBase && input < kVelBase + kVoices) velocity_[input - kVelBase] = finiteClamp(value, 0, 1, 0);
        else if (input == kSustain) sustain_ = value >= 0.5f;
        else if (input >= kGateBase && input < kGateBase + kVoices) {
            Voice& voice = voices_[input - kGateBase];
            const bool high = value >= 0.5f;
            if (high && !voice.gate) strike(input - kGateBase);
            voice.gate = high;
        }
    }
    float cvOut(int) const { return 0; }

    void Process(const float* const*, float* const* out, int frames) {
        // Tine: plek naast de pickup (0 = er recht voor) en aansturing.
        const float offset = timbre_ * 1.5f;
        const float reach = 0.25f + drive_ * 1.5f;
        // Bij kleine uitwijking is de gevoeligheid de helling van het veld; daarop normeren.
        const float fieldSlope = offset / ((1 + offset * offset) * std::sqrt(1 + offset * offset));
        const float tineGain = 0.55f / (fieldSlope * reach + 0.2f);
        const float reedReach = 0.25f + drive_ * 0.6f;
        for (int frame = 0; frame < frames; ++frame) {
            float sum = 0;
            for (Voice& voice : voices_) {
                if (!voice.active) continue;
                voice.phase += voice.increment;
                if (voice.phase >= 1) voice.phase -= 1;
                voice.bellPhase += voice.increment * kBellRatio;
                voice.bellPhase -= std::floor(voice.bellPhase);
                voice.attack += strike_ * (1 - voice.attack);
                const float a = voice.amplitude * voice.attack, b = voice.bell * voice.attack;
                const float angle = 6.2831853f * voice.phase, bellAngle = 6.2831853f * voice.bellPhase;
                const float position = a * std::sin(angle) + b * std::sin(bellAngle);
                // Snelheid in eenheden van de grondtoon; de bel telt zwaarder (hij trilt sneller).
                const float speed = a * std::cos(angle) + 3 * b * std::cos(bellAngle);
                if (type_ == 0) {
                    const float u = position * reach + offset;
                    const float q = 1 + u * u;
                    sum += speed * u / (q * std::sqrt(q)) * tineGain;
                } else {
                    float c = position * reedReach;
                    c = c > 0.85f ? 0.85f : c < -0.85f ? -0.85f : c;
                    const float gap = 1 - c;
                    sum += speed / (gap * gap) * 0.5f;
                }
                // Toets vast of sustainpedaal: vrij uitklinken. Anders ligt de
                // demper erop (nooit langzamer dan het vrije uitklinken).
                const bool free = voice.gate || sustain_;
                voice.amplitude *= free ? voice.decay : (damper_ < voice.decay ? damper_ : voice.decay);
                voice.bell *= free ? voice.bellDecay : (damper_ < voice.bellDecay ? damper_ : voice.bellDecay);
                if (voice.amplitude < 1e-5f && voice.bell < 1e-5f) voice.active = false;
            }
            tremPhase_ += tremRate_ / sampleRate_;
            if (tremPhase_ >= 1) tremPhase_ -= 1;
            const float sway = 0.5f * std::sin(6.2831853f * tremPhase_);
            const float y = std::tanh(sum * 1.3f) * level_;
            out[0][frame] = y * (1 - tremolo_ * (0.5f + sway));
            out[1][frame] = y * (1 - tremolo_ * (0.5f - sway));
        }
    }

private:
    static constexpr float kBellRatio = 6.267f;      // tweede trilvorm van een ingeklemde staaf
    struct Voice {
        float phase = 0, bellPhase = 0, increment = 0;
        float amplitude = 0, bell = 0, decay = 1, bellDecay = 1, attack = 0;
        bool gate = false, active = false;
    };

    void strike(int index) {
        Voice& voice = voices_[index];
        const float hz = finiteClamp(261.6256f * std::exp2(voct_[index]), 20, 0.12f * sampleRate_, 261.6256f);
        // Zonder velocity-kabel (0) een gemiddelde aanslag.
        const float velocity = velocity_[index] <= 0 ? 0.7f : velocity_[index];
        const float scale = std::sqrt(261.6256f / hz);                // hoge noten sterven sneller uit
        const float sustain = (type_ == 0 ? 1.0f + decay_ * 5.0f : 0.5f + decay_ * 2.2f) * scale;
        voice.increment = hz / sampleRate_;
        voice.phase = 0; voice.bellPhase = 0; voice.attack = 0;
        voice.amplitude = std::pow(velocity, 1.3f);
        // De bel is een korte tik in de aanslag, geen tweede toon: de knop werkt
        // kwadratisch (de onderste helft is subtiel) en helemaal open ligt hij
        // ~10 dB onder de grondtoon. Boven ~15 kHz valt hij weg, anders vouwt
        // hij bij hoge noten terug in het hoorbare gebied.
        const float bellHz = hz * kBellRatio;
        const float bellFade = finiteClamp((15000.0f - bellHz) / 5000.0f, 0, 1, 0);
        voice.bell = bell_ * bell_ * std::pow(velocity, 2.8f) * (type_ == 0 ? 0.26f : 0.12f) * bellFade;
        voice.decay = std::exp(-1 / (sustain * sampleRate_));
        voice.bellDecay = std::exp(-1 / (0.08f * scale * scale * sampleRate_));
        voice.active = true;
    }

    Voice voices_[kVoices];
    float voct_[kVoices] = {}, velocity_[kVoices] = {};
    float sampleRate_ = 44100, damper_ = 0.999f, strike_ = 0.02f;
    bool sustain_ = false;
    float timbre_ = 0.35f, bell_ = 0.5f, decay_ = 0.5f, drive_ = 0.4f, tremolo_ = 0.3f, tremRate_ = 4.5f, level_ = 0.8f;
    float tremPhase_ = 0;
    int type_ = 0;
};

}  // namespace mmb_dsp
