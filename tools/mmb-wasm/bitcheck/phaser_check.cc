// Bit-identiteit: de oude AudioEffectPhaser::update()-rekenkunde (letterlijk
// uit git HEAD, zonder AudioStream) tegen de nieuwe schil op mmb_dsp::Phaser.
// Vergeleken op int16, precies wat de schil de graaf in stuurt.
#include <cstdio>
#include <cstdint>
#include "mmb_dsp/phaser.h"

// ---- oud, verbatim uit PhaserModule.h (HEAD) -----------------------------
struct Oud {
    static constexpr int kStages = 6;
    static float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }
    void rate(float hz)     { lfoInc_ = (hz < 0.0f ? 0.0f : hz) / 44100.0f; }   // AUDIO_SAMPLE_RATE_EXACT op T4
    void depth(float d)     { depth_ = clampf(d, 0.0f, 1.0f); }
    void feedback(float f)  { feedback_ = clampf(f, 0.0f, 0.95f); }
    void mix(float m)       { mix_ = clampf(m, 0.0f, 1.0f); }
    int16_t sample(int16_t d) {
        lfoPhase_ += lfoInc_;
        if (lfoPhase_ >= 1.0f) lfoPhase_ -= 1.0f;
        const float tri = (lfoPhase_ < 0.5f) ? (lfoPhase_ * 2.0f) : (2.0f - lfoPhase_ * 2.0f);
        const float sweep = tri * depth_;
        const float g = 0.1f + 0.85f * sweep;
        float x = d * (1.0f / 32768.0f);
        x += fbState_ * feedback_;
        float y = x;
        for (int s = 0; s < kStages; ++s) { const float in = y; y = -g * in + ap_[s]; ap_[s] = in + g * y; }
        fbState_ = y;
        float out = x * (1.0f - mix_) + y * mix_;
        if (out >  1.0f) out =  1.0f;
        if (out < -1.0f) out = -1.0f;
        return static_cast<int16_t>(out * 32767.0f);
    }
    float ap_[kStages] = { 0.0f }; float fbState_ = 0.0f; float lfoPhase_ = 0.0f;
    float lfoInc_ = 0.5f / 44100.0f; float depth_ = 0.7f; float feedback_ = 0.3f; float mix_ = 0.5f;
};

// ---- nieuw: de schil uit PhaserModule.h ------------------------------------
struct Nieuw {
    mmb_dsp::Phaser k_;
    Nieuw() { k_.Init(44100.0f); }
    int16_t sample(int16_t d) {
        const float out = k_.Tick(d * (1.0f / 32768.0f));
        return static_cast<int16_t>(out * 32767.0f);
    }
};

int main() {
    Oud a; Nieuw b;
    struct Stand { float rate, depth, fbk, mix; };
    const Stand st[] = { {0.5f,0.7f,0.3f,0.5f}, {8,1,0.95f,1}, {0.05f,0,0,0.2f}, {3,0.4f,0.8f,0.9f}, {-1,2,2,-1} };
    uint32_t rng = 12345; long n = 0, mism = 0;
    bool first = true;
    for (const auto& s : st) {
        if (!first) {   // standaardwaarden eerst ongemoeid laten
            a.rate(s.rate); b.k_.rate(s.rate); a.depth(s.depth); b.k_.depth(s.depth);
            a.feedback(s.fbk); b.k_.feedback(s.fbk); a.mix(s.mix); b.k_.mix(s.mix);
        }
        first = false;
        for (int i = 0; i < 88200; ++i, ++n) {
            rng = rng * 1664525u + 1013904223u;
            const int16_t x = static_cast<int16_t>(rng >> 16);   // volle-schaal ruis
            if (a.sample(x) != b.sample(x)) ++mism;
        }
    }
    std::printf("%ld samples, %ld verschillend\n", n, mism);
    std::puts(mism == 0 ? "BIT-IDENTIEK" : "AFWIJKING");
    return mism == 0 ? 0 : 1;
}
