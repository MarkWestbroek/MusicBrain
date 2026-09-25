#pragma once
// Tremolo-pedaal in vier smaken:
//   Amp      = bias-tremolo van een buizenversterker: de LFO duwt de
//              versterking asymmetrisch (meer dip dan piek), zacht afgerond.
//   Opto     = fotocel-tremolo (blackface): de LFO stuurt een lampje, de
//              cel volgt snel omhoog en traag terug — het schokkerige,
//              scheve golfje.
//   Harmonic = brownface: het signaal wordt bij ~800 Hz gesplitst en laag
//              en hoog worden in tegenfase gemoduleerd — een tremolo dat
//              ook een beetje phaser is.
//   Pan      = L en R in tegenfase: auto-panner.
// Golfvorm sin/tri/sqr; `shape` (0..1) maakt de golf van rond naar
// hoekig. Mono in, stereo uit; met R-kabel echt stereo.
//
// Header-only, geen allocatie.
#include <cmath>

namespace mmb_dsp {

class Tremolo {
public:
    enum Mode { kAmp = 0, kOpto = 1, kHarmonic = 2, kPan = 3 };
    enum Wave { kSine = 0, kTri = 1, kSquare = 2 };

    void Init(float sr) {
        sr_ = sr; phase_ = 0.0f; cell_ = 1.0f;
        cellUp_ = 1.0f - std::exp(-1.0f / (0.004f * sr));
        cellDn_ = 1.0f - std::exp(-1.0f / (0.045f * sr));
        splitCoef_ = 1.0f - std::exp(-6.2831853f * 800.0f / sr);
        lo_[0] = lo_[1] = 0.0f;
        set_rate(4.5f);
    }

    void set_rate(float hz)   { hz = hz < 0.05f ? 0.05f : (hz > 20.0f ? 20.0f : hz); inc_ = hz / sr_; }
    void set_depth(float d)   { depth_ = clamp01(d); }
    void set_wave(int w)      { wave_ = w < 0 ? kSine : (w > 2 ? kSquare : static_cast<Wave>(w)); }
    void set_mode(int m)      { mode_ = m < 0 ? kAmp : (m > 3 ? kPan : static_cast<Mode>(m)); }
    void set_shape(float s)   { shape_ = clamp01(s); }
    void set_level(float l)   { level_ = l < 0.0f ? 0.0f : (l > 2.0f ? 2.0f : l); }

    /** In-place op x[0]/x[1]; `stereoIn` false = R krijgt L. */
    inline void Process(float* x, bool stereoIn) {
        phase_ += inc_;
        if (phase_ >= 1.0f) phase_ -= 1.0f;
        const float in0 = x[0], in1 = stereoIn ? x[1] : x[0];
        // LFO 0..1 (1 = vol open) en zijn tegenhanger.
        float l = lfo(phase_);
        if (mode_ == kOpto) {
            // De fotocel: snel op (lamp aan), traag terug (cel doft na).
            cell_ += (l - cell_) * (l > cell_ ? cellUp_ : cellDn_);
            l = cell_;
        }
        if (mode_ == kAmp) {
            // Bias-tremolo: de dip is dieper dan de piek hoog is.
            l = 1.0f - (1.0f - l) * (1.0f - l) * 0.5f - (1.0f - l) * 0.5f;
        }
        const float gA = 1.0f - depth_ * (1.0f - l);
        const float gB = 1.0f - depth_ * l;                  // tegenfase
        switch (mode_) {
            case kHarmonic:
                for (int ch = 0; ch < 2; ++ch) {
                    const float in = ch ? in1 : in0;
                    lo_[ch] += (in - lo_[ch]) * splitCoef_;
                    x[ch] = (lo_[ch] * gA + (in - lo_[ch]) * gB) * level_;
                }
                break;
            case kPan:
                x[0] = in0 * gA * level_;
                x[1] = in1 * gB * level_;
                break;
            default:
                x[0] = in0 * gA * level_;
                x[1] = in1 * gA * level_;
                break;
        }
    }

private:
    static float clamp01(float v) { return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }
    /** LFO 0..1; `shape` trekt sinus/driehoek naar een blok toe. */
    inline float lfo(float ph) const {
        float v;
        switch (wave_) {
            case kTri:    v = ph < 0.5f ? 2.0f * ph : 2.0f - 2.0f * ph; break;
            case kSquare: v = ph < 0.5f ? 1.0f : 0.0f; break;
            default:      v = 0.5f - 0.5f * std::cos(6.2831853f * ph); break;
        }
        if (shape_ > 0.0f && wave_ != kSquare) {
            // Zacht naar de randen drukken: (v−½)·k, geklemd, terug naar 0..1.
            const float k = 1.0f + 6.0f * shape_;
            float c = (v - 0.5f) * k;
            c = c / (1.0f + (c < 0.0f ? -c : c) * 0.5f);
            if (c > 0.5f) c = 0.5f; if (c < -0.5f) c = -0.5f;
            v = c + 0.5f;
        }
        return v;
    }

    float sr_ = 44100.0f, phase_ = 0.0f, inc_ = 0.0001f;
    float depth_ = 0.6f, shape_ = 0.0f, level_ = 1.0f;
    float cell_ = 1.0f, cellUp_ = 0.1f, cellDn_ = 0.01f;
    float splitCoef_ = 0.1f, lo_[2] = { 0.0f, 0.0f };
    Wave  wave_ = kSine;
    Mode  mode_ = kAmp;
};

}  // namespace mmb_dsp
