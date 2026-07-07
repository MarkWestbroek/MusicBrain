#pragma once
/**
 * @file MorphWtModule.h
 * @brief Morphing-wavetable-VCO (typeId `tp_mmb_morph_wt`, FW-AU-14 v2):
 *        8 frames per bank, vloeiend gemorpht, per-octaaf gebandlimit.
 *
 * @details
 * v2 lost het aliasen van v1 op met **mip-levels**: elke bank bestaat in
 * drie band-gelimiteerde versies (≤24, ≤8 en ≤2 harmonischen). Per blok
 * kiest de oscillator het niveau waarvan de hoogste harmonische onder
 * Nyquist blijft — tot ~A5 het volle spectrum, daarboven trapsgewijs
 * schoner. Opslag: int16, 3×5×8×256 ≈ 61 KB heap (eenmalig).
 *
 * Banken: 0 **Analog** (sin→tri→saw→puls), 1 **Vocal** (schuivende
 * formanten), 2 **Harmonics** (drawbar-opbouw), 3 **Digital** (gaten/
 * fase-flips), 4 **USER** — frames vulbaar via het `wavetable`-serieframe
 * (`wslot` kiest het frame; de Draw-VCO-teken-UI werkt er dus voor).
 * USER-frames worden naar alle mip-levels gekopieerd (getekende golven
 * bandlimiten kan later met een FFT-pass).
 *
 * Port map:
 * | Dir | portId     | Kind  | Betekenis                            |
 * |-----|------------|-------|--------------------------------------|
 * | in  | `voct`     | Cv    | 1 V/oct rond C4                      |
 * | in  | `morph_cv` | Cv    | ±1 → ±7 frames bovenop de knop       |
 * | out | `out`      | Audio | Oscillator-uitgang                   |
 *
 * Controls: `bank` (0..4), `morph` (0..7), `coarse` (semi), `fine` (ct),
 * `level` (0..1), `wslot` (0..7, doelframe voor de wavetable-push).
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <new>
#include <string_view>

namespace mmb_link {

/** @brief Morphing-wavetable-oscillator met mip-levels, als AudioStream. */
class MorphWtVoice : public AudioStream {
public:
    static constexpr int kFrames  = 8;
    static constexpr int kSamples = 256;
    static constexpr int kBanks   = 5;   ///< 4 ingebouwd + USER.
    static constexpr int kMips    = 3;   ///< ≤24, ≤8, ≤2 harmonischen.

    MorphWtVoice() : AudioStream(0, nullptr) {
        ensureBanks();
        recomputeHz();
    }

    void setBank(int b) {
        if (b < 0) b = 0;
        if (b >= kBanks) b = kBanks - 1;
        bank_ = b;
    }
    void setMorph(float m)   { morphBase_ = clampf(m, 0.0f, 7.0f); }
    void setMorphCv(float v) { morphCv_ = clampf(v, -1.0f, 1.0f) * 7.0f; }
    void setVoct(float v)    { voct_ = v; recomputeHz(); }
    void setCoarse(float s)  { coarse_ = s; recomputeHz(); }
    void setFine(float c)    { fine_ = c; recomputeHz(); }
    void setLevel(float v)   { level_ = clampf(v, 0.0f, 1.0f); }
    void setWriteSlot(int s) {
        if (s < 0) s = 0;
        if (s >= kFrames) s = kFrames - 1;
        writeSlot_ = s;
    }
    /** USER-frame vullen (256 samples) — gekopieerd naar alle mip-levels. */
    bool writeUserFrame(const std::int16_t* data, std::size_t count) {
        if (count != kSamples || !tables()) return false;
        for (int m = 0; m < kMips; ++m)
            std::memcpy(frame(m, 4, writeSlot_), data,
                        kSamples * sizeof(std::int16_t));
        return true;
    }

    void update() override {
        audio_block_t* out = allocate();
        if (!out) return;
        if (!tables()) {
            std::memset(out->data, 0, sizeof(out->data));
            transmit(out, 0);
            release(out);
            return;
        }
        // Mip-keuze: hoogste harmonische van dit niveau moet onder Nyquist
        // blijven. hz = phaseInc·fs; toegestaan = (fs/2)/hz = 0.5/phaseInc.
        const float allowed = phaseInc_ > 0.0f ? 0.5f / phaseInc_ : 24.0f;
        const int mip = allowed >= 24.0f ? 0 : (allowed >= 8.0f ? 1 : 2);

        float m = clampf(morphBase_ + morphCv_, 0.0f, 6.999f);
        const int   f0   = static_cast<int>(m);
        const float fMix = m - static_cast<float>(f0);
        const std::int16_t* a = frame(mip, bank_, f0);
        const std::int16_t* b = frame(mip, bank_, f0 + 1);

        constexpr float kInv = 1.0f / 32768.0f;
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            const float pos = phase_ * kSamples;
            const int   i0  = static_cast<int>(pos) & (kSamples - 1);
            const int   i1  = (i0 + 1) & (kSamples - 1);
            const float sf  = pos - std::floor(pos);
            const float sa  = a[i0] + (a[i1] - a[i0]) * sf;
            const float sb  = b[i0] + (b[i1] - b[i0]) * sf;
            float y = (sa + (sb - sa) * fMix) * kInv * level_;
            if (y >  1.0f) y =  1.0f;
            if (y < -1.0f) y = -1.0f;
            out->data[i] = static_cast<int16_t>(y * 32767.0f);
            phase_ += phaseInc_;
            if (phase_ >= 1.0f) phase_ -= 1.0f;
        }
        transmit(out, 0);
        release(out);
    }

private:
    static float clampf(float v, float lo, float hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }

    /// Tabellen: [mip][bank][frame][sample], int16 — eenmalig op de heap
    /// (~61 KB). (Function-local statics met .dmabuffers-sectie botsen met
    /// de AudioMemory-pool in dezelfde TU, vandaar heap.)
    static std::int16_t* tables() {
        static std::int16_t* t = new (std::nothrow)
            std::int16_t[kMips * kBanks * kFrames * kSamples]();
        return t;
    }
    static std::int16_t* frame(int mip, int bank, int fr) {
        return tables() + ((mip * kBanks + bank) * kFrames + fr) * kSamples;
    }

    static void ensureBanks() {
        static bool done = false;
        if (done) return;
        if (!tables()) return;   // heap-OOM: stilte, geen crash
        done = true;

        static constexpr int kMaxH[kMips] = { 24, 8, 2 };
        float work[kSamples];
        auto add = [&work](int h, float amp, float phase = 0.0f) {
            for (int i = 0; i < kSamples; ++i)
                work[i] += amp * sinf(6.2831853f * (h * i / float(kSamples)) + phase);
        };
        auto store = [&work](int mip, int bank, int fr) {
            float mx = 0.0f;
            for (int i = 0; i < kSamples; ++i) {
                const float a = work[i] < 0 ? -work[i] : work[i];
                if (a > mx) mx = a;
            }
            const float g = mx > 0.0001f ? 0.95f / mx : 0.0f;
            std::int16_t* dst = frame(mip, bank, fr);
            for (int i = 0; i < kSamples; ++i)
                dst[i] = static_cast<std::int16_t>(work[i] * g * 32767.0f);
        };

        for (int mip = 0; mip < kMips; ++mip) {
            const int maxH = kMaxH[mip];

            // Bank 0 — Analog: sin → tri → saw → sqr/puls.
            for (int fr = 0; fr < kFrames; ++fr) {
                std::memset(work, 0, sizeof(work));
                const float t = fr / 7.0f;
                for (int h = 1; h <= maxH; ++h) {
                    const bool odd = h & 1;
                    float amp = 0.0f;
                    if (t < 0.33f) {
                        const float u = t / 0.33f;
                        if (h == 1) amp = 1.0f;
                        else if (odd) amp = u / float(h * h) * ((h / 2) % 2 ? -1.0f : 1.0f);
                    } else if (t < 0.66f) {
                        const float u = (t - 0.33f) / 0.33f;
                        const float tri = odd ? 1.0f / float(h * h) : 0.0f;
                        const float saw = 1.0f / float(h);
                        amp = tri + (saw - tri) * u;
                    } else {
                        const float u = (t - 0.66f) / 0.34f;
                        const float saw = 1.0f / float(h);
                        const float sqr = odd ? 1.0f / float(h) : 0.0f;
                        amp = saw + (sqr - saw) * u;
                    }
                    if (amp != 0.0f) add(h, amp);
                }
                store(mip, 0, fr);
            }
            // Bank 1 — Vocal: twee formant-pieken die door de reeks schuiven.
            for (int fr = 0; fr < kFrames; ++fr) {
                std::memset(work, 0, sizeof(work));
                const float f1 = 2.0f + fr * 0.9f;
                const float f2 = 6.0f + fr * 2.0f;
                for (int h = 1; h <= maxH; ++h) {
                    const float d1 = (h - f1) / 1.2f;
                    const float d2 = (h - f2) / 2.0f;
                    add(h, expf(-d1 * d1) + 0.6f * expf(-d2 * d2) + 0.15f / float(h));
                }
                store(mip, 1, fr);
            }
            // Bank 2 — Harmonics: drawbar-opbouw.
            for (int fr = 0; fr < kFrames; ++fr) {
                std::memset(work, 0, sizeof(work));
                static constexpr int kBars[] = { 1, 2, 3, 4, 6, 8, 10, 12 };
                for (int k = 0; k <= fr; ++k)
                    if (kBars[k] <= maxH) add(kBars[k], 1.0f / (k + 1));
                store(mip, 2, fr);
            }
            // Bank 3 — Digital: spectra met gaten en fase-flips.
            for (int fr = 0; fr < kFrames; ++fr) {
                std::memset(work, 0, sizeof(work));
                for (int h = 1; h <= maxH; ++h) {
                    if (((h * (fr + 2)) % (fr + 3)) == 0) continue;
                    add(h, 1.0f / float(1 + ((h * 7) % (fr + 2))), (h % 3) * 2.0f);
                }
                store(mip, 3, fr);
            }
            // Bank 4 — USER: start als sinus zodat hij nooit stil is.
            for (int fr = 0; fr < kFrames; ++fr) {
                std::memset(work, 0, sizeof(work));
                add(1, 1.0f);
                store(mip, 4, fr);
            }
        }
    }

    void recomputeHz() {
        const float hz = 261.6256f
            * powf(2.0f, voct_ + coarse_ / 12.0f + fine_ / 1200.0f);
        phaseInc_ = hz / AUDIO_SAMPLE_RATE_EXACT;
    }

    float phase_ = 0.0f, phaseInc_ = 0.0f;
    float voct_ = 0.0f, coarse_ = 0.0f, fine_ = 0.0f;
    float morphBase_ = 0.0f, morphCv_ = 0.0f;
    float level_ = 0.8f;
    int   bank_ = 0;
    int   writeSlot_ = 0;
};

/** @brief Module-wrapper rond @ref MorphWtVoice. */
class MorphWtModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_morph_wt";

    explicit MorphWtModule(std::string_view id)
        : AudioModule(kTypeId, id) {}

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out")
            return { const_cast<MorphWtVoice*>(&voice_), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view /*portId*/) const override {
        return {};
    }

    PortKind outputPortKind(std::string_view portId) const override {
        return portId == "out" ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "voct") return PortKind::Cv;
        if (cvPortIs(portId, "morph")) return PortKind::Cv;
        return PortKind::None;
    }

    void writeCvPort(std::string_view portId, float value) override {
        if      (portId == "voct")          voice_.setVoct(value);
        else if (cvPortIs(portId, "morph")) voice_.setMorphCv(value);
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            return fallback;
        };
        if      (controlId == "bank")   voice_.setBank(static_cast<int>(asFloat(0.0f)));
        else if (controlId == "morph")  voice_.setMorph(asFloat(0.0f));
        else if (controlId == "coarse") voice_.setCoarse(asFloat(0.0f));
        else if (controlId == "fine")   voice_.setFine(asFloat(0.0f));
        else if (controlId == "level")  voice_.setLevel(asFloat(0.8f));
        else if (controlId == "wslot")  voice_.setWriteSlot(static_cast<int>(asFloat(0.0f)));
    }

    /** @brief `wavetable`-push (256 samples) vult USER-frame `wslot`. */
    bool setWaveformData(const std::int16_t* data, std::size_t count) override {
        return voice_.writeUserFrame(data, count);
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<MorphWtModule>(id);
            });
    }

private:
    mutable MorphWtVoice voice_;
};

}  // namespace mmb_link
