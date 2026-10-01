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
 *
 * Syllables: a small phoneme engine plays a sequence of segments (consonant
 * closures, bursts, frication, nasal murmurs, approximants, the vowel, a
 * diphthong glide and coda consonants). Every segment is "glide F1-F3 from
 * wherever they are to these targets over a ramp, then hold", with voicing,
 * noise, F0 offset and jaw opening interpolated alongside. Syllable 0 is the
 * plain vowel from the Vowel knob/CV and never enters the engine.
 */
class FofVoice {
public:
    void init(float sampleRate) {
        sampleRate_ = sampleRate > 8000.0f ? sampleRate : 44100.0f;
        attackCoefficient_ = timeCoefficient(0.018f);
        releaseCoefficient_ = timeCoefficient(0.12f);
        voiceCoefficient_ = timeCoefficient(0.005f);
        pressureCoefficient_ = timeCoefficient(0.02f);
        setNoise(4500.0f, 3000.0f, 0.3f);
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
        noise_.y1 = 0.0f; noise_.y2 = 0.0f;
        gateWas_ = false;
        engineActive_ = false;
        codaHold_ = false;
        snapped_ = false;
        noiseRinging_ = false;
        segmentCount_ = 0;
        segmentIndex_ = 0;
        segmentSamples_ = 0;
        voicing_ = 1.0f; upperDrive_ = 1.0f; onsetCents_ = 0.0f; onsetBreath_ = 0.0f;
        aspirationDrive_ = 0.0f; noiseDrive_ = 0.0f; jawMix_ = 1.0f; currentBwScale_ = 1.0f; amVoiceGain_ = 1.0f;
        controlTick_ = 0;
        updateIntrinsic();
    }

    /** Syllable table (see kSyllables): 0 = plain vowel from the Vowel
     *  knob/CV (the original instrument). The choice is read at the gate's
     *  rising edge, so pick the syllable before the note (left hand on a
     *  pad, right hand on the keys). The coda plays when the gate falls. */
    static constexpr int kSyllableCount = 46;
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
            if (kSyllables[syllable_].v1 == P_NONE && !engineActive_) {
                activeVowel_ = vowel_;
                updateFormants();
            }
        }
    }
    void setVoice(float voice) { voice_ = clamp(voice, 0.0f, 1.0f); }
    void setBreath(float breath) { breath_ = clamp(breath, 0.0f, 1.0f); }
    void setTone(float tone) {
        tone_ = clamp(tone, 0.0f, 1.0f);
        if (!engineActive_) updateFormants();
        else { computeTargets(); loadFormants(currentHz_, currentBw_, currentDb_, kFormants, vowelBw_); }
    }
    void setVibrato(float depth) { vibrato_ = clamp(depth, 0.0f, 1.0f); }
    void setLevel(float level) { level_ = clamp(level, 0.0f, 1.0f); }

    float process() {
        if (gate_ && !gateWas_) startNote();
        else if (!gate_ && gateWas_) endNote();
        gateWas_ = gate_;
        if (gate_) heldVelocity_ = velocity_;
        const bool sustain = gate_ || codaHold_;
        const float envTarget = sustain ? heldVelocity_ : 0.0f;
        envelope_ += (envTarget - envelope_) * (sustain ? attackCoefficient_ : releaseCoefficient_);
        smoothPressure_ += (pressure_ - smoothPressure_) * pressureCoefficient_;
        const float slack = 1.0f - smoothPressure_;
        smoothVoice_ += (voiceTarget() - smoothVoice_) * voiceCoefficient_;

        vibratoPhase_ += 5.3f / sampleRate_;
        if (vibratoPhase_ >= 1.0f) vibratoPhase_ -= 1.0f;
        // Depth 1.0 = +/- one semitone (100 cent); the first version had 22 cent
        // at full depth, which was inaudible with a modest knob or CV.
        // Intrinsic vowel pitch: open vowels sit a few cent lower (Whalen &
        // Levitt 1995), scaled by how far the jaw has opened (jawMix_).
        const float vibratoRatio = std::pow(2.0f,
            std::sin(kTwoPi * vibratoPhase_) * vibrato_ * 1.0f / 12.0f
            + (jawMix_ * vowelCents_ + onsetCents_) / 1200.0f);
        pitchPhase_ += frequency_ * vibratoRatio / sampleRate_;
        if ((++controlTick_ & 31) == 0) updateIntrinsic();

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

        const float noise = whiteNoise();
        // Phoneme engine (only touches the signal while a syllable is being
        // articulated; syllable 0 never enters this branch).
        float excitation = pulse;
        float upperExcitation = pulse;
        if (engineActive_) {
            advanceEngine();
            // Frication through the vocal tract. For a voiced fricative (g, v)
            // every glottal pulse pushes a puff of air through the
            // constriction: gating the noise with the flow is what glues the
            // noise to the voice instead of layering a maraca on an n.
            const float gate = pulsedAspiration_ ? (0.25f + 0.75f * flow) : 1.0f;
            const float air = noise * aspirationDrive_ * gate;
            excitation = pulse * voicing_ * amVoiceGain_ + air * 0.15f;
            upperExcitation = pulse * voicing_ * amVoiceGain_ * upperDrive_ + air;
        }

        float voiced = 0.0f;
        for (int i = 0; i < kFormants; ++i) {
            Formant& formant = formants_[i];
            // During a stop closure only F1 is driven: the closed mouth radiates
            // a low "voice bar" through the cheeks, nothing above a few
            // hundred hertz (driving all formants sounded like a nasal murmur).
            // Aspiration noise goes mainly into F2-F5; through F1 it rumbles.
            const float drive = i > 0 ? upperExcitation : excitation;
            const float next = formant.coefficient * formant.y1
                - formant.radiusSquared * formant.y2
                + drive * formant.gain;
            formant.y2 = formant.y1;
            formant.y1 = next;
            voiced += next;
        }

        if (noiseRinging_) {
            // Burst or frication: noise through its own resonator.
            const float next = noise_.coefficient * noise_.y1
                - noise_.radiusSquared * noise_.y2
                + noise * noiseDrive_ * noise_.gain;
            noise_.y2 = noise_.y1;
            noise_.y1 = next;
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
        const float aspiration = (noise - breathLow_) * (breath_ * (1.0f + intrinsicBreath_) + onsetBreath_) * aspirationGain * 0.16f * (0.25f + 0.75f * flow);
        const float output = (voiced + aspiration) * envelope_ * pressureGain * intrinsicGain_ * level_;
        return clamp(output, -1.0f, 1.0f);
    }

private:
    static constexpr int kFormants = 5;
    static constexpr float kPi = 3.14159265358979323846f;
    static constexpr float kTwoPi = 2.0f * kPi;

    // ── Phoneme inventory ──────────────────────────────────────────────────
    enum Ph : uint8_t {
        P_NONE = 0,
        // Vowels (Dutch spelling): aa, a, e, ee, i, ie, o, oo, oe, schwa, ui-start, ui-middle, uu (ui end), ij-end
        V_AA, V_A, V_E, V_EE, V_I, V_IE, V_O, V_OO, V_OE, V_SCHWA, V_OEU, V_OEU2, V_UU, V_IJ,
        // Consonants
        C_P, C_B, C_T, C_D, C_K, C_M, C_N, C_F, C_V, C_S, C_Z, C_X, C_G, C_H, C_L, C_R, C_J, C_W,
    };
    static constexpr int kVowelRows = 14;

    struct Vowel {
        float frequency[kFormants];
        float bandwidth[kFormants];
        float levelDb[kFormants];
        // Intrinsic properties that come with the jaw opening: open vowels
        // are sung a little lower, louder and with more airflow than close
        // ones (Whalen & Levitt 1995; Lehiste & Peterson 1961). Kept small:
        // trained singers compensate most of the pitch effect. `breath` is a
        // factor on the Breath knob (0.6 = 60 % more aspiration), so Breath 0
        // stays clean.
        float cents;
        float gainDb;
        float breath;
    };

    // Representative adult vocal-tract targets (Dutch, male-ish). They are
    // musical starting points rather than a speaker-identity database. Rows
    // are indexed by Ph - V_AA.
    static constexpr Vowel kVowelTable[kVowelRows] = {
        {{ 740, 1350, 2700, 3700, 4800 }, { 80,  90, 120, 130, 140 }, {  0, -4, -20, -36, -60 }, -12.0f, 2.5f, 0.6f }, // aa (Piper: 710/1390)
        {{ 600,  980, 2500, 3600, 4700 }, { 80,  90, 130, 140, 150 }, {  0, -5, -22, -36, -60 },  -9.0f, 2.0f, 0.5f }, // a  (bam; Piper: 480-620/920-940)
        {{ 540, 1780, 2650, 3500, 4600 }, { 70,  90, 110, 130, 140 }, {  0,-12, -18, -30, -50 },  -5.0f, 1.2f, 0.3f }, // e  (gij, start; Piper: 515/1660-1800)
        {{ 400, 1700, 2600, 3200, 3580 }, { 70,  80, 100, 120, 120 }, {  0,-14, -12, -14, -20 },  -4.0f, 1.0f, 0.2f }, // ee
        {{ 400, 2000, 2600, 3400, 4500 }, { 60,  90, 110, 130, 140 }, {  0,-14, -20, -34, -56 },  -2.0f, 0.5f, 0.1f }, // i  (bim)
        {{ 280, 2250, 2890, 3900, 4950 }, { 60,  90, 100, 120, 120 }, {  0,-18, -24, -36, -60 },   0.0f, 0.0f, 0.0f }, // ie
        {{ 450,  820, 2500, 3500, 4600 }, { 80,  90, 120, 140, 150 }, { -2,-12, -24, -30, -56 },  -8.0f, 0.0f, 0.4f }, // o  (bom; Piper bom: 410/800, kop: 480/880; F1/F2 land on harmonics at low F0, hence the lower levels)
        {{ 450,  800, 2830, 3800, 4950 }, { 70,  80, 100, 130, 135 }, {  0,-10, -22, -22, -50 },  -6.0f, 1.5f, 0.3f }, // oo
        {{ 325,  700, 2530, 3500, 4950 }, { 50,  60, 170, 180, 200 }, {  0,-12, -30, -40, -64 },   0.0f, 0.0f, 0.0f }, // oe
        {{ 420, 1450, 2500, 3400, 4500 }, { 90, 110, 140, 150, 160 }, {  0,-10, -22, -34, -56 },  -4.0f,-2.5f, 0.3f }, // schwa (unstressed, a little quieter; Piper: 350-400/1380-1510)
        {{ 620, 1400, 2400, 3300, 4400 }, { 80, 100, 130, 140, 150 }, {  0,-10, -22, -32, -54 },  -6.0f, 1.0f, 0.3f }, // ui start  (Piper: 600/1420)
        {{ 470, 1560, 2300, 3300, 4400 }, { 70, 100, 130, 140, 150 }, {  0,-12, -22, -32, -54 },  -3.0f, 0.5f, 0.2f }, // ui middle (Piper: 480/1550)
        {{ 260, 1750, 2200, 3300, 4400 }, { 60,  90, 120, 130, 140 }, {  0,-16, -22, -34, -56 },   0.0f, 0.0f, 0.0f }, // uu (ui end; Piper: 250/1750)
        {{ 280, 2200, 2950, 3700, 4700 }, { 60,  90, 110, 130, 140 }, {  0,-16, -22, -34, -56 },   0.0f, 0.0f, 0.0f }, // ij end   (Piper: 220-300/2050-2130; a bit higher so it never rounds towards ui)
    };
    // The Vowel knob/CV morphs over the original five rows A-E-I-O-U.
    static constexpr Ph kMorphRows[5] = { V_AA, V_EE, V_IE, V_OO, V_OE };

    /** Place of articulation for a stop, as locus equations (Sussman et al.
     *  1991): F2 at the release = slope * F2(vowel) + intercept, so the
     *  consonant already leans towards the vowel that follows (Ohman 1966).
     *  The burst centre moves with the vowel's F2 as well: lower before
     *  rounded/back vowels. */
    struct Place {
        float f1Locus;
        float f2Slope, f2Intercept;
        float f3Locus, f3FollowsF2;      // velar pinch: F3 starts just above F2
        float burstSlope, burstIntercept, burstMin, burstMax;
        float burstBandwidth;            // alveolar bursts are diffuse (broadband, rising)
    };
    static constexpr Place kLabial   = { 200.0f, 0.80f,  200.0f, 2300.0f, 0.0f, 0.5f, 1000.0f, 1000.0f, 2500.0f, 2500.0f };
    static constexpr Place kAlveolar = { 200.0f, 0.45f, 1150.0f, 2600.0f, 0.0f, 0.8f, 3600.0f, 3500.0f, 5500.0f, 3000.0f };
    static constexpr Place kVelar    = { 200.0f, 0.85f,  500.0f,    0.0f, 1.0f, 1.0f,  900.0f, 1600.0f, 3400.0f, 1200.0f };

    struct Syllable { Ph onset[2]; Ph v1, v2, v3; Ph coda[2]; };
    static constexpr Syllable kSyllables[kSyllableCount] = {
        { { P_NONE, P_NONE }, P_NONE,  P_NONE, P_NONE, { P_NONE, P_NONE } },   //  0 Vowel knob
        { { C_D, P_NONE },    V_OE,    P_NONE, P_NONE, { P_NONE, P_NONE } },   //  1 doo
        { { C_D, P_NONE },    V_AA,    P_NONE, P_NONE, { P_NONE, P_NONE } },   //  2 da
        { { C_V, P_NONE },    V_AA,    P_NONE, P_NONE, { P_NONE, P_NONE } },   //  3 va
        { { C_D, P_NONE },    V_SCHWA, P_NONE, P_NONE, { C_R, P_NONE } },      //  4 der
        { { C_J, P_NONE },    V_AA,    P_NONE, P_NONE, { P_NONE, P_NONE } },   //  5 ja
        { { C_K, P_NONE },    V_O,     P_NONE, P_NONE, { C_P, P_NONE } },      //  6 cob (kop)
        { { C_S, C_L },       V_AA,    P_NONE, P_NONE, { C_P, C_T } },         //  7 slaapt
        { { C_G, P_NONE },    V_E,     V_IJ,   P_NONE, { P_NONE, P_NONE } },   //  8 gij
        { { C_N, P_NONE },    V_O,     P_NONE, P_NONE, { C_X, P_NONE } },      //  9 nog
        { { P_NONE, P_NONE }, V_A,     P_NONE, P_NONE, { C_L, P_NONE } },      // 10 al
        { { C_L, P_NONE },    V_SCHWA, P_NONE, P_NONE, { P_NONE, P_NONE } },   // 11 le
        { { C_K, C_L },       V_O,     P_NONE, P_NONE, { P_NONE, P_NONE } },   // 12 klo
        { { C_K, P_NONE },    V_SCHWA, P_NONE, P_NONE, { C_N, P_NONE } },      // 13 ken
        { { C_L, P_NONE },    V_OEU,   V_OEU2, V_UU,   { P_NONE, P_NONE } },   // 14 lui
        { { C_D, P_NONE },    V_SCHWA, P_NONE, P_NONE, { C_N, P_NONE } },      // 15 den
        { { C_B, P_NONE },    V_I,     P_NONE, P_NONE, { C_M, P_NONE } },      // 16 bim
        { { C_B, P_NONE },    V_A,     P_NONE, P_NONE, { C_M, P_NONE } },      // 17 bam
        { { C_B, P_NONE },    V_O,     P_NONE, P_NONE, { C_M, P_NONE } },      // 18 bom
        { { C_D, P_NONE },    V_SCHWA, P_NONE, P_NONE, { P_NONE, P_NONE } },   // 19 de
        { { C_N, P_NONE },    V_AA,    P_NONE, P_NONE, { P_NONE, P_NONE } },   // 20 na  (Hey Jude)
        { { C_H, P_NONE },    V_EE,    P_NONE, P_NONE, { P_NONE, P_NONE } },   // 21 hee
        { { C_D, C_J },       V_OE,    P_NONE, P_NONE, { C_D, P_NONE } },      // 22 djoed (Jude)
        // Olifantje in het bos (23-45)
        { { P_NONE, P_NONE }, V_OO,    P_NONE, P_NONE, { P_NONE, P_NONE } },   // 23 o
        { { C_L, P_NONE },    V_IE,    P_NONE, P_NONE, { P_NONE, P_NONE } },   // 24 li
        { { C_F, P_NONE },    V_A,     P_NONE, P_NONE, { C_N, C_T } },         // 25 fant
        { { C_J, P_NONE },    V_SCHWA, P_NONE, P_NONE, { P_NONE, P_NONE } },   // 26 je
        { { P_NONE, P_NONE }, V_I,     P_NONE, P_NONE, { C_N, P_NONE } },      // 27 in
        { { C_H, P_NONE },    V_E,     P_NONE, P_NONE, { C_T, P_NONE } },      // 28 het
        { { C_B, P_NONE },    V_O,     P_NONE, P_NONE, { C_S, P_NONE } },      // 29 bos
        { { C_L, P_NONE },    V_AA,    P_NONE, P_NONE, { C_T, P_NONE } },      // 30 laat
        { { C_M, P_NONE },    V_AA,    P_NONE, P_NONE, { P_NONE, P_NONE } },   // 31 ma
        { { C_T, P_NONE },    V_O,     P_NONE, P_NONE, { C_X, P_NONE } },      // 32 toch
        { { C_N, P_NONE },    V_IE,    P_NONE, P_NONE, { C_T, P_NONE } },      // 33 niet
        { { C_L, P_NONE },    V_O,     P_NONE, P_NONE, { C_S, P_NONE } },      // 34 los
        { { P_NONE, P_NONE }, V_A,     P_NONE, P_NONE, { C_N, P_NONE } },      // 35 an
        { { C_D, P_NONE },    V_SCHWA, P_NONE, P_NONE, { C_R, C_S } },         // 36 ders
        { { C_R, P_NONE },    V_AA,    P_NONE, P_NONE, { C_K, P_NONE } },      // 37 raak
        { { C_W, P_NONE },    V_E,     P_NONE, P_NONE, { C_X, P_NONE } },      // 38 weg
        { { C_K, C_W },       V_E,     V_IJ,   P_NONE, { C_T, P_NONE } },      // 39 kwijt
        { { P_NONE, P_NONE }, V_E,     P_NONE, P_NONE, { C_N, P_NONE } },      // 40 en
        { { C_D, P_NONE },    V_A,     P_NONE, P_NONE, { C_N, P_NONE } },      // 41 dan
        { { C_H, P_NONE },    V_E,     P_NONE, P_NONE, { C_P, P_NONE } },      // 42 heb (hep)
        { { C_L, P_NONE },    V_AA,    P_NONE, P_NONE, { P_NONE, P_NONE } },   // 43 la
        { { C_T, P_NONE },    V_SCHWA, P_NONE, P_NONE, { C_R, P_NONE } },      // 44 ter
        { { C_S, C_P },       V_E,     V_IJ,   P_NONE, { C_T, P_NONE } },      // 45 spijt
    };

    // ── Segments ───────────────────────────────────────────────────────────
    enum NoiseShape : uint8_t { NS_NONE, NS_BURST, NS_FLAT };
    struct Segment {
        float hz[3];            // F1-F3 targets; F4/F5 stay at the nucleus vowel
        float bwScale;          // bandwidth multiplier at the target (2 = closed, damped)
        int rampSamples;        // transition into this segment (F1 in half the time)
        int holdSamples;        // after the ramp; -1 = until the gate falls (nucleus)
        float voicing;          // glottal pulse gain at the target
        float upper;            // drive of F2-F5 (0 = voice bar only)
        float aspiration;       // noise into the formant bank (h, voiceless release)
        float cents;            // F0 offset at the target
        float breath;           // extra aspiration run-up (output path)
        float jaw;              // jaw opening at the target (intrinsic vowel properties)
        NoiseShape noiseShape;
        float noiseHz, noiseBw, noiseGain;
        float amHz, amNoise, amVoice;   // roughness: slow amplitude modulation (uvular ch/g/r ~16-20 Hz)
        bool pulsedAspiration;          // aspiration noise gated by the glottal flow (voiced fricatives: g, v, z)
        bool vowel;             // true: snap to the exact vowel at the end of the ramp
        Ph vowelRow;            // which vowel row the targets came from (vowel segments)
    };
    static constexpr int kMaxSegments = 10;

    struct Formant {
        float coefficient = 0.0f;
        float radiusSquared = 0.0f;
        float gain = 0.0f;
        float y1 = 0.0f;
        float y2 = 0.0f;
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
    int ms(float milliseconds) const { return static_cast<int>(milliseconds * 0.001f * sampleRate_); }

    float whiteNoise() {
        noiseState_ ^= noiseState_ << 13;
        noiseState_ ^= noiseState_ >> 17;
        noiseState_ ^= noiseState_ << 5;
        return static_cast<float>(static_cast<int32_t>(noiseState_)) / 2147483648.0f;
    }

    static float halfCosine(float progress) {
        const float clipped = progress < 0.0f ? 0.0f : (progress > 1.0f ? 1.0f : progress);
        return 0.5f - 0.5f * std::cos(kPi * clipped);
    }

    // ── Vowel targets ──────────────────────────────────────────────────────
    /** Interpolate the five-vowel morph (Vowel knob) into the target arrays,
     *  or load the nucleus row while a syllable is active. */
    void computeTargets() {
        if (nucleusRow_ != P_NONE) { computeTargetsRow(nucleusRow_); return; }
        const int left = static_cast<int>(activeVowel_);
        const int right = left < 4 ? left + 1 : left;
        const float mix = activeVowel_ - static_cast<float>(left);
        const Vowel& a = kVowelTable[kMorphRows[left] - V_AA];
        const Vowel& b = kVowelTable[kMorphRows[right] - V_AA];
        for (int i = 0; i < kFormants; ++i) {
            targetHz_[i] = a.frequency[i] + (b.frequency[i] - a.frequency[i]) * mix;
            vowelBw_[i] = a.bandwidth[i] + (b.bandwidth[i] - a.bandwidth[i]) * mix;
            targetDb_[i] = a.levelDb[i] + (b.levelDb[i] - a.levelDb[i]) * mix;
        }
        vowelCents_ = a.cents + (b.cents - a.cents) * mix;
        vowelGainDb_ = a.gainDb + (b.gainDb - a.gainDb) * mix;
        vowelBreath_ = a.breath + (b.breath - a.breath) * mix;
    }

    void computeTargetsRow(Ph row) {
        const Vowel& v = kVowelTable[row - V_AA];
        for (int i = 0; i < kFormants; ++i) {
            targetHz_[i] = v.frequency[i]; vowelBw_[i] = v.bandwidth[i]; targetDb_[i] = v.levelDb[i];
        }
        vowelCents_ = v.cents; vowelGainDb_ = v.gainDb; vowelBreath_ = v.breath;
    }

    /** Control-rate (every 32 samples): level and airflow that follow the jaw. */
    void updateIntrinsic() {
        intrinsicGain_ = std::pow(10.0f, jawMix_ * vowelGainDb_ / 20.0f);
        intrinsicBreath_ = jawMix_ * vowelBreath_;
    }

    void setNoise(float hz, float bandwidth, float gain) {
        const float radius = std::exp(-kPi * bandwidth / sampleRate_);
        noise_.coefficient = 2.0f * radius * std::cos(kTwoPi * hz / sampleRate_);
        noise_.radiusSquared = radius * radius;
        noise_.gain = (1.0f - radius) * gain;
    }

    /** `gainBandwidth` (optional) keeps the gain at the vowel's own damping
     *  while a transition temporarily widens the resonances. */
    void loadFormants(const float* hz, const float* bandwidth, const float* db, int count = kFormants,
                      const float* gainBandwidth = nullptr) {
        const float brightness = 0.65f + 0.7f * tone_;
        for (int i = 0; i < count; ++i) {
            const float radius = std::exp(-kPi * bandwidth[i] * brightness / sampleRate_);
            formants_[i].coefficient = 2.0f * radius * std::cos(kTwoPi * hz[i] / sampleRate_);
            formants_[i].radiusSquared = radius * radius;
            const float gainRadius = gainBandwidth
                ? std::exp(-kPi * gainBandwidth[i] * brightness / sampleRate_) : radius;
            formants_[i].gain = std::pow(10.0f, db[i] / 20.0f) * (1.0f - gainRadius) * 3.2f;
        }
    }

    /** Steady state: formants exactly on the (interpolated) vowel. */
    void updateFormants() {
        computeTargets();
        updateIntrinsic();
        for (int i = 0; i < kFormants; ++i) {
            currentHz_[i] = targetHz_[i]; currentBw_[i] = vowelBw_[i]; currentDb_[i] = targetDb_[i];
        }
        loadFormants(currentHz_, currentBw_, currentDb_);
    }

    // ── Segment builders ───────────────────────────────────────────────────
    Segment blank() const {
        Segment s{};
        s.hz[0] = targetHz_[0]; s.hz[1] = targetHz_[1]; s.hz[2] = targetHz_[2];
        s.bwScale = 1.0f; s.rampSamples = ms(40.0f); s.holdSamples = 0;
        s.voicing = 1.0f; s.upper = 1.0f; s.aspiration = 0.0f; s.cents = 0.0f; s.breath = 0.0f; s.jaw = 1.0f;
        s.noiseShape = NS_NONE; s.noiseHz = 4500.0f; s.noiseBw = 3000.0f; s.noiseGain = 0.0f;
        s.amHz = 0.0f; s.amNoise = 0.0f; s.amVoice = 0.0f; s.pulsedAspiration = false;
        s.vowel = false; s.vowelRow = P_NONE;
        return s;
    }

    void push(const Segment& s) { if (segmentCount_ < kMaxSegments) segments_[segmentCount_++] = s; }

    static const Place& placeOf(Ph c) {
        switch (c) {
        case C_P: case C_B: case C_M: case C_F: case C_V: case C_W: return kLabial;
        case C_K: case C_X: case C_G: return kVelar;
        default: return kAlveolar;
        }
    }

    /** Locus targets (F1-F3 at the release) for a consonant before the
     *  nucleus vowel whose F2 is `vowelF2`. */
    static void locus(const Place& place, float vowelF2, float* hz) {
        hz[0] = place.f1Locus;
        hz[1] = place.f2Slope * vowelF2 + place.f2Intercept;
        hz[2] = place.f3FollowsF2 > 0.0f ? hz[1] + 500.0f : place.f3Locus;
    }

    static void fricationNoise(Ph c, Segment& s) {
        s.noiseShape = NS_FLAT;
        if (c == C_S || c == C_Z) { s.noiseHz = 6500.0f; s.noiseBw = 2500.0f; s.noiseGain = 0.35f; }
        else if (c == C_F) { s.noiseHz = 4500.0f; s.noiseBw = 3000.0f; s.noiseGain = 0.12f; }
        else if (c == C_V) { s.noiseHz = 1500.0f; s.noiseBw = 2000.0f; s.noiseGain = 0.1f; }    // Piper pim: energy 150-1600 Hz
        else { s.noiseHz = 1300.0f; s.noiseBw = 1200.0f; s.noiseGain = 0.05f; s.amHz = 16.0f; s.amNoise = 0.6f; }   // ch and hard g: Piper pim q25-75 580-2250, 16 Hz scrape
    }

    static void approximantTargets(Ph c, Segment& s) {
        if (c == C_L)      { s.hz[0] = 350.0f; s.hz[1] = 1100.0f; s.hz[2] = 2800.0f; }
        else if (c == C_R) {   // Dutch uvular r: dark, damped, scraping (Piper pim: centroid 220-370 Hz, ~18 Hz AM)
            s.hz[0] = 400.0f; s.hz[1] = 1150.0f; s.hz[2] = 1900.0f;
            s.noiseShape = NS_FLAT; s.noiseHz = 1000.0f; s.noiseBw = 900.0f; s.noiseGain = 0.07f;
            s.amHz = 18.0f; s.amNoise = 0.6f; s.amVoice = 0.45f;
        }
        else if (c == C_J) { s.hz[0] = 250.0f; s.hz[1] = 2100.0f; s.hz[2] = 2900.0f; }
        else               { s.hz[0] = 300.0f; s.hz[1] =  900.0f; s.hz[2] = 2300.0f; }   // w
    }

    /** Append the segments of one onset consonant. `vowelF2` is the F2 of
     *  the nucleus vowel (locus equations). The first segment's ramp is the
     *  glide in from wherever the formants are now. */
    void pushOnsetConsonant(Ph c, float vowelF2) {
        const Place& place = placeOf(c);
        const float rounding = clamp((vowelF2 - 700.0f) / 450.0f, 0.0f, 1.0f);
        const float burstHz = clamp(place.burstIntercept + place.burstSlope * vowelF2, place.burstMin, place.burstMax);
        switch (c) {
        case C_B: case C_D: {
            // Voiced stop: closure with a voice bar, weak diffuse burst while
            // voicing resumes, then the glide into the vowel (nucleus ramp).
            Segment closure = blank();
            locus(place, vowelF2, closure.hz);
            closure.hz[0] = 220.0f;
            closure.bwScale = 2.5f; closure.rampSamples = ms(20.0f); closure.holdSamples = ms(c == C_B ? 20.0f : 5.0f);
            closure.voicing = 0.08f * pitchScale_; closure.upper = 0.0f; closure.breath = 0.05f;
            closure.cents = -60.0f; closure.jaw = 0.0f;
            push(closure);
            Segment burst = closure;
            burst.rampSamples = ms(8.0f); burst.holdSamples = 0;
            // Voicing stays low until F1 has left the locus (F1 near F0 thumps).
            burst.voicing = 0.25f; burst.upper = 1.0f;
            burst.noiseShape = NS_BURST; burst.noiseHz = burstHz; burst.noiseBw = place.burstBandwidth;
            burst.noiseGain = 0.25f * (0.6f + 0.4f * rounding) * pitchScale_;
            push(burst);
            break; }
        case C_P: case C_T: case C_K: {
            // Voiceless stop: silent closure, stronger burst, a short
            // aspirated release (Dutch VOT is short) with a high, falling F0.
            Segment closure = blank();
            locus(place, vowelF2, closure.hz);
            closure.bwScale = 2.0f; closure.rampSamples = ms(20.0f); closure.holdSamples = ms(15.0f);
            closure.voicing = 0.0f; closure.upper = 0.0f; closure.cents = 40.0f; closure.jaw = 0.0f;
            push(closure);
            Segment burst = closure;
            burst.rampSamples = ms(10.0f); burst.holdSamples = 0; burst.upper = 1.0f;
            burst.noiseShape = NS_BURST; burst.noiseHz = burstHz; burst.noiseBw = place.burstBandwidth;
            burst.noiseGain = (c == C_K ? 0.25f : 0.28f) * (0.6f + 0.4f * rounding) * pitchScale_;
            push(burst);
            Segment vot = burst;
            vot.rampSamples = ms(5.0f); vot.holdSamples = ms(15.0f); vot.noiseShape = NS_NONE;
            vot.aspiration = 0.08f * pitchScale_; vot.bwScale = 1.5f; vot.jaw = 0.4f;
            push(vot);
            break; }
        case C_M: case C_N: {
            // Nasal: damped murmur with a low F1, weak upper formants.
            Segment murmur = blank();
            murmur.hz[0] = 250.0f; murmur.hz[1] = c == C_M ? 1000.0f : 1500.0f; murmur.hz[2] = 2300.0f;
            murmur.bwScale = 2.5f; murmur.rampSamples = ms(30.0f); murmur.holdSamples = ms(50.0f);
            murmur.voicing = 0.5f; murmur.upper = 0.25f; murmur.cents = -20.0f; murmur.jaw = 0.1f;
            push(murmur);
            break; }
        case C_F: case C_S: case C_X: case C_V: case C_Z: case C_G: {
            // Fricative: noise through its own resonator; voiced ones keep a
            // weak voice bar underneath.
            // Mark's g is the hard northern g: a voiceless uvular scrape, the
            // voice starts with the vowel (a half-voiced g sounded like l/j).
            const bool voiced = c == C_V || c == C_Z;
            const bool velar = c == C_G || c == C_X;
            Segment fric = blank();
            locus(place, vowelF2, fric.hz);
            fric.bwScale = 1.5f; fric.rampSamples = ms(30.0f);
            fric.holdSamples = ms(c == C_S ? 60.0f : c == C_V ? 90.0f : c == C_G ? 110.0f : c == C_X ? 130.0f : (voiced ? 40.0f : 65.0f));
            fric.voicing = voiced ? 0.35f : 0.0f;
            fric.upper = voiced ? 0.5f : velar ? 1.0f : 0.0f;
            fric.cents = voiced ? -30.0f : 30.0f; fric.jaw = 0.2f;
            // Velar frication partly through the tract (velar locus = the
            // cavity in front of the constriction); v pulsed by the voice.
            fric.aspiration = velar ? 0.05f * pitchScale_ : c == C_V ? 0.03f * pitchScale_ : 0.0f;
            fric.pulsedAspiration = voiced;
            fricationNoise(c, fric);
            if (c == C_Z) fric.noiseGain *= 0.5f;
            push(fric);
            break; }
        case C_H: {
            Segment h = blank();
            h.rampSamples = ms(20.0f); h.holdSamples = ms(50.0f);
            h.voicing = 0.0f; h.upper = 1.0f; h.aspiration = 0.15f * pitchScale_; h.bwScale = 1.5f; h.jaw = 0.8f;
            push(h);
            break; }
        case C_L: case C_R: case C_J: case C_W: {
            // Approximants: a vowel-like constriction, voiced, held briefly.
            Segment a = blank();
            approximantTargets(c, a);
            a.bwScale = c == C_R ? 2.5f : 1.5f; a.rampSamples = ms(40.0f);
            a.holdSamples = ms(c == C_R ? 70.0f : c == C_J ? 70.0f : 45.0f);
            // F1 of an approximant sits near a low F0 and would ring loud:
            // keep the voicing modest. j needs its upper formants (else it is an n).
            a.voicing = c == C_J ? 0.6f : c == C_R ? 0.6f : 0.5f;
            a.upper = c == C_J ? 0.9f : c == C_R ? 0.4f : 0.6f; a.jaw = 0.3f;
            push(a);
            break; }
        default: break;
        }
    }

    /** Append a coda consonant. Dutch final obstruents are voiceless. */
    void pushCodaConsonant(Ph c, float vowelF2, bool first, bool last) {
        const Place& place = placeOf(c);
        switch (c) {
        case C_M: case C_N: {
            Segment murmur = blank();
            murmur.hz[0] = 250.0f; murmur.hz[1] = c == C_M ? 1000.0f : 1500.0f; murmur.hz[2] = 2300.0f;
            murmur.bwScale = 2.5f; murmur.rampSamples = ms(50.0f); murmur.holdSamples = ms(c == C_M ? 130.0f : 110.0f);
            murmur.voicing = 0.5f; murmur.upper = 0.25f; murmur.cents = -20.0f; murmur.jaw = 0.1f;
            push(murmur);
            break; }
        case C_P: case C_T: case C_K: case C_B: case C_D: {
            Segment closure = blank();
            locus(place, vowelF2, closure.hz);
            closure.bwScale = 2.0f; closure.rampSamples = ms(first ? 45.0f : 25.0f);
            closure.holdSamples = ms(last ? (first ? 60.0f : 45.0f) : 25.0f);
            closure.voicing = 0.0f; closure.upper = 0.0f; closure.jaw = 0.0f;
            push(closure);
            if (last) {
                // Released final stop: a clear burst plus a short puff of air
                // ("slaapt" must end in a t, not fade out in the p closure).
                Segment burst = closure;
                burst.rampSamples = ms(8.0f); burst.holdSamples = ms(18.0f);
                burst.noiseShape = NS_BURST; burst.upper = 1.0f;
                burst.noiseHz = clamp(place.burstIntercept + place.burstSlope * vowelF2, place.burstMin, place.burstMax);
                burst.noiseBw = place.burstBandwidth;
                burst.noiseGain = (c == C_P || c == C_B ? 0.22f : 0.35f) * pitchScale_;
                push(burst);
                Segment puff = burst;
                puff.rampSamples = ms(5.0f); puff.holdSamples = ms(20.0f); puff.noiseShape = NS_NONE;
                puff.aspiration = 0.06f * pitchScale_; puff.bwScale = 1.5f;
                push(puff);
            }
            break; }
        case C_F: case C_S: case C_X: case C_V: case C_Z: case C_G: {
            Segment fric = blank();
            locus(place, vowelF2, fric.hz);
            fric.bwScale = 1.5f; fric.rampSamples = ms(45.0f); fric.holdSamples = ms(c == C_X ? 140.0f : 90.0f);
            fric.voicing = 0.0f; fric.upper = c == C_X ? 1.0f : 0.0f; fric.jaw = 0.2f;
            fric.aspiration = c == C_X ? 0.04f * pitchScale_ : 0.0f;   // ch: through the tract, soft and long
            fricationNoise(c, fric);
            push(fric);
            break; }
        case C_L: case C_R: {
            Segment a = blank();
            approximantTargets(c, a);
            if (c == C_L) a.hz[1] = 1000.0f;   // dark final l
            a.bwScale = c == C_R ? 2.5f : 1.5f; a.rampSamples = ms(50.0f); a.holdSamples = ms(c == C_R ? 110.0f : 60.0f);
            a.voicing = c == C_R ? 0.6f : 0.5f; a.upper = c == C_R ? 0.4f : 0.6f; a.jaw = 0.3f;
            push(a);
            break; }
        default: break;
        }
    }

    void pushVowelSegment(Ph row, float rampMs, int holdSamples) {
        const Vowel& v = kVowelTable[row - V_AA];
        Segment s = blank();
        s.hz[0] = v.frequency[0]; s.hz[1] = v.frequency[1]; s.hz[2] = v.frequency[2];
        s.rampSamples = ms(rampMs); s.holdSamples = holdSamples;
        s.vowel = true; s.vowelRow = row;
        push(s);
    }

    static bool isStop(Ph c) { return c == C_B || c == C_D || c == C_P || c == C_T || c == C_K; }

    // ── Engine control ─────────────────────────────────────────────────────
    /** Gate rising edge: read the syllable and build onset + nucleus. */
    void startNote() {
        const Syllable& syl = kSyllables[syllable_];
        if (syl.v1 == P_NONE) {
            // Plain vowel from the knob: leave the engine, snap to the vowel.
            const bool wasActive = engineActive_ || codaHold_;
            nucleusRow_ = P_NONE;
            if (vowel_ != activeVowel_ || wasActive) { activeVowel_ = vowel_; leaveEngine(); }
            return;
        }
        pitchScale_ = clamp(frequency_ / 220.0f, 0.5f, 3.0f);
        nucleusRow_ = syl.v1;
        computeTargetsRow(syl.v1);   // F4/F5, bandwidths, levels and intrinsic values of the nucleus
        for (int i = 3; i < kFormants; ++i) { currentHz_[i] = targetHz_[i]; currentBw_[i] = vowelBw_[i]; }
        for (int i = 0; i < kFormants; ++i) currentDb_[i] = targetDb_[i];
        {   // F4/F5 of the new vowel (they do not glide; the change is subtle)
            const float brightness = 0.65f + 0.7f * tone_;
            for (int i = 3; i < kFormants; ++i) {
                const float radius = std::exp(-kPi * currentBw_[i] * brightness / sampleRate_);
                formants_[i].coefficient = 2.0f * radius * std::cos(kTwoPi * currentHz_[i] / sampleRate_);
                formants_[i].radiusSquared = radius * radius;
                formants_[i].gain = std::pow(10.0f, currentDb_[i] / 20.0f) * (1.0f - radius) * 3.2f;
            }
        }
        segmentCount_ = 0;
        const float vowelF2 = targetHz_[1];
        for (int i = 0; i < 2; ++i) if (syl.onset[i] != P_NONE) pushOnsetConsonant(syl.onset[i], vowelF2);
        const Ph lastOnset = syl.onset[1] != P_NONE ? syl.onset[1] : syl.onset[0];
        const float vowelRamp = lastOnset == P_NONE ? 30.0f : (isStop(lastOnset) ? 50.0f : 60.0f);
        if (syl.v2 == P_NONE) {
            pushVowelSegment(syl.v1, vowelRamp, -1);
        } else if (syl.v3 == P_NONE) {
            pushVowelSegment(syl.v1, vowelRamp, ms(90.0f));
            pushVowelSegment(syl.v2, 160.0f, -1);
        } else {
            // Three-point diphthong (ui: open rounded start, mid, close end).
            pushVowelSegment(syl.v1, vowelRamp, ms(70.0f));
            pushVowelSegment(syl.v2, 80.0f, ms(40.0f));
            pushVowelSegment(syl.v3, 140.0f, -1);
        }
        codaHold_ = false;
        if (envelope_ < 0.1f && segmentCount_ > 0) {
            // From silence there is nothing to glide from: start the first
            // segment on its targets (the glide-in is for resonators that
            // still ring from the previous note).
            const Segment& first = segments_[0];
            for (int i = 0; i < 3; ++i) currentHz_[i] = first.hz[i];
            currentBwScale_ = first.bwScale;
            for (int i = 0; i < 3; ++i) currentBw_[i] = vowelBw_[i] * currentBwScale_;
            loadFormants(currentHz_, currentBw_, currentDb_, 3, vowelBw_);
            voicing_ = first.voicing; upperDrive_ = first.upper; aspirationDrive_ = first.aspiration;
            onsetCents_ = first.cents; onsetBreath_ = first.breath; jawMix_ = first.jaw;
            updateIntrinsic();
        }
        beginSegments();
    }

    /** Gate falling edge: play the coda (if any) before the release. */
    void endNote() {
        if (!engineActive_) return;
        const Syllable& syl = kSyllables[syllable_];
        if (syl.coda[0] == P_NONE) { codaHold_ = false; return; }
        nucleusRow_ = syl.v3 != P_NONE ? syl.v3 : syl.v2 != P_NONE ? syl.v2 : syl.v1;
        computeTargetsRow(nucleusRow_);
        segmentCount_ = 0;
        const float vowelF2 = targetHz_[1];
        for (int i = 0; i < 2; ++i) {
            if (syl.coda[i] == P_NONE) break;
            pushCodaConsonant(syl.coda[i], vowelF2, i == 0, i == 1 || syl.coda[1] == P_NONE);
        }
        codaHold_ = true;
        beginSegments();
    }

    void beginSegments() {
        engineActive_ = true;
        snapped_ = false;
        segmentIndex_ = -1;
        nextSegment();
    }

    void nextSegment() {
        ++segmentIndex_;
        snapped_ = false;
        if (segmentIndex_ >= segmentCount_) {
            // Coda finished: release. The engine stays active so a voiceless
            // coda does not voice again in the release tail; the next note
            // ramps from this state, syllable 0 leaves the engine.
            codaHold_ = false;
            noiseRinging_ = false; noiseDrive_ = 0.0f; aspirationDrive_ = 0.0f;
            return;
        }
        const Segment& s = segments_[segmentIndex_];
        segmentSamples_ = 0;
        for (int i = 0; i < 3; ++i) fromHz_[i] = currentHz_[i];
        fromBwScale_ = currentBwScale_;
        fromVoicing_ = voicing_; fromUpper_ = upperDrive_; fromAspiration_ = aspirationDrive_;
        fromCents_ = onsetCents_; fromBreath_ = onsetBreath_; fromJaw_ = jawMix_;
        if (s.noiseShape != NS_NONE) {
            setNoise(s.noiseHz, s.noiseBw, s.noiseGain);
            noise_.y1 = 0.0f; noise_.y2 = 0.0f;
            noiseRinging_ = true;
        }
        if (s.vowel) { nucleusRow_ = s.vowelRow; computeTargetsRow(s.vowelRow); }
    }

    void leaveEngine() {
        engineActive_ = false; codaHold_ = false; noiseRinging_ = false; snapped_ = false;
        voicing_ = 1.0f; upperDrive_ = 1.0f; aspirationDrive_ = 0.0f; noiseDrive_ = 0.0f; amVoiceGain_ = 1.0f;
        onsetCents_ = 0.0f; onsetBreath_ = 0.0f; jawMix_ = 1.0f; currentBwScale_ = 1.0f;
        updateFormants();
    }

    /** One sample of the engine: interpolate everything every 8 samples. */
    void advanceEngine() {
        if (segmentIndex_ >= segmentCount_) return;
        const Segment& s = segments_[segmentIndex_];
        ++segmentSamples_;
        const int t = segmentSamples_;
        const int ramp = s.rampSamples > 0 ? s.rampSamples : 1;
        if (!snapped_ && ((t & 7) == 0 || t == 1)) {
            const float progress = static_cast<float>(t) / static_cast<float>(ramp);
            const float shape = halfCosine(progress);
            const float f1Shape = halfCosine(progress * 2.0f);
            for (int i = 0; i < 3; ++i) {
                currentHz_[i] = fromHz_[i] + (s.hz[i] - fromHz_[i]) * (i == 0 ? f1Shape : shape);
            }
            currentBwScale_ = fromBwScale_ + (s.bwScale - fromBwScale_) * shape;
            for (int i = 0; i < 3; ++i) currentBw_[i] = vowelBw_[i] * currentBwScale_;
            loadFormants(currentHz_, currentBw_, currentDb_, 3, vowelBw_);
            // Voicing changes faster than the tongue: a closure cuts the
            // voice in half the ramp (like F1), the release lets it back in.
            voicing_ = fromVoicing_ + (s.voicing - fromVoicing_) * (s.voicing < fromVoicing_ ? f1Shape : shape);
            upperDrive_ = fromUpper_ + (s.upper - fromUpper_) * (s.upper < fromUpper_ ? f1Shape : shape);
            aspirationDrive_ = fromAspiration_ + (s.aspiration - fromAspiration_) * shape;
            onsetCents_ = fromCents_ + (s.cents - fromCents_) * shape;
            onsetBreath_ = fromBreath_ + (s.breath - fromBreath_) * shape;
            jawMix_ = fromJaw_ + (s.jaw - fromJaw_) * f1Shape;
        }
        // Noise envelope: a burst decays over the segment, frication is flat
        // with short fades.
        if (s.noiseShape == NS_BURST) {
            const int total = s.rampSamples + s.holdSamples;
            const float u = static_cast<float>(t) / static_cast<float>(total > 0 ? total : 1);
            const float d = u < 1.0f ? 1.0f - u : 0.0f;
            noiseDrive_ = d * d;
        } else if (s.noiseShape == NS_FLAT) {
            const int fade = ms(10.0f);
            const int total = s.rampSamples + s.holdSamples;
            float g = 1.0f;
            if (t < fade) g = static_cast<float>(t) / static_cast<float>(fade);
            else if (total - t < fade) g = static_cast<float>(total - t) / static_cast<float>(fade);
            noiseDrive_ = g < 0.0f ? 0.0f : g;
        } else {
            noiseDrive_ = 0.0f;
        }
        pulsedAspiration_ = s.pulsedAspiration;
        if (s.amHz > 0.0f) {
            // Slow amplitude modulation: the scrape of a uvular ch, g or r.
            const float m = 0.5f - 0.5f * std::cos(kTwoPi * s.amHz * static_cast<float>(t) / sampleRate_);
            noiseDrive_ *= 1.0f - s.amNoise * m;
            amVoiceGain_ = 1.0f - s.amVoice * m;
        } else {
            amVoiceGain_ = 1.0f;
        }
        if (t >= s.rampSamples && s.vowel && !snapped_) {
            // End of the glide into a vowel: exact table coefficients, so the
            // sustained sound is bit-identical to the plain vowel.
            snapped_ = true;
            for (int i = 0; i < kFormants; ++i) { currentHz_[i] = targetHz_[i]; currentBw_[i] = vowelBw_[i]; currentDb_[i] = targetDb_[i]; }
            currentBwScale_ = 1.0f;
            loadFormants(currentHz_, currentBw_, currentDb_);
            voicing_ = 1.0f; upperDrive_ = 1.0f; aspirationDrive_ = 0.0f; onsetCents_ = 0.0f; onsetBreath_ = 0.0f; jawMix_ = 1.0f;
            noiseRinging_ = false; noiseDrive_ = 0.0f; amVoiceGain_ = 1.0f;
            updateIntrinsic();
        }
        if (s.holdSamples >= 0 && t >= s.rampSamples + s.holdSamples) nextSegment();
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
    Formant noise_{};
    float targetHz_[kFormants]{}, vowelBw_[kFormants]{}, targetDb_[kFormants]{};
    float currentHz_[kFormants]{}, currentBw_[kFormants]{}, currentDb_[kFormants]{};
    float currentBwScale_ = 1.0f;
    float vowelCents_ = 0.0f, vowelGainDb_ = 0.0f, vowelBreath_ = 0.0f;
    float jawMix_ = 1.0f;
    float voicing_ = 1.0f;         // glottal pulse gain (engine)
    float upperDrive_ = 1.0f;      // drive of F2-F5 relative to F1 (0 during a stop closure)
    float aspirationDrive_ = 0.0f; // noise into the formant bank
    float noiseDrive_ = 0.0f;      // noise into the burst/frication resonator
    bool noiseRinging_ = false;
    float onsetCents_ = 0.0f;      // F0 offset from the engine
    float onsetBreath_ = 0.0f;     // soft air run-up through a closure
    float pitchScale_ = 1.0f;
    float amVoiceGain_ = 1.0f;
    bool pulsedAspiration_ = false;
    float intrinsicGain_ = 1.0f, intrinsicBreath_ = 0.0f;
    uint32_t controlTick_ = 0;
    int syllable_ = 0;
    Ph nucleusRow_ = P_NONE;
    // Engine state
    bool engineActive_ = false;
    bool codaHold_ = false;
    bool snapped_ = false;
    Segment segments_[kMaxSegments]{};
    int segmentCount_ = 0;
    int segmentIndex_ = 0;
    int segmentSamples_ = 0;
    float fromHz_[3]{};
    float fromBwScale_ = 1.0f, fromVoicing_ = 1.0f, fromUpper_ = 1.0f, fromAspiration_ = 0.0f;
    float fromCents_ = 0.0f, fromBreath_ = 0.0f, fromJaw_ = 1.0f;
};

}  // namespace mmb_dsp
