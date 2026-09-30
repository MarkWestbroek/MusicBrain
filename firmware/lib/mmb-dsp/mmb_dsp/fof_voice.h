#pragma once

#include <cmath>
#include <cstdint>

namespace mmb_dsp {

/** Lightweight FOF/CHANT-inspired singing-formant voice.
 *
 * A pitch-synchronous impulse excites five damped sinusoidal formants. The
 * formant frequencies stay fixed while pitch changes, so vowel colour and F0
 * remain independent. This is deliberately a playable first model, not a
 * complete reconstruction of IRCAM CHANT.
 */
class FofVoice {
public:
    void init(float sampleRate) {
        sampleRate_ = sampleRate > 8000.0f ? sampleRate : 44100.0f;
        reset();
        updateFormants();
    }

    void reset() {
        pitchPhase_ = 0.0f;
        vibratoPhase_ = 0.0f;
        envelope_ = 0.0f;
        noiseState_ = 0x6d2b79f5u;
        for (auto& formant : formants_) formant = {};
    }

    void setFrequency(float hz) { frequency_ = clamp(hz, 40.0f, 2000.0f); }
    void setGate(bool high) { gate_ = high; }
    void setVowel(float vowel) { vowel_ = clamp(vowel, 0.0f, 4.0f); updateFormants(); }
    void setBreath(float breath) { breath_ = clamp(breath, 0.0f, 1.0f); }
    void setTone(float tone) { tone_ = clamp(tone, 0.0f, 1.0f); updateFormants(); }
    void setVibrato(float depth) { vibrato_ = clamp(depth, 0.0f, 1.0f); }
    void setLevel(float level) { level_ = clamp(level, 0.0f, 1.0f); }

    float process() {
        const float envTarget = gate_ ? 1.0f : 0.0f;
        const float envTime = gate_ ? 0.018f : 0.12f;
        envelope_ += (envTarget - envelope_) * timeCoefficient(envTime);

        vibratoPhase_ += 5.3f / sampleRate_;
        if (vibratoPhase_ >= 1.0f) vibratoPhase_ -= 1.0f;
        const float vibratoRatio = std::pow(2.0f,
            std::sin(kTwoPi * vibratoPhase_) * vibrato_ * 0.22f / 12.0f);
        pitchPhase_ += frequency_ * vibratoRatio / sampleRate_;

        float pulse = 0.0f;
        if (pitchPhase_ >= 1.0f) {
            pitchPhase_ -= 1.0f;
            pulse = 1.0f;
        }

        float voiced = 0.0f;
        for (int i = 0; i < kFormants; ++i) {
            Formant& formant = formants_[i];
            const float next = formant.coefficient * formant.y1
                - formant.radiusSquared * formant.y2
                + pulse * formant.gain;
            formant.y2 = formant.y1;
            formant.y1 = next;
            voiced += next;
        }

        const float noise = whiteNoise();
        breathLow_ += 0.08f * (noise - breathLow_);
        const float aspiration = (noise - breathLow_) * breath_ * 0.16f;
        const float output = (voiced + aspiration) * envelope_ * level_;
        return clamp(output, -1.0f, 1.0f);
    }

private:
    static constexpr int kFormants = 5;
    static constexpr int kVowels = 5;
    static constexpr float kPi = 3.14159265358979323846f;
    static constexpr float kTwoPi = 2.0f * kPi;

    struct Vowel {
        float frequency[kFormants];
        float bandwidth[kFormants];
        float levelDb[kFormants];
    };

    struct Formant {
        float coefficient = 0.0f;
        float radiusSquared = 0.0f;
        float gain = 0.0f;
        float y1 = 0.0f;
        float y2 = 0.0f;
    };

    // Representative adult vocal-tract targets. They are musical starting
    // points rather than a speaker-identity database.
    static constexpr Vowel kVowelTable[kVowels] = {
        {{ 800, 1150, 2900, 3900, 4950 }, { 80,  90, 120, 130, 140 }, {  0, -4, -20, -36, -60 }}, // a
        {{ 400, 1700, 2600, 3200, 3580 }, { 70,  80, 100, 120, 120 }, {  0,-14, -12, -14, -20 }}, // e
        {{ 280, 2250, 2890, 3900, 4950 }, { 60,  90, 100, 120, 120 }, {  0,-18, -24, -36, -60 }}, // i
        {{ 450,  800, 2830, 3800, 4950 }, { 70,  80, 100, 130, 135 }, {  0,-10, -22, -22, -50 }}, // o
        {{ 325,  700, 2530, 3500, 4950 }, { 50,  60, 170, 180, 200 }, {  0,-12, -30, -40, -64 }}, // u
    };

    static float clamp(float value, float low, float high) {
        return value < low ? low : (value > high ? high : value);
    }

    float timeCoefficient(float seconds) const {
        return 1.0f - std::exp(-1.0f / (seconds * sampleRate_));
    }

    float whiteNoise() {
        noiseState_ ^= noiseState_ << 13;
        noiseState_ ^= noiseState_ >> 17;
        noiseState_ ^= noiseState_ << 5;
        return static_cast<float>(static_cast<int32_t>(noiseState_)) / 2147483648.0f;
    }

    void updateFormants() {
        const int left = static_cast<int>(vowel_);
        const int right = left < kVowels - 1 ? left + 1 : left;
        const float mix = vowel_ - static_cast<float>(left);
        const float brightness = 0.65f + 0.7f * tone_;
        for (int i = 0; i < kFormants; ++i) {
            const float hz = kVowelTable[left].frequency[i]
                + (kVowelTable[right].frequency[i] - kVowelTable[left].frequency[i]) * mix;
            const float bandwidth = kVowelTable[left].bandwidth[i]
                + (kVowelTable[right].bandwidth[i] - kVowelTable[left].bandwidth[i]) * mix;
            const float db = kVowelTable[left].levelDb[i]
                + (kVowelTable[right].levelDb[i] - kVowelTable[left].levelDb[i]) * mix;
            const float radius = std::exp(-kPi * bandwidth * brightness / sampleRate_);
            formants_[i].coefficient = 2.0f * radius * std::cos(kTwoPi * hz / sampleRate_);
            formants_[i].radiusSquared = radius * radius;
            formants_[i].gain = std::pow(10.0f, db / 20.0f) * (1.0f - radius) * 3.2f;
        }
    }

    float sampleRate_ = 44100.0f;
    float frequency_ = 261.6256f;
    float vowel_ = 0.0f;
    float breath_ = 0.08f;
    float tone_ = 0.5f;
    float vibrato_ = 0.12f;
    float level_ = 0.8f;
    float pitchPhase_ = 0.0f;
    float vibratoPhase_ = 0.0f;
    float envelope_ = 0.0f;
    float breathLow_ = 0.0f;
    uint32_t noiseState_ = 0x6d2b79f5u;
    bool gate_ = false;
    Formant formants_[kFormants]{};
};

}  // namespace mmb_dsp