#pragma once
// Vibe: de univibe-familie (en de moderne klonen zoals de Mojo Vibe), plus
// een lichte vibrato met een vertragingslijn.
//
// Een univibe is géén gewone phaser. Vier fasedraai-trappen, maar elk met
// een *andere* condensator (15 nF, 220 nF, 470 pF, 4,7 nF), zodat de
// notches wijd over het spectrum verspreid liggen in plaats van netjes op
// een rij. Alle vier de weerstanden zijn LDR's (lichtgevoelige weerstanden)
// rond één gloeilampje dat door een LFO wordt aangestuurd. Daar zit het
// karakter:
//   - het lampje reageert niet-lineair op de stroom (helderheid ≈ stroom²),
//   - de LDR's worden snel laag-ohmig als het licht aangaat en herstellen
//     traag als het uitgaat,
// zodat de sweep scheef en "kloppend" is — het golfje ademt, het tikt niet.
//
// Modes:
//   0 Chorus  = droog + nat (de faseverschillen geven bewegende notches;
//               het klassieke univibe-geluid, tussen chorus en phaser in)
//   1 Vibrato = alleen nat: de fasedraaiing moduleert de toonhoogte
//   2 Light   = een zuivere vibrato met een gemoduleerde vertragingslijn
//               (sinus, 0,5–6 ms), zonder lampkarakter — de lichte versie
//
// `lamp` (0..1) regelt hoe sterk het lamp/LDR-karakter is: 0 = een nette
// sinus-sweep, 1 = de scheve, kloppende sweep van een oud exemplaar.
//
// Header-only, buffers inline (2 × 1024 floats voor de vibrato-lijn).
#include <cmath>
#include <cstring>

namespace mmb_dsp {

class Vibe {
public:
    enum Mode { kChorus = 0, kVibrato = 1, kLight = 2 };
    static constexpr int kStages = 4;
    static constexpr int kLen = 1024;                    // 23 ms bij 44,1 kHz

    void Init(float sr) {
        sr_ = sr;
        std::memset(ap_x_, 0, sizeof(ap_x_));
        std::memset(ap_y_, 0, sizeof(ap_y_));
        std::memset(buf_, 0, sizeof(buf_));
        write_ = 0; phase_ = 0.0f; cell_ = 0.0f; ctlCount_ = 0;
        cellUp_ = 1.0f - std::exp(-1.0f / (0.006f * sr));  // licht aan: ~6 ms
        cellDn_ = 1.0f - std::exp(-1.0f / (0.060f * sr));  // licht uit: ~60 ms
        set_speed(2.0f);
        for (int ch = 0; ch < 2; ++ch) for (int s = 0; s < kStages; ++s) a_[s] = 0.0f;
        updateCoefs(0.5f);
    }

    void set_speed(float hz)     { hz = hz < 0.1f ? 0.1f : (hz > 12.0f ? 12.0f : hz); inc_ = hz / sr_; }
    void set_intensity(float i)  { intensity_ = clamp01(i); }
    void set_mode(int m)         { mode_ = m <= 0 ? kChorus : (m == 1 ? kVibrato : kLight); }
    void set_lamp(float l)       { lamp_ = clamp01(l); }
    void set_volume(float v)     { volume_ = v < 0.0f ? 0.0f : (v > 2.0f ? 2.0f : v); }

    /** In-place op x[0]/x[1]; `stereoIn` false = R krijgt L. */
    inline void Process(float* x, bool stereoIn) {
        phase_ += inc_;
        if (phase_ >= 1.0f) phase_ -= 1.0f;
        const float in0 = x[0], in1 = stereoIn ? x[1] : x[0];

        if (mode_ == kLight) {
            // Zuivere vibrato: vertragingslijn, sinus-LFO, alleen nat.
            const float lfo = std::sin(6.2831853f * phase_);
            const float d = (0.5f + 2.75f * intensity_ * (1.0f + lfo)) * 0.001f * sr_;   // 0,5..6 ms
            for (int ch = 0; ch < 2; ++ch) {
                buf_[ch][write_] = ch ? in1 : in0;
                float rp = static_cast<float>(write_) - d;
                if (rp < 0.0f) rp += static_cast<float>(kLen);
                const int i0 = static_cast<int>(rp);
                const float f = rp - static_cast<float>(i0);
                const float a = buf_[ch][i0 & (kLen - 1)], b = buf_[ch][(i0 + 1) & (kLen - 1)];
                x[ch] = (a + (b - a) * f) * volume_;
            }
            write_ = (write_ + 1) & (kLen - 1);
            return;
        }

        // Lamp: sinus-LFO 0..1, helderheid ≈ stroom² (lamp-mengsel), dan de
        // LDR die snel op en traag af gaat.
        const float s = 0.5f + 0.5f * std::sin(6.2831853f * phase_);
        const float bright = s + lamp_ * (s * s - s);          // lamp 0: s, lamp 1: s²
        const float k = lamp_ > 0.0f
            ? (bright > cell_ ? cellUp_ : cellDn_ + (1.0f - lamp_) * (cellUp_ - cellDn_))
            : 1.0f;
        cell_ += (bright - cell_) * k;
        // Coëfficiënten elke 8 samples (tan() is niet gratis).
        if (++ctlCount_ >= 8) { ctlCount_ = 0; updateCoefs(cell_); }

        for (int ch = 0; ch < 2; ++ch) {
            const float in = (ch ? in1 : in0);
            // Zachte voorversterker (het univibe-circuit loopt lichtjes vol).
            float v = in * 1.2f;
            v = v / (1.0f + 0.25f * (v < 0.0f ? -v : v));
            for (int st = 0; st < kStages; ++st) {
                const float y = a_[st] * v + ap_x_[ch][st] - a_[st] * ap_y_[ch][st];
                ap_x_[ch][st] = v; ap_y_[ch][st] = y;
                v = y;
            }
            const float wet = v;
            x[ch] = (mode_ == kChorus ? 0.5f * (in + wet * (0.4f + 0.6f * intensity_)) * 1.25f
                                      : wet) * volume_;
        }
    }

private:
    static float clamp01(float v) { return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v); }
    /** LDR-weerstand uit de cel (licht 0..1), exponentieel tussen 400 kΩ (donker)
     *  en 8 kΩ (vol licht), ingeschaald door `intensity`; vier all-pass-trappen
     *  met de univibe-condensatoren. */
    void updateCoefs(float cell) {
        static constexpr float kCap[kStages] = { 15e-9f, 220e-9f, 470e-12f, 4.7e-9f };
        const float depth = 0.25f + 0.75f * intensity_;
        const float c = 0.5f + (cell - 0.5f) * depth;           // intensiteit = zwaaiwijdte
        const float r = 400e3f * std::pow(8e3f / 400e3f, c);
        for (int st = 0; st < kStages; ++st) {
            float f = 1.0f / (6.2831853f * r * kCap[st]);
            if (f > 0.45f * sr_) f = 0.45f * sr_;
            if (f < 5.0f) f = 5.0f;
            const float t = std::tan(3.1415927f * f / sr_);
            a_[st] = (t - 1.0f) / (t + 1.0f);
        }
    }

    float sr_ = 44100.0f, phase_ = 0.0f, inc_ = 0.0f;
    float intensity_ = 0.6f, lamp_ = 0.7f, volume_ = 1.0f;
    Mode  mode_ = kChorus;
    float cell_ = 0.0f, cellUp_ = 0.01f, cellDn_ = 0.001f;
    int   ctlCount_ = 0;
    float a_[kStages] = {};
    float ap_x_[2][kStages] = {}, ap_y_[2][kStages] = {};
    float buf_[2][kLen];
    int   write_ = 0;
};

}  // namespace mmb_dsp
