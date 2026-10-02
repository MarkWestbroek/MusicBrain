#pragma once
// Percuter: acht digitale drumkanalen naar de Dynacord Percuter (1984).
//
// Op het apparaat zit in elk van de acht kanalen een cartridge: een EPROM van
// 8 of 16 KB met kale 8-bit unsigned PCM, afgespeeld op 12,5 of 25 kHz, met
// een eenvoudig filter en een vervalcurve erachter. Een triggeringang per
// kanaal met een gevoeligheidsknop maakt de aanslag dynamisch; een knop per
// kanaal is volume (mono) of panorama (stereo); globaal zijn er een
// stemming en een aansluiting voor een pitchpedaal.
//
// Hier speelt kanaal k slot k van de geladen samplebank (een .mmbs; de
// cartridges zet `tools/mmb-wasm/percuter-to-mmbs.mjs` om, met hun eigen
// samplefrequentie). Het lo-fi-karakter komt van hoe het apparaat afspeelt:
//   - zonder interpolatie (zero-order hold) op de samplefrequentie van de
//     cartridge, dus met de spiegelbeelden boven de halve samplefrequentie;
//   - herkwantiseerd op 8 bit (ook als de bank uit 16-bit materiaal komt);
//   - Filter aan: een eenpolig laagdoorlaatfilter op ~0,3 maal de
//     afspeelfrequentie, zoals de de-emphasis van de cartridge; uit = rauw.
// Toonhoogte = de afspeelklok: hoger stemmen maakt het geluid ook korter.
//
// Header-only; gedeeld door Teensy en browser.
#include "oversample.h"
#include "sample_player.h"

namespace mmb_dsp {

class Percuter {
public:
    static constexpr int kChannels = 8;
    // Controls: globaal, daarna per kanaal level, pan, decay, tune (8 elk).
    enum Control { Tune, Filter, Level, kGlobal };
    static constexpr int kLevelBase = kGlobal, kPanBase = kLevelBase + kChannels,
                         kDecayBase = kPanBase + kChannels, kTuneBase = kDecayBase + kChannels;
    static constexpr int kControls = kTuneBase + kChannels;
    // CV's: velocity 1..8, pitchpedaal (V/Oct), daarna de triggers (de aanslag
    // leest de velocity van hetzelfde blok).
    static constexpr int kVelBase = 0, kPitch = kChannels, kTrigBase = kChannels + 1, kCvIns = 2 * kChannels + 1;
    static constexpr int kCvOuts = 0;
    static constexpr float kDefaults[kControls] = {
        0, 1, 0.8f,
        0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f, 0.8f,
        0, 0, 0, 0, 0, 0, 0, 0,
        1, 1, 1, 1, 1, 1, 1, 1,
        0, 0, 0, 0, 0, 0, 0, 0,
    };

    void Init(float sampleRate) {
        *this = Percuter();
        sampleRate_ = finiteClamp(sampleRate, 8000, 192000, 44100);
        for (int k = 0; k < kControls; ++k) setControl(k, kDefaults[k]);
    }

    /** De slots van de geladen bank; kanaal k speelt slot k. */
    void bind(const SampleSlot* slots, int count) { slots_ = slots; count_ = slots ? count : 0; }

    void setControl(int control, float value) {
        if (control == Tune) tune_ = finiteClamp(value, -12, 12, 0);
        else if (control == Filter) filter_ = value >= 0.5f;
        else if (control == Level) level_ = finiteClamp(value, 0, 1, 0.8f);
        else if (control >= kLevelBase && control < kPanBase) channel_[control - kLevelBase].level = finiteClamp(value, 0, 1, 0.8f);
        else if (control >= kPanBase && control < kDecayBase) {
            const float pan = finiteClamp(value, -1, 1, 0);
            channel_[control - kPanBase].left = std::sqrt(0.5f * (1 - pan));
            channel_[control - kPanBase].right = std::sqrt(0.5f * (1 + pan));
        } else if (control >= kDecayBase && control < kTuneBase) {
            // 1 = het hele sample; lager = een vervalcurve van 2 s tot 40 ms.
            const float decay = finiteClamp(value, 0, 1, 1);
            Channel& c = channel_[control - kDecayBase];
            c.decay = decay >= 0.999f ? 1.0f : std::exp(-1 / ((0.04f * std::pow(50.0f, decay)) * sampleRate_));
        } else if (control >= kTuneBase && control < kControls) channel_[control - kTuneBase].tune = finiteClamp(value, -12, 12, 0);
    }

    void setCv(int input, float value) {
        if (input >= kVelBase && input < kVelBase + kChannels) velocity_[input - kVelBase] = finiteClamp(value, 0, 1, 0);
        else if (input == kPitch) pitch_ = finiteClamp(value, -3, 3, 0);
        else if (input >= kTrigBase && input < kTrigBase + kChannels) {
            const int k = input - kTrigBase;
            const bool high = value >= 0.5f;
            if (high && !trigHigh_[k]) strike(k);
            trigHigh_[k] = high;
        }
    }
    float cvOut(int) const { return 0; }

    /** out[0], out[1] = stereo-som; out[2..9] = de kanalen apart (zonder pan). */
    void Process(const float* const*, float* const* out, int frames) {
        for (int frame = 0; frame < frames; ++frame) {
            float left = 0, right = 0;
            for (int k = 0; k < kChannels; ++k) {
                Channel& c = channel_[k];
                float y = 0;
                if (c.active) {
                    const SampleSlot& s = slots_[k];
                    const int index = static_cast<int>(c.position);
                    if (index >= c.frames) c.active = false;
                    else {
                        // 8 bit, zoals de EPROM: de onderste byte valt weg.
                        const int sample = s.data[index * s.channels];
                        const float raw = static_cast<float>(sample >> 8) * (1.0f / 128.0f);
                        if (filter_) { c.lowpass += c.filterCoefficient * (raw - c.lowpass); y = c.lowpass; }
                        else y = raw;
                        y *= c.amplitude;
                        c.amplitude *= c.decay;
                        c.position += c.increment;
                    }
                }
                if (out[2 + k]) out[2 + k][frame] = y;
                y *= c.level;
                left += y * c.left; right += y * c.right;
            }
            out[0][frame] = std::tanh(left * level_ * 1.2f);
            out[1][frame] = std::tanh(right * level_ * 1.2f);
        }
    }

private:
    struct Channel {
        double position = 0, increment = 0;
        float amplitude = 0, decay = 1, level = 0.8f, left = 0.7071f, right = 0.7071f, tune = 0;
        float lowpass = 0, filterCoefficient = 1;
        int frames = 0;
        bool active = false;
    };

    void strike(int k) {
        Channel& c = channel_[k];
        if (k >= count_ || !slots_[k].valid()) { c.active = false; return; }
        const SampleSlot& s = slots_[k];
        // Zonder velocity-kabel (0): volle aanslag.
        const float velocity = velocity_[k] <= 0 ? 1.0f : velocity_[k];
        const float ratio = std::exp2((tune_ + c.tune) / 12.0f + pitch_);
        const float playRate = s.rate * ratio;
        c.position = 0;
        c.increment = playRate / sampleRate_;
        c.frames = s.residentFrames();
        c.amplitude = velocity * velocity;
        c.lowpass = 0;
        c.filterCoefficient = 1 - std::exp(-2 * 3.14159265f * finiteClamp(0.3f * playRate, 200, 0.45f * sampleRate_, 4000) / sampleRate_);
        c.active = true;
    }

    const SampleSlot* slots_ = nullptr;
    int count_ = 0;
    Channel channel_[kChannels];
    float velocity_[kChannels] = {};
    bool trigHigh_[kChannels] = {};
    float sampleRate_ = 44100, tune_ = 0, pitch_ = 0, level_ = 0.8f;
    bool filter_ = true;
};

}  // namespace mmb_dsp
