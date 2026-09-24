// Bit-identiteit: de oude ResonatorVoice-rekenkunde (letterlijk uit git
// HEAD, zonder AudioStream) tegen de nieuwe mmb_dsp::Resonator-kernel.
#include <cstdio>
#include <cstring>
#include <cmath>
#include <cstdint>
#include "mmb_dsp/resonator.h"

// ---- oud, verbatim uit ResonatorModule.h (HEAD) --------------------------
struct Oud {
    static constexpr int kStrings = 12, kMaxLen = 1600;
    float* buf_ = nullptr; float delay_[kStrings] = {}; float lp_[kStrings] = {}; int wpos_[kStrings] = {};
    float root_ = 0.0f, voct_ = 0.0f, structure_ = 0.3f, structCv_ = 0.0f; int scale_ = 1;
    float feedback_ = 0.981f, damp_ = 0.5f, mix_ = 0.6f, level_ = 0.8f;
    static float clamp01(float v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    void setRoot(float s) { root_ = s; retune(); }
    void setVoct(float v) { voct_ = v; retune(); }
    void setScale(int s) { scale_ = (s < 0 ? 0 : s > 4 ? 4 : s); retune(); }
    void setStructure(float v) { structure_ = clamp01(v); retune(); }
    void setStructureCv(float v) { structCv_ = v; retune(); }
    void setDecay(float v) { const float u = 1.0f - clamp01(v); feedback_ = 0.999f - 0.199f * u * u; }
    void setDamping(float v) { damp_ = 0.05f + 0.9f * clamp01(v); }
    void setMix(float v) { mix_ = clamp01(v); }
    void setLevel(float v) { level_ = clamp01(v); }
    inline float processString(int s, float x) {
        float* b = buf_ + s * kMaxLen; const float d = delay_[s];
        float rp = wpos_[s] - d; while (rp < 0.0f) rp += kMaxLen;
        const int r0 = static_cast<int>(rp); const int r1 = (r0 + 1) % kMaxLen; const float fr = rp - r0;
        const float y = b[r0] + (b[r1] - b[r0]) * fr;
        lp_[s] += damp_ * (y - lp_[s]);
        b[wpos_[s]] = x * 0.5f + lp_[s] * feedback_;
        wpos_[s] = (wpos_[s] + 1) % kMaxLen;
        return y;
    }
    void retune() {
        static const int8_t kScales[5][kStrings] = {
            {0,1,2,3,4,5,6,7,8,9,10,11},{0,2,4,5,7,9,11,12,14,16,17,19},{0,2,3,5,7,8,10,12,14,15,17,19},
            {0,7,12,19,24,12,7,0,19,24,31,12},{0,12,19,24,28,31,34,36,38,40,42,43}};
        const float baseNote = 36.0f + root_ + 12.0f * voct_;
        const float spread = clamp01(structure_ + structCv_);
        for (int s = 0; s < kStrings; ++s) {
            const float detune = (s - kStrings * 0.5f) * spread * 0.08f;
            const float note = baseNote + kScales[scale_][s] + detune;
            const float hz = 8.1758f * std::exp2f(note / 12.0f);
            float d = 44100.0f / hz;                     // AUDIO_SAMPLE_RATE_EXACT op T4
            if (d < 2.0f) d = 2.0f; if (d > kMaxLen - 2) d = kMaxLen - 2;
            delay_[s] = d;
        }
    }
    float tick(float x) {   // update()-lus zonder int16
        float wet = 0.0f;
        for (int s = 0; s < kStrings; ++s) wet += processString(s, x);
        wet *= (0.9f / kStrings);
        return (x * (1.0f - mix_) + wet * mix_) * level_;
    }
};

static float bufA[12 * 1600], bufB[12 * 1600];

int main() {
    Oud a; a.buf_ = bufA; a.retune();
    mmb_dsp::Resonator b; b.Init(44100.0f, bufB);
    // Een paar standen doorlopen, met instellingswissels halverwege.
    struct Stand { float root, voct, str, decay, damp, mix, lvl; int scale; };
    const Stand st[] = { {0,0,0.3f,0.7f,0.5f,0.6f,0.8f,1}, {5,0.5f,0.9f,0.95f,0.2f,1.0f,1.0f,4},
                         {-12,-1,0,0.1f,0.9f,0.3f,0.5f,0}, {7,0.25f,0.6f,0.99f,0.05f,0.8f,0.7f,3} };
    uint32_t rng = 12345; long n = 0, mism = 0; float maxdiff = 0;
    for (const auto& s : st) {
        a.setRoot(s.root); b.setRoot(s.root); a.setVoct(s.voct); b.setVoct(s.voct);
        a.setStructure(s.str); b.setStructure(s.str); a.setDecay(s.decay); b.setDecay(s.decay);
        a.setDamping(s.damp); b.setDamping(s.damp); a.setMix(s.mix); b.setMix(s.mix);
        a.setLevel(s.lvl); b.setLevel(s.lvl); a.setScale(s.scale); b.setScale(s.scale);
        a.setStructureCv(0.1f); b.setStructureCv(0.1f);
        for (int i = 0; i < 44100; ++i, ++n) {
            rng = rng * 1664525u + 1013904223u;
            const float x = (i % 11025 < 400) ? ((rng >> 8) / 16777216.0f - 0.5f) : 0.0f;  // ruisbursts
            const float ya = a.tick(x), yb = b.Tick(x);
            if (std::memcmp(&ya, &yb, sizeof(float)) != 0) { ++mism; float d = std::fabs(ya - yb); if (d > maxdiff) maxdiff = d; }
        }
    }
    std::printf("%ld samples, %ld verschillend (max %.3g)\n", n, mism, maxdiff);
    std::puts(mism == 0 ? "BIT-IDENTIEK" : "AFWIJKING");
    return mism == 0 ? 0 : 1;
}
