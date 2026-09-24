#pragma once
/**
 * @file resonator.h
 * @brief Bank van twaalf gestemde snaar-resonatoren (sympathetische
 *        resonantie), float, header-only.
 * @details
 * Twaalf Karplus-Strong-achtige comb-resonatoren — een fractionele
 * feedback-delay met een demp-lowpass in de lus — gestemd op een schaal rond
 * een grondtoon. Het ingangssignaal exciteert ze allemaal tegelijk; snaren die
 * harmonisch verwant zijn aan wat je speelt gaan meeklinken, ook als ze niet
 * direct aangeslagen worden. De klankkast van een sitar of een piano,
 * berekend in plaats van gesampeld.
 *
 * Dit is de kernel die in `ResonatorModule.h` in een `AudioStream` zat
 * (`tp_mmb_resonator`, FW-FX-6), er letterlijk uit getild zodat de firmware
 * en de browser-simulator (`tools/mmb-wasm/resonator_wasm.cc`) dezelfde code
 * draaien. De rekenkunde is niet aangeraakt; alleen de sample rate komt nu
 * via `Init()` binnen in plaats van uit `AUDIO_SAMPLE_RATE_EXACT`, en de
 * delaybuffer levert de eigenaar aan.
 *
 * Gebruik: `Init(sr, buf)` met een buffer van `kStrings * kMaxLen` floats op
 * nul, dan per sample `Tick(x)`. Zonder buffer (`nullptr`, heap-OOM) geeft
 * `ready()` false en hoort de eigenaar het droge signaal door te laten.
 */
#include <cmath>
#include <cstdint>

namespace mmb_dsp {

class Resonator {
public:
    static constexpr int kStrings = 12;
    static constexpr int kMaxLen  = 1600;   ///< laagste ~27.6 Hz @ 44.1k.

    void Init(float sr, float* buf) {
        sr_  = sr > 1.0f ? sr : 44100.0f;
        buf_ = buf;
        retune();
    }
    bool ready() const { return buf_ != nullptr; }

    void setRoot(float semis)   { root_ = semis; retune(); }
    void setVoct(float v)       { voct_ = v; retune(); }
    void setScale(int s)        { scale_ = (s < 0 ? 0 : s > 4 ? 4 : s); retune(); }
    void setStructure(float v)  { structure_ = clamp01(v); retune(); }
    void setStructureCv(float v){ structCv_ = v; retune(); }
    void setDecay(float v)      { // perceptueel: ringtijd ~ 1/ln(1/fb), dus
                                  // kwadratisch naar fb→0.999 voor lange staart
                                  const float u = 1.0f - clamp01(v);
                                  feedback_ = 0.999f - 0.199f * u * u; }
    void setDamping(float v)    { // laag = donker: demp-lowpass-coëfficiënt
                                  damp_ = 0.05f + 0.9f * clamp01(v); }
    void setMix(float v)        { mix_ = clamp01(v); }
    void setLevel(float v)      { level_ = clamp01(v); }

    /** Eén sample: excitatie `x` → dry/wet-mengsel × level, níét geklemd. */
    inline float Tick(float x) {
        float wet = 0.0f;
        for (int s = 0; s < kStrings; ++s) wet += processString(s, x);
        wet *= (0.9f / kStrings);       // sommatie-normalisatie
        return (x * (1.0f - mix_) + wet * mix_) * level_;
    }

private:
    static float clamp01(float v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

    /** Eén snaar: fractionele feedback-delay met demp-lowpass (Karplus). */
    inline float processString(int s, float x) {
        float* b = buf_ + s * kMaxLen;
        const float d = delay_[s];
        // fractionele read op writePos - d
        float rp = wpos_[s] - d;
        while (rp < 0.0f) rp += kMaxLen;
        const int   r0 = static_cast<int>(rp);
        const int   r1 = (r0 + 1) % kMaxLen;
        const float fr = rp - r0;
        const float y = b[r0] + (b[r1] - b[r0]) * fr;
        // demp-lowpass in de lus (helderheid/verval)
        lp_[s] += damp_ * (y - lp_[s]);
        // schrijf excitatie + gedempte feedback
        b[wpos_[s]] = x * 0.5f + lp_[s] * feedback_;
        wpos_[s] = (wpos_[s] + 1) % kMaxLen;
        return y;
    }

    void retune() {
        // Semitoon-offsets per schaal (12 snaren, oplopend).
        static const int8_t kScales[5][kStrings] = {
            {0,1,2,3,4,5,6,7,8,9,10,11},                 // chromatisch
            {0,2,4,5,7,9,11,12,14,16,17,19},             // majeur
            {0,2,3,5,7,8,10,12,14,15,17,19},             // mineur
            {0,7,12,19,24,12,7,0,19,24,31,12},           // kwint/octaaf-stapel
            {0,12,19,24,28,31,34,36,38,40,42,43},        // harmonische reeks
        };
        const float baseNote = 36.0f + root_ + 12.0f * voct_;   // C2 = MIDI 36
        const float spread = clamp01(structure_ + structCv_);
        for (int s = 0; s < kStrings; ++s) {
            // structure spreidt de tuning uit (0 = strak op de schaal,
            // 1 = tot ~±0.5 semitoon detune per snaar voor koor-effect).
            const float detune = (s - kStrings * 0.5f) * spread * 0.08f;
            const float note = baseNote + kScales[scale_][s] + detune;
            const float hz = 8.1758f * std::exp2f(note / 12.0f);  // MIDI→Hz
            float d = sr_ / hz;
            if (d < 2.0f) d = 2.0f;
            if (d > kMaxLen - 2) d = kMaxLen - 2;
            delay_[s] = d;
        }
    }

    float  sr_ = 44100.0f;
    float* buf_ = nullptr;
    float  delay_[kStrings] = {};
    float  lp_[kStrings]    = {};
    int    wpos_[kStrings]  = {};

    float root_ = 0.0f, voct_ = 0.0f, structure_ = 0.3f, structCv_ = 0.0f;
    int   scale_ = 1;
    float feedback_ = 0.981f, damp_ = 0.5f, mix_ = 0.6f, level_ = 0.8f;  // = decay 0.7
};

}  // namespace mmb_dsp
