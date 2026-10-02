#pragma once
// Ritmebox: voorgeprogrammeerde ritmes op de berekende CR-78-stemmen.
//
// Elf stemmen (de instrumenten van de CR-78) uit mmb_dsp::Cr78, een
// patroontabel met per ritme een A- en een B-maat, en de bediening van een
// ritmebox: ritmekeuze, variatie (A, B of A+B om en om), tempo, start/stop,
// accent en vier groepsvolumes. Start/stop met de Run-knop of met een puls op
// de Start-ingang (elke puls wisselt, zoals de voetschakelaar). Klok intern
// (Tempo) of extern: een puls per tel (bijvoorbeeld Clock Beat); de box meet
// de afstand tussen de tellen en verdeelt de stappen daarover, dus ook
// triolen lopen mee.
//
// De patronen komen uit de "Rhythm Patterns"-pagina van de Roland CR-78
// Service Notes (20 juni 1979), met de hand overgenomen uit het notenschrift.
// Per ritme staat erbij hoe zeker die overname is; Samba, Mambo, Cha-cha,
// Beguine en Rhumba zijn in de beschikbare scan niet betrouwbaar te lezen en
// ontbreken nog.
//
// Header-only; gedeeld door Teensy en browser.
#include "cr78.h"
#include "oversample.h"
#include <cstdint>

namespace mmb_dsp {

/** Eén maat van een ritme: per instrument een regel van `steps` tekens
 *  ('x' = slag, '.' = niets); een lege regel (nullptr) = zwijgt. */
struct RhythmBar {
    const char* bd; const char* lc; const char* lb; const char* hb; const char* sd;
    const char* rs; const char* cl; const char* cb; const char* ma; const char* hh;
    const char* cy; const char* acc;
};
struct RhythmPattern {
    const char* name;
    int steps;          ///< stappen per maat: 16 (zestienden), 12 (triolen in 4/4 of zestienden in 3/4)
    int beats;          ///< tellen per maat: 4, of 3 bij de wals
    bool sure;          ///< overname uit de notatie zeker (false = nog bevestigen)
    RhythmBar a, b;
};

// Instrumentvolgorde in RhythmBar: BD LC LB HB SD RS CL CB MA HH CY.
#define RB_NONE nullptr
inline const RhythmPattern kCr78Patterns[] = {
    {"Rock 1", 16, 4, true,
     {"x.....x.x.......", RB_NONE, RB_NONE, RB_NONE, "....x.......x...", RB_NONE, RB_NONE, RB_NONE, RB_NONE, "x.x.x.x.x.x.x.x.", RB_NONE, "x...x...x...x..."},
     {"x.......x.......", RB_NONE, RB_NONE, RB_NONE, "....x.x.....x...", RB_NONE, RB_NONE, RB_NONE, RB_NONE, "x.x.x.x.x.x.x.x.", RB_NONE, "x...x...x...x..."}},
    {"Rock 2", 16, 4, true,
     {"x.......x.x.....", RB_NONE, RB_NONE, RB_NONE, "....x.......x...", RB_NONE, RB_NONE, RB_NONE, RB_NONE, "x.x.x.x.x.x.x.x.", RB_NONE, "x...x...x...x..."},
     {"x.x...x...x.....", RB_NONE, RB_NONE, RB_NONE, "....x.......x...", RB_NONE, RB_NONE, RB_NONE, RB_NONE, "x.x.x.x.x.x.x.x.", RB_NONE, "....x.......x..."}},
    {"Rock 3", 16, 4, true,
     {"x.......x.x.....", RB_NONE, RB_NONE, RB_NONE, "....x..x....x...", RB_NONE, RB_NONE, RB_NONE, RB_NONE, "x.x.x.x.x.x.x.x.", RB_NONE, "x...x.......x..."},
     {"x..x..x.x.x....x", RB_NONE, RB_NONE, RB_NONE, "....x..x....x...", RB_NONE, RB_NONE, RB_NONE, RB_NONE, "x.x.x.x.x.x.x.x.", RB_NONE, "....x.......x..."}},
    {"Rock 4", 16, 4, false,
     {"x......xx.x.....", RB_NONE, RB_NONE, RB_NONE, "....x.......x...", RB_NONE, RB_NONE, RB_NONE, "xxxxxxxxxxxxxxxx", RB_NONE, "..x.......x.....", "x.......x.x.x..."},
     {"x.x....xx......x", RB_NONE, RB_NONE, RB_NONE, "....x..x....x...", RB_NONE, RB_NONE, RB_NONE, "xxxxxxxxxxxxxxxx", RB_NONE, "..x.......x.....", "....x.......x..."}},
    {"Disco 1", 16, 4, false,
     {"x......xx.......", RB_NONE, RB_NONE, RB_NONE, "....x.......x...", RB_NONE, RB_NONE, RB_NONE, "x.x.x.x.x.x.x.x.", RB_NONE, "..x..........x..", "....x.......x..."},
     {"x......xx....x..", RB_NONE, RB_NONE, RB_NONE, "....x.......x...", RB_NONE, RB_NONE, RB_NONE, "x.x.x.x.x.x.x.x.", RB_NONE, "..x..........x..", "....x.......x..."}},
    {"Disco 2", 16, 4, false,
     {"....x.......x...", "..x...x.........", RB_NONE, RB_NONE, "....x.......x...", RB_NONE, RB_NONE, RB_NONE, "..x...x...x...x.", RB_NONE, "x...........x...", "....x.......x..."},
     {"....x.......x.x.", "..x...x.........", RB_NONE, RB_NONE, "....x.......x...", RB_NONE, RB_NONE, RB_NONE, "..x...x...x...x.", RB_NONE, "x...........x...", "....x.......x..."}},
    {"Waltz", 12, 3, true,
     {"x...........", RB_NONE, RB_NONE, RB_NONE, "....x...x...", RB_NONE, RB_NONE, RB_NONE, RB_NONE, RB_NONE, "x.......x...", "........x..."},
     {"x...........", RB_NONE, RB_NONE, RB_NONE, "....x...x...", RB_NONE, RB_NONE, RB_NONE, RB_NONE, RB_NONE, "x......xx...", "........x..."}},
    {"Shuffle", 12, 4, true,
     {"x....xx.....", RB_NONE, RB_NONE, RB_NONE, "...x.....x..", RB_NONE, RB_NONE, RB_NONE, RB_NONE, RB_NONE, "x.xx.xx.xx.x", "x..x..x..x.."},
     {"x.....x.....", RB_NONE, RB_NONE, RB_NONE, "..x..x..x..x", RB_NONE, RB_NONE, RB_NONE, RB_NONE, RB_NONE, "x.xx.xx.xx.x", "x..x..x..x.."}},
    {"Slow rock", 12, 4, true,
     {"x....xx....x", RB_NONE, RB_NONE, RB_NONE, "...x.....x..", RB_NONE, RB_NONE, RB_NONE, RB_NONE, "xxxxxxxxxxxx", RB_NONE, "x..x..x..x.."},
     {"x....xx...xx", RB_NONE, RB_NONE, RB_NONE, "...x.....x..", RB_NONE, RB_NONE, RB_NONE, RB_NONE, "xxxxxxxxxxxx", RB_NONE, "x..x..x..x.."}},
    {"Swing", 12, 4, true,
     {"x.....x.....", RB_NONE, RB_NONE, RB_NONE, RB_NONE, RB_NONE, RB_NONE, RB_NONE, "...x.....x..", RB_NONE, "x....xx....x", "x..x..x..x.."},
     {"x.....x.....", RB_NONE, RB_NONE, RB_NONE, ".....x..x...", RB_NONE, RB_NONE, RB_NONE, "...x.....x..", RB_NONE, "x....xx....x", "x.....x.x..."}},
    {"Foxtrot", 16, 4, true,
     {"x.......x.......", RB_NONE, RB_NONE, RB_NONE, "....x.......x...", RB_NONE, RB_NONE, RB_NONE, "x.......x.......", RB_NONE, "....x.......x...", "............x..."},
     {"x.......x.......", RB_NONE, RB_NONE, RB_NONE, "....x.......x...", RB_NONE, RB_NONE, RB_NONE, "x.......x.......", RB_NONE, "....x.......x...", "............x..."}},
    {"Tango", 16, 4, true,
     {"x...x...x...x.x.", RB_NONE, RB_NONE, RB_NONE, "x...x...x...x.x.", RB_NONE, RB_NONE, RB_NONE, RB_NONE, RB_NONE, "..............x.", "..............x."},
     {"x...x...x...x.x.", RB_NONE, RB_NONE, RB_NONE, "x...x...x...x.x.", RB_NONE, RB_NONE, RB_NONE, RB_NONE, RB_NONE, "..............x.", "..............x."}},
    {"Boogie", 12, 4, true,
     {"x.....x.x...", RB_NONE, RB_NONE, RB_NONE, "...x.....x..", RB_NONE, RB_NONE, RB_NONE, "........x...", RB_NONE, "x..x..x..x..", "x..x..x..x.."},
     {"x.x...x.x...", RB_NONE, RB_NONE, RB_NONE, "...x.....x..", RB_NONE, RB_NONE, RB_NONE, "..x..x..x..x", RB_NONE, "x..x..x..x..", "x..x..x..x.."}},
    {"Enka", 16, 4, true,
     {"x...x...x...x...", RB_NONE, RB_NONE, RB_NONE, "..xx..x...xx..x.", RB_NONE, RB_NONE, RB_NONE, RB_NONE, "x.x.x.x.x.x.x.x.", RB_NONE, "x.......x......."},
     {"x.....x.x...x...", RB_NONE, RB_NONE, RB_NONE, "..xxx.....x...x.", RB_NONE, RB_NONE, RB_NONE, RB_NONE, "x.x.x.x.x.x.x.x.", RB_NONE, "......x.x......."}},
    {"Bossa nova", 16, 4, true,
     {"x..xx..xx..xx..x", RB_NONE, RB_NONE, RB_NONE, RB_NONE, "x..x..x...x..x..", RB_NONE, RB_NONE, "xxxxxxxxxxxxxxxx", RB_NONE, "x.....x......x..", "....x.......x..."},
     {"x..xx..xx..xx..x", RB_NONE, RB_NONE, RB_NONE, RB_NONE, "x.x..x..x.x..x..", RB_NONE, RB_NONE, "xxxxxxxxxxxxxxxx", RB_NONE, "x.....x......x..", "....x.......x..."}},
};
#undef RB_NONE
constexpr int kCr78PatternCount = static_cast<int>(sizeof(kCr78Patterns) / sizeof(kCr78Patterns[0]));

class RhythmBox {
public:
    static constexpr int kVoices = 11;
    static constexpr int kMaxSteps = 16;
    enum Voice { BD, LC, LB, HB, SD, RS, CL, CB, MA, HH, CY };
    enum Control { Rhythm, Variation, Tempo, Run, ExtClock, Accent, Bass, Snare, Metal, Perc, Level, kControls };
    enum CvIn { StartIn, ClockIn, ResetIn, kCvIns };
    enum CvOut { StepOut, BarOut, AccentOut, kCvOuts };
    static constexpr float kDefaults[kControls] = {0, 2, 120, 1, 0, 0.6f, 0.8f, 0.8f, 0.7f, 0.7f, 0.8f};

    void Init(float sampleRate) {
        *this = RhythmBox();
        sampleRate_ = finiteClamp(sampleRate, 8000, 192000, 44100);
        // Instrument op elke stem: drumnummer in Cr78, toon, verval.
        static constexpr int kDrum[kVoices] = {0, 10, 9, 9, 1, 2, 3, 4, 7, 5, 6};
        static constexpr float kTone[kVoices] = {0.5f, 0.35f, 0.25f, 0.75f, 0.5f, 0.5f, 0.5f, 0.5f, 0.5f, 0.5f, 0.5f};
        static constexpr float kPan[kVoices] = {0, -0.3f, 0.35f, 0.5f, 0.05f, -0.2f, 0.4f, -0.45f, 0.3f, -0.25f, 0.25f};
        for (int v = 0; v < kVoices; ++v) {
            drums_[v].Init(sampleRate_);
            drums_[v].setDrum(kDrum[v]);
            drums_[v].setTone(kTone[v]);
            drums_[v].setLevel(1.0f);
            panL_[v] = std::sqrt(0.5f * (1 - kPan[v]));
            panR_[v] = std::sqrt(0.5f * (1 + kPan[v]));
        }
        loadPattern();
    }

    void setControl(int control, float value) {
        switch (control) {
            case Rhythm: {
                const int r = static_cast<int>(finiteClamp(value, 0, kCr78PatternCount - 1, 0) + 0.5f);
                if (r != rhythm_) { rhythm_ = r; loadPattern(); }
                break;
            }
            case Variation: variation_ = static_cast<int>(finiteClamp(value, 0, 2, 2) + 0.5f); break;
            case Tempo: bpm_ = finiteClamp(value, 30, 300, 120); break;
            case Run: running_ = value >= 0.5f; restart(); break;
            case ExtClock: extClock_ = value >= 0.5f; break;
            case Accent: accent_ = finiteClamp(value, 0, 1, 0.6f); break;
            case Bass: group_[0] = finiteClamp(value, 0, 1, 0.8f); break;
            case Snare: group_[1] = finiteClamp(value, 0, 1, 0.8f); break;
            case Metal: group_[2] = finiteClamp(value, 0, 1, 0.7f); break;
            case Perc: group_[3] = finiteClamp(value, 0, 1, 0.7f); break;
            case Level: level_ = finiteClamp(value, 0, 1, 0.8f); break;
            default: break;
        }
    }

    void setCv(int input, float value) {
        const bool high = value >= 0.5f;
        if (input == StartIn) {
            if (high && !startHigh_) { running_ = !running_; restart(); }
            startHigh_ = high;
        } else if (input == ClockIn) {
            if (high && !clockHigh_) clockEdge_ = true;
            clockHigh_ = high;
        } else if (input == ResetIn) {
            if (high && !resetHigh_) resetEdge_ = true;
            resetHigh_ = high;
        }
    }

    float cvOut(int output) const {
        if (output == StepOut) return stepGate_ > 0 ? 1.0f : 0.0f;
        if (output == BarOut) return barGate_ > 0 ? 1.0f : 0.0f;
        if (output == AccentOut) return accentGate_ > 0 ? 1.0f : 0.0f;
        return 0;
    }

    int step() const { return step_; }
    bool barIsB() const { return barB_; }
    bool running() const { return running_; }

    void Process(const float* const*, float* const* out, int frames) {
        if (resetEdge_) { resetEdge_ = false; restart(); }
        const int perBeat = pattern_.steps / pattern_.beats;
        const int pulse = static_cast<int>(0.010f * sampleRate_);      // 10 ms gates
        for (int frame = 0; frame < frames; ++frame) {
            if (running_) {
                bool fire = false;
                if (extClock_) {
                    // Externe tel: meet de afstand, verdeel de stappen erover.
                    ++sinceBeat_;
                    if (clockEdge_ && frame == 0) {
                        clockEdge_ = false;
                        if (sinceBeat_ < static_cast<double>(sampleRate_) * 4) beatSamples_ = sinceBeat_;
                        sinceBeat_ = 0;
                        // Op de tel: de volgende stap is het begin van een tel.
                        if (step_ >= 0) step_ = ((step_ / perBeat) + 1) * perBeat - 1;
                        stepInBeat_ = 0;
                        fire = true;
                    } else if (beatSamples_ > 0 && stepInBeat_ + 1 < perBeat &&
                               sinceBeat_ >= beatSamples_ * (stepInBeat_ + 1) / perBeat) {
                        ++stepInBeat_;
                        fire = true;
                    }
                } else {
                    const double stepLength = 60.0 * sampleRate_ / (bpm_ * perBeat);
                    if (++sinceStep_ >= stepLength) { sinceStep_ -= stepLength; if (sinceStep_ > stepLength) sinceStep_ = 0; fire = true; }
                }
                if (fire) advance(pulse);
            }
            float left = 0, right = 0;
            for (int v = 0; v < kVoices; ++v) {
                const float y = drums_[v].Tick() * gain_[v];
                left += y * panL_[v]; right += y * panR_[v];
            }
            if (stepGate_ > 0) --stepGate_;
            if (barGate_ > 0) --barGate_;
            if (accentGate_ > 0) --accentGate_;
            out[0][frame] = std::tanh(left * 0.9f) * level_;
            out[1][frame] = std::tanh(right * 0.9f) * level_;
        }
        clockEdge_ = false;
    }

private:
    struct Pattern {
        int steps = 16, beats = 4;
        uint16_t a[kVoices + 1] = {}, b[kVoices + 1] = {};   // laatste = accent
    };

    static uint16_t parse(const char* row, int steps) {
        uint16_t mask = 0;
        if (!row) return 0;
        for (int i = 0; i < steps && row[i]; ++i) if (row[i] == 'x') mask |= static_cast<uint16_t>(1u << i);
        return mask;
    }
    void loadPattern() {
        const RhythmPattern& src = kCr78Patterns[rhythm_];
        pattern_.steps = src.steps; pattern_.beats = src.beats;
        const char* const* ra = &src.a.bd;
        const char* const* rb = &src.b.bd;
        for (int v = 0; v <= kVoices; ++v) { pattern_.a[v] = parse(ra[v], src.steps); pattern_.b[v] = parse(rb[v], src.steps); }
        if (step_ >= src.steps) step_ = -1;
    }

    /** Volgende stap is de eerste van maat A (of B bij variatie B). */
    void restart() { step_ = -1; barB_ = variation_ == 1; sinceStep_ = 1e9; stepInBeat_ = 0; }

    void advance(int pulse) {
        const Pattern& p = pattern_;
        if (++step_ >= p.steps) {
            step_ = 0;
            barB_ = variation_ == 2 ? !barB_ : variation_ == 1;
        }
        if (step_ == 0) {
            barGate_ = pulse;
            if (variation_ != 2) barB_ = variation_ == 1;   // vaste variatie: geldt vanaf de één
        }
        stepGate_ = pulse;
        const uint16_t* bar = barB_ ? p.b : p.a;
        const bool accented = (bar[kVoices] >> step_) & 1u;
        if (accented) accentGate_ = pulse;
        static constexpr int kGroup[kVoices] = {0, 3, 3, 3, 1, 3, 3, 3, 2, 2, 2};
        for (int v = 0; v < kVoices; ++v) {
            if (!((bar[v] >> step_) & 1u)) continue;
            drums_[v].setAccent(accented ? 0.55f + 0.45f * accent_ : 0.55f - 0.25f * accent_);
            gain_[v] = group_[kGroup[v]];
            drums_[v].trigger();
        }
    }

    Cr78 drums_[kVoices];
    float panL_[kVoices] = {}, panR_[kVoices] = {}, gain_[kVoices] = {};
    Pattern pattern_;
    float sampleRate_ = 44100, bpm_ = 120, accent_ = 0.6f, level_ = 0.8f;
    float group_[4] = {0.8f, 0.8f, 0.7f, 0.7f};
    double sinceStep_ = 1e9, sinceBeat_ = 0, beatSamples_ = 0;
    int rhythm_ = 0, variation_ = 2, step_ = -1, stepInBeat_ = 0;
    int stepGate_ = 0, barGate_ = 0, accentGate_ = 0;
    bool barB_ = false, extClock_ = false, running_ = true;
    bool startHigh_ = false, clockHigh_ = false, clockEdge_ = false, resetHigh_ = false, resetEdge_ = false;
};

}  // namespace mmb_dsp
