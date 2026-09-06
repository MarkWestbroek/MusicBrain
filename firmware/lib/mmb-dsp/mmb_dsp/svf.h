#pragma once
/**
 * @file svf.h
 * @brief State-variable filter (TPT/ZDF), float, header-only.
 * @details
 * De vorm van Andrew Simper (Cytomic, "Solving the continuous SVF equations
 * using trapezoidal integration"): twee geïntegreerde toestanden, één
 * `tan`-warp per parameterwissel, en lowpass/bandpass/highpass komen uit
 * dezelfde stap. Geen oversampling, geen niet-lineariteit — dit is het
 * schone, goedkope filter (een handvol vermenigvuldigingen per sample).
 *
 * Kernel zonder Arduino-afhankelijkheden. Dezelfde klasse zit in
 * `VcfModule.h` (Teensy), in `vcf_wasm.cc` (browser) en per stem-kanaal in
 * `SamplePlayer` — vast of los, het is dezelfde code.
 *
 * Gebruik: `Init(sr)`, dan per blok `Prepare()` (rekent de coëfficiënten uit
 * de doelwaarden, met een lichte smoothing tegen zippering) en per sample
 * `Tick(x)`. Wie geen blokken heeft, roept `Prepare()` gewoon vaker aan.
 */
#include <cmath>

namespace mmb_dsp {

class Svf {
public:
    enum Mode { kLowpass = 0, kHighpass = 1, kBandpass = 2 };

    void Init(float sr) {
        sr_ = sr > 1.0f ? sr : 44100.0f;
        s1_ = s2_ = 0.0f;
        fcSm_ = fc_; qSm_ = q_;
        Prepare();
    }
    void Reset() { s1_ = s2_ = 0.0f; }

    /** Cutoff in Hz (20 … 0,45·sr). */
    void set_cutoff(float hz) { fc_ = hz; }
    /** Resonantie 0 … 1; 1 is net niet zelf-oscillerend. */
    void set_resonance(float r) { q_ = r < 0.0f ? 0.0f : (r > 1.0f ? 1.0f : r); }
    void set_mode(int m) { mode_ = m == kHighpass ? kHighpass : (m == kBandpass ? kBandpass : kLowpass); }
    int  mode() const { return mode_; }

    /** Coëfficiënten bijwerken; één keer per blok is genoeg. */
    inline void Prepare() {
        fcSm_ += 0.35f * (fc_ - fcSm_);
        qSm_  += 0.35f * (q_ - qSm_);
        const float lim = 0.45f * sr_;
        const float fc = fcSm_ < 20.0f ? 20.0f : (fcSm_ > lim ? lim : fcSm_);
        g_ = std::tan(3.14159265f * fc / sr_);
        // Q 0,5 (geen resonantie) … ~25 (bijna zelf-oscillatie).
        const float Q = 0.5f + qSm_ * qSm_ * 24.5f;
        k_ = 1.0f / Q;
        a1_ = 1.0f / (1.0f + g_ * (g_ + k_));
        a2_ = g_ * a1_;
        a3_ = g_ * a2_;
    }

    inline float Tick(float x) {
        const float v3 = x - s2_;
        const float v1 = a1_ * s1_ + a2_ * v3;
        const float v2 = s2_ + a2_ * s1_ + a3_ * v3;
        s1_ = 2.0f * v1 - s1_;
        s2_ = 2.0f * v2 - s2_;
        switch (mode_) {
            case kHighpass: return x - k_ * v1 - v2;
            case kBandpass: return v1;
            default:        return v2;
        }
    }

private:
    float sr_ = 44100.0f;
    float fc_ = 2000.0f, q_ = 0.3f, fcSm_ = 2000.0f, qSm_ = 0.3f;
    int   mode_ = kLowpass;
    float g_ = 0.1f, k_ = 1.0f, a1_ = 1.0f, a2_ = 0.0f, a3_ = 0.0f;
    float s1_ = 0.0f, s2_ = 0.0f;
};

}  // namespace mmb_dsp
