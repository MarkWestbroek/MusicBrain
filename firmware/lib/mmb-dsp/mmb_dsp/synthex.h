#pragma once
// Synthex: een polyfone stem naar de Elka Synthex (1981, ontwerp Mario Maggi).
//
// Opgebouwd naar het schema (Elka Synthex schematic diagrams, 1-6-83: blad 1
// blokschema, blad 4 stemkaart 410CST5800, en de kalibratie-instructie):
//
//   - Twee oscillatoren per stem. Op het apparaat zijn ze digitaal: tellers
//     op een klok van 4 MHz, daardoor stabiel gestemd. Golfvorm ramp
//     (zaag), square of pulse (met PW), voetmaat 16'/8'/4'/2', oscillator 2
//     met Transpose en Detune en een Sync-schakelaar.
//   - Ruis en een menger met 4-bit volumes (CMOS-schakelaars met binair
//     gewogen weerstanden: 16 stappen, knop 0..10). Ring zet het product
//     van beide oscillatoren op de plek van oscillator 2.
//   - Filter: vier OTA-trappen achter elkaar (330 pF per trap) met
//     terugkoppeling voor de resonantie. CMOS-schakelaars kiezen de aftakking
//     en schakelen trappen om, zodat hetzelfde filter LP, BP of HP is. Hier:
//     vier eenpolige trappen (TPT) met een zachte begrenzer in de lus en de
//     modi als mengsel van de trapuitgangen (LP 24 dB, BP 12 dB, HP 24 dB).
//   - Twee envelopes (filter en versterker), analoog met digitaal gekozen
//     tijden (een 4051 kiest tussen weerstanden): ADSR in knopstanden 0..10.
//   - LFO met routing naar oscillatoren, PW, filter en versterker, glide, en
//     een stereochorus achter de som.
//   - De joystick: X buigt de toonhoogte (V/Oct), Y stuurt het filter.
//
// Eigen model naar de topologie, op meting; geen simulatie per onderdeel.
// Acht stem-cellen (V/Oct + gate). Header-only; gedeeld door Teensy en browser.
#include "bbd_chorus.h"
#include "oversample.h"

namespace mmb_dsp {

class Synthex {
public:
    static constexpr int kVoices = 8;
    enum Control {
        O1Octave, O1Wave, O1Level,
        O2Octave, O2Transpose, O2Detune, O2Wave, O2Level, Sync, Ring,
        Pw, Noise,
        Freq, Res, EnvAmt, Kbd, Mode,
        FA, FD, FS, FR, AA, AD, AS, AR,
        LfoRate, LfoWave, LfoOsc, LfoPw, LfoVcf, LfoVca,
        Glide, Tune, Chorus, Level,
        kControls
    };
    // CV's: 0..7 V/Oct per cel, 8 bend (joystick X), 9 joystick Y, 10..17 gates.
    static constexpr int kBend = kVoices, kJoyY = kVoices + 1, kGateBase = kVoices + 2, kCvIns = 2 * kVoices + 2;
    static constexpr int kCvOuts = 0;
    static constexpr float kDefaults[kControls] = {
        2, 0, 10,
        2, 0, 6, 0, 8, 0, 0,
        0.3f, 0,
        6, 2, 4, 3, 0,
        0.5f, 5, 6, 4, 0.5f, 5, 8, 4,
        5, 0, 0, 0, 0, 0,
        0, 0, 1, 0.8f,
    };

    void Init(float sampleRate) {
        *this = Synthex();
        sampleRate_ = finiteClamp(sampleRate, 8000, 192000, 44100);
        chorus_.Init(sampleRate_);
        chorus_.set_rate(0.55f); chorus_.set_depth(0.55f); chorus_.set_delay(9.0f);
        chorus_.set_feedback(0); chorus_.set_mix(0.5f); chorus_.set_spread(1.0f); chorus_.set_age(0.2f); chorus_.set_tone(0.6f);
        for (int c = 0; c < kControls; ++c) setControl(c, kDefaults[c]);
        for (int v = 0; v < kVoices; ++v) voices_[v].noise = 0x1234567u + 7919u * v;
    }

    void setControl(int control, float value) {
        if (control < 0 || control >= kControls) return;
        static constexpr float kLow[kControls] = {0, 0, 0, 0, -12, -50, 0, 0, 0, 0, 0.05f, 0, 0, 0, 0, 0, 0,
                                                  0, 0, 0, 0, 0, 0, 0, 0, 0.05f, 0, 0, 0, 0, 0, 0, -12, 0, 0};
        static constexpr float kHigh[kControls] = {3, 2, 10, 3, 12, 50, 2, 10, 1, 1, 0.5f, 10, 10, 10, 10, 10, 2,
                                                   10, 10, 10, 10, 10, 10, 10, 10, 20, 3, 1, 1, 1, 1, 1, 12, 1, 1};
        control_[control] = finiteClamp(value, kLow[control], kHigh[control], kDefaults[control]);
        // Envelope-tijden: knop 0..10 → 2 ms .. 10 s, exponentieel.
        if (control >= FA && control <= AR && control != FS && control != AS)
            rate_[control - FA] = 1 - std::exp(-1 / (0.002f * std::pow(5000.0f, control_[control] / 10) * sampleRate_));
    }

    void setCv(int input, float value) {
        if (input >= 0 && input < kVoices) voct_[input] = finiteClamp(value, -5, 5, 0);
        else if (input == kBend) bend_ = finiteClamp(value, -2, 2, 0);
        else if (input == kJoyY) joy_ = finiteClamp(value, -1, 1, 0);
        else if (input >= kGateBase && input < kGateBase + kVoices) {
            Voice& voice = voices_[input - kGateBase];
            const bool high = value >= 0.5f;
            if (high && !voice.gate) {
                voice.target = voct_[input - kGateBase];
                if (!voice.sounding) voice.pitch = voice.target;    // eerste noot: geen glide
                voice.stageF = voice.stageA = 1;                    // attack
                voice.sounding = true;
            } else if (!high && voice.gate) voice.stageF = voice.stageA = 4;   // release
            voice.gate = high;
        }
    }
    float cvOut(int) const { return 0; }

    void Process(const float* const*, float* const* out, int frames) {
        const float* c = control_;
        const float inv = 1 / sampleRate_;
        const float glide = c[Glide] <= 0.001f ? 1.0f : 1 - std::exp(-1 / (c[Glide] * 2.0f * sampleRate_));
        const float lfoInc = c[LfoRate] * inv;
        const float oct1 = c[O1Octave] - 2, oct2 = c[O2Octave] - 2;   // 4' = toonhoogte van V/Oct
        const float semi2 = c[O2Transpose] / 12 + c[O2Detune] / 1200;
        const float gain1 = std::floor(c[O1Level] * 1.5f + 0.5f) / 15;  // 16 stappen
        const float gain2 = std::floor(c[O2Level] * 1.5f + 0.5f) / 15;
        const float gainN = std::floor(c[Noise] * 1.5f + 0.5f) / 15;
        const int wave1 = static_cast<int>(c[O1Wave] + 0.5f), wave2 = static_cast<int>(c[O2Wave] + 0.5f);
        const bool sync = c[Sync] >= 0.5f, ring = c[Ring] >= 0.5f;
        const int mode = static_cast<int>(c[Mode] + 0.5f);
        const float k = c[Res] / 10 * 3.9f;                                // terugkoppeling, ~4 = zingen
        for (int frame = 0; frame < frames; ++frame) {
            // LFO (gedeeld): driehoek, blok, zaag of sample & hold.
            lfoPhase_ += lfoInc;
            if (lfoPhase_ >= 1) { lfoPhase_ -= 1; lfoNoise_ = lfoNoise_ * 1664525u + 1013904223u; lfoHold_ = static_cast<float>(lfoNoise_ >> 8) / 8388608.0f - 1; }
            const int lw = static_cast<int>(c[LfoWave] + 0.5f);
            const float lfo = lw == 0 ? (lfoPhase_ < 0.5f ? 4 * lfoPhase_ - 1 : 3 - 4 * lfoPhase_)
                            : lw == 1 ? (lfoPhase_ < 0.5f ? 1.0f : -1.0f)
                            : lw == 2 ? 2 * lfoPhase_ - 1 : lfoHold_;
            const bool update = (counter_++ & 7) == 0;
            float sum = 0;
            for (Voice& v : voices_) {
                if (!v.sounding) continue;
                if (update) {
                    v.pitch += (v.target - v.pitch) * (1 - std::pow(1 - glide, 8.0f));
                    // Filter: knop 0..10 = 20 Hz .. 20 kHz, plus envelope, toetsenbord, LFO, joystick.
                    const float octaves = c[Freq] + c[EnvAmt] * 0.8f * v.envF + c[Kbd] / 10 * (v.pitch - 0.0f)
                                        + c[LfoVcf] * 2 * lfo + joy_ * 3;
                    const float fc = finiteClamp(20.0f * std::exp2(octaves), 20, 0.45f * sampleRate_, 1000);
                    const float g = std::tan(3.14159265f * fc * inv);
                    v.g = g / (1 + g);
                }
                // Envelopes: aanval naar 1 (met een korte overschrijding, zoals een RC naar een hogere spanning).
                envelope(v.envF, v.stageF, rate_[0], rate_[1], c[FS] / 10, rate_[3]);
                envelope(v.envA, v.stageA, rate_[4], rate_[5], c[AS] / 10, rate_[7]);
                if (v.stageA == 0 && v.envA < 1e-4f) { v.sounding = false; v.envA = 0; continue; }
                // Oscillatoren.
                const float base = v.pitch + bend_ + c[LfoOsc] * lfo + c[Tune] / 12;
                const float inc1 = finiteClamp(261.6256f * std::exp2(base + oct1) * inv, 0, 0.45f, 0.01f);
                const float inc2 = finiteClamp(261.6256f * std::exp2(base + oct2 + semi2) * inv, 0, 0.45f, 0.01f);
                const float pw = finiteClamp(c[Pw] + c[LfoPw] * 0.45f * lfo, 0.03f, 0.5f, 0.3f);
                v.phase1 += inc1;
                bool wrapped = false;
                if (v.phase1 >= 1) { v.phase1 -= 1; wrapped = true; }
                v.phase2 += inc2;
                if (v.phase2 >= 1) v.phase2 -= 1;
                if (sync && wrapped) v.phase2 = v.phase1 * inc2 / inc1;
                const float s1 = wave(wave1, v.phase1, inc1, pw);
                float s2 = wave(wave2, v.phase2, inc2, pw);
                if (ring) s2 = s1 * s2;
                v.noise = v.noise * 1664525u + 1013904223u;
                const float noise = static_cast<float>(static_cast<int32_t>(v.noise)) * (1.0f / 2147483648.0f);
                const float x = (s1 * gain1 + s2 * gain2 + noise * gainN) * 0.45f;
                // Vier OTA-trappen met resonantie in de lus.
                const float u = std::tanh(x - k * v.s[3]);
                float in = u;
                float y[4];
                for (int p = 0; p < 4; ++p) {
                    const float vv = (in - v.z[p]) * v.g;
                    y[p] = vv + v.z[p];
                    v.z[p] = y[p] + vv;
                    in = y[p];
                }
                for (int p = 0; p < 4; ++p) v.s[p] = y[p];
                float f;
                if (mode == 0) f = y[3];
                else if (mode == 1) f = 2 * (y[1] - y[3]);                 // bandpass
                else f = u - 4 * y[0] + 6 * y[1] - 4 * y[2] + y[3];         // hoogdoorlaat 24 dB
                const float vca = v.envA * (1 + c[LfoVca] * 0.5f * (lfo - 1));
                sum += f * vca * (1 + 0.25f * k);
            }
            float pair[2] = {std::tanh(sum * 1.1f), 0};
            pair[1] = pair[0];
            if (c[Chorus] >= 0.5f) chorus_.Process(pair, false);
            out[0][frame] = pair[0] * c[Level];
            out[1][frame] = pair[1] * c[Level];
        }
    }

private:
    struct Voice {
        float pitch = 0, target = 0, phase1 = 0, phase2 = 0.37f, envF = 0, envA = 0, g = 0.1f;
        float z[4] = {}, s[4] = {};
        int stageF = 0, stageA = 0;      // 0 uit, 1 attack, 2 decay/sustain, 4 release
        uint32_t noise = 1;
        bool gate = false, sounding = false;
    };

    static float blep(float t, float dt) {
        if (t < dt) { t /= dt; return t + t - t * t - 1; }
        if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
        return 0;
    }
    static float wave(int shape, float phase, float dt, float pw) {
        if (shape == 0) return 2 * phase - 1 - blep(phase, dt);                         // ramp
        const float width = shape == 1 ? 0.5f : pw;                                      // square / pulse
        float shifted = phase + (1 - width);
        if (shifted >= 1) shifted -= 1;
        return (phase < width ? 1.0f : -1.0f) + blep(phase, dt) - blep(shifted, dt);
    }
    static void envelope(float& level, int& stage, float attack, float decay, float sustain, float release) {
        if (stage == 1) { level += attack * (1.25f - level); if (level >= 1) { level = 1; stage = 2; } }
        else if (stage == 2) level += decay * (sustain - level);
        else if (stage == 4) { level += release * (0 - level); if (level < 1e-4f) { level = 0; stage = 0; } }
    }

    Voice voices_[kVoices];
    BbdChorus chorus_;
    float control_[kControls] = {};
    float rate_[8] = {};
    float voct_[kVoices] = {};
    float sampleRate_ = 44100, bend_ = 0, joy_ = 0, lfoPhase_ = 0, lfoHold_ = 0;
    uint32_t lfoNoise_ = 99991u, counter_ = 0;
};

}  // namespace mmb_dsp
