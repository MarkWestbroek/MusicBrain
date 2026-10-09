#pragma once
// Cmi: een stem naar de golfvormsynthese van de Fairlight CMI (Page 4/5).
// De CMI rekende uit een harmonischenprofiel (tot 32 harmonischen, elk met
// een eigen verloop over 32 segmenten) 32 golfvormen uit, één per segment,
// en speelde die na elkaar af: de klank beweegt door de noot heen. Hier net
// zo: de editor rekent het profiel om naar 32 golfvormen van 128 samples
// (8 bit) en stuurt ze in één keer (`setTable`); deze stem speelt ze af.
//
//   • Afspelen zoals de CMI: de golfvorm wordt zonder interpolatie gelezen
//     (zero-order hold; de stem "klokt" op 128 × de grondtoon), 8 bit, door
//     een filter dat die klok volgt (0,45 × 128 × f, begrensd op Nyquist).
//   • Segmenten: segment n duurt `seg` ms; `smooth` laat het ene segment in
//     het volgende overvloeien (0 = hard wisselen, zoals de CMI). Zolang de
//     toets vastgehouden wordt loopt hij na het laatste segment rond vanaf
//     `loop` (1..32; 32 = op het laatste blijven); bij loslaten speelt hij
//     door naar het eind en daar klinkt de release uit.
//   • `seg_cv` schuift de positie in de segmenten (±1 = ±16 segmenten).
//   • DURATION en ENERGY (Page 4): na de 4096 samples mogen 32 duurfactoren
//     (×1000, dus 1000 = `seg` ms) en 32 niveaus (0..32767) volgen: hoe lang
//     elk segment klinkt en de volumecurve over de segmenten. Zonder: alle
//     segmenten even lang, energie 1.
//
// Zonder tabel van de editor speelt hij een ingebouwd profiel (koper-achtig:
// heldere aanzet die naar een zachtere toon zakt), zodat de module meteen
// klinkt. Header-only; gedeeld door Teensy en browser.
#include <cmath>
#include <cstdint>
#include <cstring>

#include "oversample.h"

namespace mmb_dsp {

class Cmi {
public:
    enum Control { Coarse, Fine, Seg, Smooth, Loop, Attack, Release, Level, kControls };
    // Gate als laatste: de aanslag leest vel van hetzelfde moment.
    enum CvIn { Voct, Vel, SegCv, Gate, kCvIns };
    enum CvOut { Pos, kCvOuts };
    static constexpr float kDefaults[kControls] = { 0, 0, 40, 0.3f, 24, 4, 300, 0.8f };
    static constexpr int kSegments = 32, kSamples = 128;
    /** Tabel + 32 duurfactoren + 32 energieniveaus. */
    static constexpr int kTableWithProfiles = kSegments * kSamples + 2 * kSegments;

    // Geen `*this = Cmi()`: de tabel is 4 KB, die hoort niet als tijdelijke
    // kopie op de stack.
    void Init(float sampleRate) {
        sr_ = finiteClamp(sampleRate, 8000, 192000, 44100);
        for (int c = 0; c < kControls; ++c) setControl(c, kDefaults[c]);
        phase_ = 0; segPos_ = 0; amp_ = 0; lp1_ = lp2_ = 0; gate_ = false; vel_ = 0; velLatched_ = 0.8f;
        voct_ = 0; segCv_ = 0;
        for (int s = 0; s < kSegments; ++s) { dur_[s] = 1; energy_[s] = 1; }
        defaultTable();
        prepare();
    }

    /** 32 × 128 samples, segment voor segment (int16, vol bereik; wordt 8 bit). */
    void setTable(const int16_t* data, int count) {
        if (!data || count <= 0) return;
        for (int s = 0; s < kSegments; ++s)
            for (int i = 0; i < kSamples; ++i) {
                // Minder dan 32 segmenten: het laatste herhaalt; één golfvorm = overal.
                int seg = s * kSamples < count ? s : (count / kSamples) - 1;
                if (seg < 0) seg = 0;
                const int k = seg * kSamples + i;
                const int v = k < count ? data[k] : data[i % (count < kSamples ? count : kSamples)];
                table_[s][i] = static_cast<int8_t>(v >> 8);
            }
        // DURATION en ENERGY als ze meekomen; anders vlak.
        const int base = kSegments * kSamples;
        for (int s = 0; s < kSegments; ++s) {
            dur_[s] = count >= base + kSegments ? finiteClamp(data[base + s] * 0.001f, 0.05f, 16, 1) : 1;
            energy_[s] = count >= base + 2 * kSegments ? finiteClamp(data[base + kSegments + s] / 32767.0f, 0, 1, 1) : 1;
        }
    }

    void setControl(int control, float value) {
        switch (control) {
            case Coarse:  coarse_ = finiteClamp(value, -36, 36, 0); break;
            case Fine:    fine_ = finiteClamp(value, -100, 100, 0); break;
            case Seg:     segMs_ = finiteClamp(value, 5, 1000, 40); break;
            case Smooth:  smooth_ = finiteClamp(value, 0, 1, 0.3f); break;
            case Loop:    loop_ = static_cast<int>(finiteClamp(value, 1, 32, 24) + 0.5f); break;
            case Attack:  attack_ = coef(finiteClamp(value, 0.5f, 2000, 4)); break;
            case Release: release_ = coef(finiteClamp(value, 1, 5000, 300)); break;
            case Level:   level_ = finiteClamp(value, 0, 1, 0.8f); break;
            default: return;
        }
    }

    void setCv(int input, float value) {
        switch (input) {
            case Voct:  voct_ = finiteClamp(value, -6, 6, 0); prepare(); break;
            case Vel:   vel_ = finiteClamp(value, 0, 1, 0); break;
            case SegCv: segCv_ = finiteClamp(value, -1, 1, 0); break;
            case Gate: {
                const bool high = value >= 0.5f;
                if (high && !gate_) {
                    velLatched_ = vel_ > 0.001f ? vel_ : 0.8f;   // geen kabel: 0,8
                    segPos_ = 0;                                 // elke aanslag vanaf segment 1
                }
                gate_ = high;
                break;
            }
            default: break;
        }
    }
    float cvOut(int output) const { return output == Pos ? segPos_ / (kSegments - 1) : 0; }

    void Process(const float* const*, float* const* out, int frames) {
        const float segInc = 1000.0f / (segMs_ * sr_);           // segmenten per sample bij duur 1
        const float loopFrom = static_cast<float>(loop_ - 1);
        for (int frame = 0; frame < frames; ++frame) {
            // ── positie in de segmenten (DURATION: per segment eigen duur) ─
            int cur = static_cast<int>(segPos_);
            if (cur > kSegments - 1) cur = kSegments - 1;
            segPos_ += segInc / dur_[cur];
            if (segPos_ > kSegments - 1) {
                if (gate_ && loop_ < kSegments) {
                    const float len = static_cast<float>(kSegments - 1) - loopFrom;
                    segPos_ = loopFrom + std::fmod(segPos_ - loopFrom, len > 0 ? len : 1);
                } else {
                    segPos_ = static_cast<float>(kSegments - 1);
                }
            }
            float pos = segPos_ + segCv_ * 16;
            if (pos < 0) pos = 0;
            if (pos > kSegments - 1) pos = kSegments - 1;
            const int s0 = static_cast<int>(pos);
            const int s1 = s0 < kSegments - 1 ? s0 + 1 : s0;
            const float frac = pos - static_cast<float>(s0);
            // Smooth: alleen het laatste stuk van een segment vloeit over.
            float w = 0;
            if (smooth_ > 0.001f) { w = (frac - (1 - smooth_)) / smooth_; if (w < 0) w = 0; if (w > 1) w = 1; }

            // ── golfvorm: zero-order hold op 128 × f ───────────────────────
            phase_ += inc_;
            if (phase_ >= 1) phase_ -= std::floor(phase_);
            const int idx = static_cast<int>(phase_ * kSamples) & (kSamples - 1);
            const float a = static_cast<float>(table_[s0][idx]);
            const float b = static_cast<float>(table_[s1][idx]);
            const float raw = (a + (b - a) * w) * (1.0f / 128.0f);
            lp1_ += (raw - lp1_) * lpCoef_;
            lp2_ += (lp1_ - lp2_) * lpCoef_;

            // ── envelope; ENERGY glijdt traploos over de segmenten ──────────
            const float target = gate_ ? velLatched_ : 0;
            amp_ += (target - amp_) * (target > amp_ ? attack_ : release_);
            const float energy = energy_[s0] + (energy_[s1] - energy_[s0]) * frac;
            out[0][frame] = lp2_ * amp_ * energy * level_;
        }
    }

private:
    float coef(float ms) const { return 1 - std::exp(-1 / (ms * 0.001f * sr_)); }

    void prepare() {
        const float hz = 261.6256f * std::exp2(voct_ + coarse_ / 12 + fine_ / 1200);
        inc_ = finiteClamp(hz / sr_, 0, 0.45f, 0.006f);
        // Het filter volgt de klok van de stem: 128 × f, 0,45 daarvan.
        float fc = 0.45f * kSamples * hz;
        if (fc > 0.45f * sr_) fc = 0.45f * sr_;
        lpCoef_ = 1 - std::exp(-6.2831853f * fc * 1.55f / sr_);
    }

    /** Ingebouwd profiel: harmonischen 1..24 als zaag, de hogere zakken in de
     *  loop van de segmenten weg (heldere aanzet, zachtere toon erna). */
    void defaultTable() {
        for (int s = 0; s < kSegments; ++s) {
            const float t = static_cast<float>(s) / (kSegments - 1);
            float buf[kSamples] = {};
            float peak = 0;
            for (int h = 1; h <= 24; ++h) {
                const float a = (1.0f / h) * std::exp(-t * 0.35f * static_cast<float>(h - 1));
                for (int i = 0; i < kSamples; ++i) buf[i] += a * std::sin(6.2831853f * h * i / kSamples);
            }
            for (int i = 0; i < kSamples; ++i) peak = std::fmax(peak, std::fabs(buf[i]));
            for (int i = 0; i < kSamples; ++i) table_[s][i] = static_cast<int8_t>(std::lrint(buf[i] / peak * 120.0f));
        }
    }

    float sr_ = 44100;
    float coarse_ = 0, fine_ = 0, segMs_ = 40, smooth_ = 0.3f, level_ = 0.8f;
    int   loop_ = 24;
    float attack_ = 0.01f, release_ = 0.001f;
    float voct_ = 0, vel_ = 0, velLatched_ = 0.8f, segCv_ = 0;
    bool  gate_ = false;
    float phase_ = 0, inc_ = 0.006f, segPos_ = 0, amp_ = 0, lp1_ = 0, lp2_ = 0, lpCoef_ = 1;
    int8_t table_[kSegments][kSamples] = {};
    float  dur_[kSegments] = {}, energy_[kSegments] = {};
};

}  // namespace mmb_dsp
