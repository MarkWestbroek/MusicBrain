#pragma once

#include <cmath>
#include <cstdint>

namespace mmb_dsp {

/** Lightweight FOF/CHANT-inspired singing-formant voice.
 *
 * A differentiated, asymmetric glottal flow excites five damped formants. The
 * formant frequencies stay fixed while pitch changes, so vowel colour and F0
 * remain independent. This is deliberately a playable first model, not a
 * complete reconstruction of IRCAM CHANT.
 */
class FofVoice {
public:
    void init(float sampleRate) {
        sampleRate_ = sampleRate > 8000.0f ? sampleRate : 44100.0f;
        attackCoefficient_ = timeCoefficient(0.018f);
        releaseCoefficient_ = timeCoefficient(0.12f);
        voiceCoefficient_ = timeCoefficient(0.005f);
        pressureCoefficient_ = timeCoefficient(0.02f);
        closureSamples_ = static_cast<int>(0.020f * sampleRate_);
        burstSamples_ = static_cast<int>(0.006f * sampleRate_);
        glideSamples_ = static_cast<int>(0.060f * sampleRate_);
        glideCoefficient_ = 1.0f - std::exp(-32.0f / (0.015f * sampleRate_));
        {   // Plosive burst resonator: alveolar /d/ bursts around 3.8 kHz.
            const float radius = std::exp(-kPi * 800.0f / sampleRate_);
            burst_.coefficient = 2.0f * radius * std::cos(kTwoPi * 3800.0f / sampleRate_);
            burst_.radiusSquared = radius * radius;
            burst_.gain = (1.0f - radius) * 0.4f;
        }
        reset();
        updateFormants();
    }

    void reset() {
        pitchPhase_ = 0.0f;
        vibratoPhase_ = 0.0f;
        envelope_ = 0.0f;
        breathLow_ = 0.0f;
        previousFlow_ = 0.0f;
        heldVelocity_ = velocity_;
        smoothPressure_ = pressure_;
        smoothVoice_ = voiceTarget();
        noiseState_ = 0x6d2b79f5u;
        for (auto& formant : formants_) { formant.y1 = 0.0f; formant.y2 = 0.0f; }
        gateWas_ = false;
        onsetPhase_ = OnsetPhase::Idle;
        onsetSamples_ = 0;
        burst_.y1 = 0.0f; burst_.y2 = 0.0f;
    }

    /** Syllable table: 0 = plain vowel from the Vowel knob/CV (the original
     *  instrument), 1 = "doo" (/d/ + oe), 2 = "da" (/d/ + a). The choice is
     *  read at the gate's rising edge, so pick the syllable before the note
     *  (left hand on a pad, right hand on the keys). */
    static constexpr int kSyllableCount = 3;
    void setSyllable(int index) {
        syllable_ = index < 0 ? 0 : (index >= kSyllableCount ? kSyllableCount - 1 : index);
    }
    int syllable() const { return syllable_; }

    void setFrequency(float hz) { frequency_ = clamp(hz, 40.0f, 2000.0f); }
    void setGate(bool high) { gate_ = high; }
    void setVelocity(float velocity) { velocity_ = clamp(velocity, 0.0f, 1.0f); }
    /** Continuous expression during the note (breath controller, aftertouch,
     *  CV), 0..1. Default 1 keeps the unpatched voice sample-exact: every
     *  coupling below is written as `1 - k * (1 - pressure)` so pressure 1
     *  contributes exactly zero. Smoothed over ~20 ms. */
    void setPressure(float pressure) { pressure_ = clamp(pressure, 0.0f, 1.0f); }
    void setVowel(float vowel) {
        const float next = clamp(vowel, 0.0f, 4.0f);
        if (next != vowel_) {
            vowel_ = next;
            // A syllable with its own vowel keeps it until the next note.
            if (kSyllables[syllable_].vowel < 0 && onsetPhase_ == OnsetPhase::Idle) {
                activeVowel_ = vowel_;
                updateFormants();
            }
        }
    }
    void setVoice(float voice) { voice_ = clamp(voice, 0.0f, 1.0f); }
    void setBreath(float breath) { breath_ = clamp(breath, 0.0f, 1.0f); }
    void setTone(float tone) {
        tone_ = clamp(tone, 0.0f, 1.0f);
        if (onsetPhase_ == OnsetPhase::Idle) updateFormants();
        else { computeTargets(); loadFormants(currentHz_, currentBw_, currentDb_); }
    }
    void setVibrato(float depth) { vibrato_ = clamp(depth, 0.0f, 1.0f); }
    void setLevel(float level) { level_ = clamp(level, 0.0f, 1.0f); }

    float process() {
        if (gate_ && !gateWas_) startNote();
        gateWas_ = gate_;
        if (gate_) heldVelocity_ = velocity_;
        const float envTarget = gate_ ? velocity_ : 0.0f;
        envelope_ += (envTarget - envelope_) * (gate_ ? attackCoefficient_ : releaseCoefficient_);
        smoothPressure_ += (pressure_ - smoothPressure_) * pressureCoefficient_;
        const float slack = 1.0f - smoothPressure_;
        smoothVoice_ += (voiceTarget() - smoothVoice_) * voiceCoefficient_;

        vibratoPhase_ += 5.3f / sampleRate_;
        if (vibratoPhase_ >= 1.0f) vibratoPhase_ -= 1.0f;
        // Depth 1.0 = +/- one semitone (100 cent); the first version had 22 cent
        // at full depth, which was inaudible with a modest knob or CV.
        const float vibratoRatio = std::pow(2.0f,
            std::sin(kTwoPi * vibratoPhase_) * vibrato_ * 1.0f / 12.0f);
        pitchPhase_ += frequency_ * vibratoRatio / sampleRate_;

        if (pitchPhase_ >= 1.0f) pitchPhase_ -= 1.0f;
        const float rise = 0.45f + 0.15f * smoothVoice_;
        const float closure = 0.04f + 0.20f * smoothVoice_;
        float flow = 0.0f;
        if (pitchPhase_ < rise) {
            flow = 0.5f - 0.5f * std::cos(kPi * pitchPhase_ / rise);
        } else if (pitchPhase_ < rise + closure) {
            flow = 0.5f + 0.5f * std::cos(kPi * (pitchPhase_ - rise) / closure);
        }
        const float pulse = 0.8f * (previousFlow_ - flow);
        previousFlow_ = flow;

        // Consonant onset (only touches the signal while a syllable's onset
        // is running; syllable 0 never enters this branch).
        float excitation = pulse;
        float burstDrive = 0.0f;
        bool burstRinging = false;
        if (onsetPhase_ != OnsetPhase::Idle) advanceOnset(excitation, burstDrive, burstRinging);

        float voiced = 0.0f;
        for (int i = 0; i < kFormants; ++i) {
            Formant& formant = formants_[i];
            const float next = formant.coefficient * formant.y1
                - formant.radiusSquared * formant.y2
                + excitation * formant.gain;
            formant.y2 = formant.y1;
            formant.y1 = next;
            voiced += next;
        }

        const float noise = whiteNoise();
        if (burstRinging) {
            const float next = burst_.coefficient * burst_.y1
                - burst_.radiusSquared * burst_.y2
                + noise * burstDrive * burst_.gain;
            burst_.y2 = burst_.y1;
            burst_.y1 = next;
            voiced += next;
        }
        breathLow_ += 0.08f * (noise - breathLow_);
        // Pressure couplings (all exactly 1 at full pressure): a little quieter
        // (floor 0.5, -6 dB), clearly breathier (only if Breath is up) and a
        // softer, longer closure through voiceTarget(). Loudness is kept small
        // on purpose: the first listening test (2026-10-01) heard mostly
        // volume with the earlier 0.15 floor.
        const float pressureGain = 1.0f - 0.5f * slack;
        const float aspirationGain = 1.0f + 1.5f * slack;
        const float aspiration = (noise - breathLow_) * breath_ * aspirationGain * 0.16f * (0.25f + 0.75f * flow);
        const float output = (voiced + aspiration) * envelope_ * pressureGain * level_;
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

    enum class Onset : uint8_t { None, D };
    enum class OnsetPhase : uint8_t { Idle, Closure, Burst, Glide };
    struct Syllable {
        Onset onset;
        int8_t vowel;   // index in kVowelTable, -1 = Vowel knob/CV
    };
    static constexpr Syllable kSyllables[kSyllableCount] = {
        { Onset::None, -1 },   // plain vowel
        { Onset::D, 4 },       // doo
        { Onset::D, 0 },       // da
    };
    // Alveolar locus for /d/: where F1-F3 start before gliding to the vowel.
    static constexpr float kAlveolarLocusHz[3] = { 200.0f, 1800.0f, 2700.0f };

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

    /** Effective phonation: the Voice knob, softened by a gentle attack
     *  (heldVelocity) and by low pressure. */
    float voiceTarget() const {
        return clamp(voice_ + 0.3f * (1.0f - heldVelocity_) + 0.45f * (1.0f - smoothPressure_), 0.0f, 1.0f);
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

    /** Interpolate the vowel table into the target arrays. */
    void computeTargets() {
        const int left = static_cast<int>(activeVowel_);
        const int right = left < kVowels - 1 ? left + 1 : left;
        const float mix = activeVowel_ - static_cast<float>(left);
        for (int i = 0; i < kFormants; ++i) {
            targetHz_[i] = kVowelTable[left].frequency[i]
                + (kVowelTable[right].frequency[i] - kVowelTable[left].frequency[i]) * mix;
            targetBw_[i] = kVowelTable[left].bandwidth[i]
                + (kVowelTable[right].bandwidth[i] - kVowelTable[left].bandwidth[i]) * mix;
            targetDb_[i] = kVowelTable[left].levelDb[i]
                + (kVowelTable[right].levelDb[i] - kVowelTable[left].levelDb[i]) * mix;
        }
    }

    void loadFormants(const float* hz, const float* bandwidth, const float* db) {
        const float brightness = 0.65f + 0.7f * tone_;
        for (int i = 0; i < kFormants; ++i) {
            const float radius = std::exp(-kPi * bandwidth[i] * brightness / sampleRate_);
            formants_[i].coefficient = 2.0f * radius * std::cos(kTwoPi * hz[i] / sampleRate_);
            formants_[i].radiusSquared = radius * radius;
            formants_[i].gain = std::pow(10.0f, db[i] / 20.0f) * (1.0f - radius) * 3.2f;
        }
    }

    /** Steady state: formants exactly on the (interpolated) vowel. */
    void updateFormants() {
        computeTargets();
        for (int i = 0; i < kFormants; ++i) {
            currentHz_[i] = targetHz_[i]; currentBw_[i] = targetBw_[i]; currentDb_[i] = targetDb_[i];
        }
        loadFormants(currentHz_, currentBw_, currentDb_);
    }

    /** Gate rising edge: read the syllable and start its onset, if any. */
    void startNote() {
        const Syllable& syllable = kSyllables[syllable_];
        const float vowel = syllable.vowel >= 0 ? static_cast<float>(syllable.vowel) : vowel_;
        if (syllable.onset == Onset::None) {
            if (vowel != activeVowel_ || onsetPhase_ != OnsetPhase::Idle) {
                activeVowel_ = vowel;
                finishOnset();
            }
            return;
        }
        activeVowel_ = vowel;
        computeTargets();
        for (int i = 0; i < kFormants; ++i) {
            currentHz_[i] = i < 3 ? kAlveolarLocusHz[i] : targetHz_[i];
            currentBw_[i] = targetBw_[i];
            currentDb_[i] = targetDb_[i];
        }
        loadFormants(currentHz_, currentBw_, currentDb_);
        onsetPhase_ = OnsetPhase::Closure;
        onsetSamples_ = 0;
        burst_.y1 = 0.0f; burst_.y2 = 0.0f;
    }

    void finishOnset() {
        onsetPhase_ = OnsetPhase::Idle;
        onsetSamples_ = 0;
        burst_.y1 = 0.0f; burst_.y2 = 0.0f;
        if (kSyllables[syllable_].vowel < 0) activeVowel_ = vowel_;
        updateFormants();
    }

    /** One sample of the /d/ onset: closure (murmur through the locus),
     *  burst (noise through the burst resonator, voicing resumes) and the
     *  glide of F1-F3 from the locus to the vowel, updated every 32 samples. */
    void advanceOnset(float& excitation, float& burstDrive, bool& burstRinging) {
        ++onsetSamples_;
        switch (onsetPhase_) {
        case OnsetPhase::Closure:
            excitation *= 0.15f;
            if (onsetSamples_ >= closureSamples_) { onsetPhase_ = OnsetPhase::Burst; onsetSamples_ = 0; }
            break;
        case OnsetPhase::Burst:
            burstRinging = true;
            excitation *= 0.4f;
            burstDrive = 1.0f - static_cast<float>(onsetSamples_) / static_cast<float>(burstSamples_);
            if (onsetSamples_ >= burstSamples_) { onsetPhase_ = OnsetPhase::Glide; onsetSamples_ = 0; }
            break;
        case OnsetPhase::Glide:
            burstRinging = true;
            // Ease the voicing in: F1 near the locus sits close to F0 and would
            // otherwise make the transition louder than the vowel itself.
            excitation *= 0.4f + 0.6f * static_cast<float>(onsetSamples_) / static_cast<float>(glideSamples_);
            if ((onsetSamples_ & 31) == 0) {
                for (int i = 0; i < 3; ++i) currentHz_[i] += (targetHz_[i] - currentHz_[i]) * glideCoefficient_;
                loadFormants(currentHz_, currentBw_, currentDb_);
            }
            if (onsetSamples_ >= glideSamples_) finishOnset();
            break;
        case OnsetPhase::Idle:
            break;
        }
    }

    float sampleRate_ = 44100.0f;
    float frequency_ = 261.6256f;
    float velocity_ = 1.0f;
    float heldVelocity_ = 1.0f;
    float pressure_ = 1.0f;
    float smoothPressure_ = 1.0f;
    float vowel_ = 0.0f;
    float activeVowel_ = 0.0f;
    float voice_ = 0.35f;
    float smoothVoice_ = 0.35f;
    float previousFlow_ = 0.0f;
    float breath_ = 0.08f;
    float tone_ = 0.5f;
    float vibrato_ = 0.12f;
    float level_ = 0.8f;
    float pitchPhase_ = 0.0f;
    float vibratoPhase_ = 0.0f;
    float envelope_ = 0.0f;
    float attackCoefficient_ = 0.0f;
    float releaseCoefficient_ = 0.0f;
    float voiceCoefficient_ = 0.0f;
    float pressureCoefficient_ = 0.0f;
    float breathLow_ = 0.0f;
    uint32_t noiseState_ = 0x6d2b79f5u;
    bool gate_ = false;
    bool gateWas_ = false;
    Formant formants_[kFormants]{};
    Formant burst_{};
    float targetHz_[kFormants]{}, targetBw_[kFormants]{}, targetDb_[kFormants]{};
    float currentHz_[kFormants]{}, currentBw_[kFormants]{}, currentDb_[kFormants]{};
    int syllable_ = 0;
    OnsetPhase onsetPhase_ = OnsetPhase::Idle;
    int onsetSamples_ = 0;
    int closureSamples_ = 882;
    int burstSamples_ = 264;
    int glideSamples_ = 2646;
    float glideCoefficient_ = 0.047f;
};

}  // namespace mmb_dsp