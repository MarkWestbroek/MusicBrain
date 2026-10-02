#pragma once
// Tonewheel-orgel: de generator van een elektromechanisch orgel met
// trekstangen, zoals hij werkt en niet als negen sinussen per toets.
//
// Er draaien 91 toonwielen, altijd, elk op zijn eigen toonhoogte. Een toets
// maakt geen toon maar sluit negen contacten: hij tapt negen wielen af (de
// voetmaten 16', 5 1/3', 8', 4', 2 2/3', 2', 1 3/5', 1 1/3', 1') en de
// trekstangen bepalen hoeveel van elk. Daar volgt het karakter uit:
//
//   - Twee toetsen die hetzelfde wiel aftappen krijgen dezelfde sinus, in
//     fase: het orgel zweeft niet met zichzelf en klinkt als één blok.
//   - Bovenin zijn de wielen op: de hoogste voetmaten vouwen een octaaf
//     terug (foldback), dus het hoog wordt niet schel.
//   - De wielen staan niet stil als je een toets indrukt: het contact
//     sluit op een willekeurig punt van de golf. Dat is de key click.
//   - Percussie (2e of 3e harmonische) heeft één envelope voor het hele
//     klavier en slaat pas opnieuw aan als alle toetsen los zijn: legato
//     spelen geeft alleen op de eerste noot een tik.
//   - Wielen die naast elkaar in de kast zitten lekken in elkaar (Leak).
//   - Vibrato/chorus: een aftaklijn die door een scanner wordt afgelopen
//     (V1..V3 alleen vibrato, C1..C3 met het droge signaal erbij).
//
// Twaalf stem-cellen (V/Oct + gate); de toonhoogte wordt op halve tonen
// afgerond, een orgel buigt niet. Gelijkzwevend gestemd (de tandwielen van
// het origineel wijken minder dan een cent af). De versterker en de
// draaiende luidspreker horen erachter: ROTARY. Header-only; gedeeld door
// Teensy en browser.
#include "oversample.h"
#include <cstdint>

namespace mmb_dsp {

class Tonewheel {
public:
    static constexpr int kVoices = 12;
    static constexpr int kWheels = 91;
    static constexpr int kLowestWheelMidi = 24;      // wiel 1 = C1
    enum Control {
        Bar16, Bar513, Bar8, Bar4, Bar223, Bar2, Bar135, Bar113, Bar1,
        Percussion, PercFast, PercSoft, Vibrato, Click, Leak, Level, kControls
    };
    // CV's: 0..11 V/Oct per cel, 12..23 gate per cel, 24 swell.
    static constexpr int kGateBase = kVoices, kSwell = 2 * kVoices, kCvIns = 2 * kVoices + 1;
    static constexpr int kCvOuts = 0;
    static constexpr float kDefaults[kControls] = {8, 8, 8, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.4f, 0.3f, 0.8f};

    void Init(float sampleRate) {
        *this = Tonewheel();
        sampleRate_ = finiteClamp(sampleRate, 8000, 192000, 44100);
        for (int index = 0; index <= kTable; ++index)
            table_[index] = std::sin(6.2831853f * index / kTable);
        for (int wheel = 0; wheel < kWheels; ++wheel) {
            const double hz = 440.0 * std::pow(2.0, (kLowestWheelMidi + wheel - 69) / 12.0);
            increment_[wheel] = static_cast<std::uint32_t>(hz / sampleRate_ * 4294967296.0);
        }
        contact_ = 1 - std::exp(-1 / (0.0012f * sampleRate_));
        clickDecay_ = std::exp(-1 / (0.002f * sampleRate_));
        for (int bar = 0; bar < 9; ++bar) setControl(bar, kDefaults[bar]);
        setControl(PercFast, 1);
    }

    void setControl(int control, float value) {
        if (control >= Bar16 && control <= Bar1) {
            const float position = finiteClamp(value, 0, 8, 0);
            // Elke stand van een trekstang is ongeveer 3 dB.
            barGain_[control] = position < 0.5f ? 0 : std::pow(10.0f, -3.0f * (8 - position) / 20.0f);
            return;
        }
        switch (control) {
            case Percussion: percussion_ = static_cast<int>(finiteClamp(value, 0, 2, 0) + 0.5f); break;
            case PercFast: percDecay_ = std::exp(-1 / ((value >= 0.5f ? 0.22f : 0.7f) * sampleRate_)); break;
            case PercSoft: percSoft_ = value >= 0.5f; break;
            case Vibrato: vibrato_ = static_cast<int>(finiteClamp(value, 0, 6, 0) + 0.5f); break;
            case Click: click_ = finiteClamp(value, 0, 1, 0.4f); break;
            case Leak: leak_ = finiteClamp(value, 0, 1, 0.3f); break;
            case Level: level_ = finiteClamp(value, 0, 1, 0.8f); break;
            default: break;
        }
    }

    void setCv(int input, float value) {
        if (input >= 0 && input < kVoices) voct_[input] = finiteClamp(value, -5, 5, 0);
        else if (input >= kGateBase && input < kGateBase + kVoices) {
            const int voice = input - kGateBase;
            const bool high = value >= 0.5f;
            if (high == gate_[voice]) return;
            if (high) {
                bool anyHeld = false;
                for (bool held : gate_) anyHeld = anyHeld || held;
                if (!anyHeld) percEnv_ = 1;         // percussie: alleen op de eerste toets
                note_[voice] = static_cast<int>(std::floor(60 + 12 * voct_[voice] + 0.5f));
            }
            gate_[voice] = high;
            clickEnv_ += 1;                          // contact open of dicht: een tik
            if (clickEnv_ > 2) clickEnv_ = 2;
        }
        else if (input == kSwell) swell_ = finiteClamp(value, -1, 1, 0);
    }
    float cvOut(int) const { return 0; }

    void Process(const float* const*, float* const* out, int frames) {
        // Per blok: welke wielen worden afgetapt, en hoe sterk.
        static constexpr int kOffsets[9] = {-12, 7, 0, 12, 19, 24, 28, 31, 36};
        float target[kWheels] = {};
        float percTarget[kWheels] = {};
        const float percLevel = percussion_ == 0 ? 0 : percSoft_ ? 0.5f : 1.0f;
        const float barScale = percussion_ != 0 && !percSoft_ ? 0.71f : 1.0f;   // Normal zet de trekstangen 3 dB terug
        for (int voice = 0; voice < kVoices; ++voice) {
            if (!gate_[voice]) continue;
            for (int bar = 0; bar < 9; ++bar)
                if (barGain_[bar] > 0) target[wheelFor(note_[voice] + kOffsets[bar])] += barGain_[bar] * barScale;
            if (percussion_ != 0)
                percTarget[wheelFor(note_[voice] + (percussion_ == 1 ? 12 : 19))] += percLevel;
        }
        if (leak_ > 0) {
            // Wielen in hetzelfde vak van de generator (vier octaven uit elkaar) lekken in elkaar.
            float leaked[kWheels] = {};
            for (int wheel = 0; wheel < kWheels; ++wheel) {
                if (target[wheel] <= 0) continue;
                if (wheel + 48 < kWheels) leaked[wheel + 48] += target[wheel];
                if (wheel - 48 >= 0) leaked[wheel - 48] += target[wheel];
                if (wheel + 1 < kWheels) leaked[wheel + 1] += target[wheel] * 0.3f;
            }
            for (int wheel = 0; wheel < kWheels; ++wheel) target[wheel] += leaked[wheel] * leak_ * 0.02f;
        }
        int active[kWheels], activeCount = 0;
        for (int wheel = 0; wheel < kWheels; ++wheel) {
            wheelTarget_[wheel] = target[wheel];
            percGain_[wheel] = percTarget[wheel];
            if (target[wheel] > 0 || percTarget[wheel] > 0 || wheelGain_[wheel] > 1e-5f) active[activeCount++] = wheel;
            else wheelGain_[wheel] = 0;
        }
        const float gain = finiteClamp(level_ + swell_, 0, 1, 0.8f);
        const float depth = vibrato_ == 0 ? 0 : kDepthMs[(vibrato_ - 1) % 3] * 0.001f * sampleRate_;
        const bool chorus = vibrato_ > 3;

        for (int frame = 0; frame < frames; ++frame) {
            ++counter_;
            float sum = 0;
            for (int index = 0; index < activeCount; ++index) {
                const int wheel = active[index];
                wheelGain_[wheel] += contact_ * (wheelTarget_[wheel] - wheelGain_[wheel]);
                const float amplitude = wheelGain_[wheel] + percGain_[wheel] * percEnv_;
                // De wielen lopen altijd door: fase = teller maal stap (wikkelt vanzelf).
                const std::uint32_t phase = counter_ * increment_[wheel];
                const std::uint32_t position = phase >> (32 - kTableBits);
                const float fraction = static_cast<float>(phase & kFractionMask) * (1.0f / (kFractionMask + 1));
                sum += amplitude * (table_[position] + (table_[position + 1] - table_[position]) * fraction);
            }
            percEnv_ *= percDecay_;
            // Key click: een korte, doffe ruisstoot bij elk contact.
            if (clickEnv_ > 1e-4f) {
                noise_ = noise_ * 1664525u + 1013904223u;
                const float white = static_cast<float>(static_cast<std::int32_t>(noise_)) * (1.0f / 2147483648.0f);
                clickLp_ += 0.35f * (white - clickLp_);
                sum += clickLp_ * clickEnv_ * click_ * 1.2f;
                clickEnv_ *= clickDecay_;
            }
            float y = sum * 0.11f;
            if (depth > 0) y = scanner(y, depth, chorus);
            y = std::tanh(y * gain * 1.4f);
            out[0][frame] = y;
        }
    }

private:
    static constexpr int kTableBits = 10, kTable = 1 << kTableBits;
    static constexpr std::uint32_t kFractionMask = (1u << (32 - kTableBits)) - 1;
    static constexpr int kDelay = 256;
    static constexpr float kDepthMs[3] = {0.3f, 0.6f, 1.0f};   // top-top, V1..V3

    /** Wiel voor een MIDI-noot, met foldback aan beide einden. */
    static int wheelFor(int midi) {
        while (midi > kLowestWheelMidi + kWheels - 1) midi -= 12;
        while (midi < kLowestWheelMidi) midi += 12;
        return midi - kLowestWheelMidi;
    }

    /** Scanner-vibrato: een aftaklijn waar een driehoek op 6,9 Hz overheen loopt. */
    float scanner(float input, float depthSamples, bool chorus) {
        line_[writeIndex_] = input;
        scanPhase_ += 6.87f / sampleRate_;
        if (scanPhase_ >= 1) scanPhase_ -= 1;
        const float triangle = scanPhase_ < 0.5f ? 2 * scanPhase_ : 2 - 2 * scanPhase_;
        const float delay = 1 + depthSamples * triangle;
        const float read = static_cast<float>(writeIndex_) - delay;
        const int base = static_cast<int>(std::floor(read));
        const float fraction = read - base;
        const float a = line_[(base + kDelay) & (kDelay - 1)], b = line_[(base + 1 + kDelay) & (kDelay - 1)];
        writeIndex_ = (writeIndex_ + 1) & (kDelay - 1);
        const float wet = a + (b - a) * fraction;
        return chorus ? 0.6f * (input + wet) : wet;
    }

    float sampleRate_ = 44100;
    float table_[kTable + 1] = {};
    std::uint32_t increment_[kWheels] = {};
    float wheelGain_[kWheels] = {}, wheelTarget_[kWheels] = {}, percGain_[kWheels] = {};
    float barGain_[9] = {};
    float voct_[kVoices] = {};
    int note_[kVoices] = {};
    bool gate_[kVoices] = {};
    float line_[kDelay] = {};
    float contact_ = 0.02f, clickDecay_ = 0.99f, percDecay_ = 0.9999f;
    float click_ = 0.4f, leak_ = 0.3f, level_ = 0.8f, swell_ = 0;
    float percEnv_ = 0, clickEnv_ = 0, clickLp_ = 0, scanPhase_ = 0;
    std::uint32_t counter_ = 0, noise_ = 22222;
    int percussion_ = 0, vibrato_ = 0, writeIndex_ = 0;
    bool percSoft_ = false;
};

}  // namespace mmb_dsp
