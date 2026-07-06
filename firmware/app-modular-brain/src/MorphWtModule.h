#pragma once
/**
 * @file MorphWtModule.h
 * @brief Morphing-wavetable-VCO (typeId `tp_mmb_morph_wt`): 8 frames per
 *        bank, vloeiend gemorpht met knop of CV.
 *
 * @details
 * De bestaande WT-VCO (FW-AU-5) schakelt hard tussen vaste tabellen; deze
 * module morpht **vloeiend** door een bank van 8 frames (256 samples elk):
 * per sample wordt binnen het frame lineair geïnterpoleerd én tussen de
 * twee aangrenzende frames gecrossfaded. Vier ingebouwde banken (additief
 * opgebouwd, max 24 harmonischen) + een USER-bank waarvan de frames via het
 * bestaande `wavetable`-serieframe gevuld worden (`wslot` kiest het frame,
 * de Draw-VCO-teken-UI kan dus hergebruikt worden).
 *
 * Banken: 0 **Analog** (sin→tri→saw→sqr→pulse), 1 **Vocal** (formant-
 * pieken A→O→E→I), 2 **Harmonics** (orgel-drawbar-opbouw), 3 **Digital**
 * (harde reeksen/bit-achtig), 4 **USER**.
 *
 * @note v1 is niet per-octaaf gebandlimit: één tabel per frame met ≤24
 *       harmonischen — boven ~C6 gaat het zachtjes aliasen. Mip-levels
 *       kunnen later binnen dezelfde ports/controls.
 *
 * Port map:
 * | Dir | portId     | Kind  | Betekenis                            |
 * |-----|------------|-------|--------------------------------------|
 * | in  | `voct`     | Cv    | 1 V/oct rond C4                      |
 * | in  | `morph_cv` | Cv    | 0..1 → frame 0..7 (optelt bij knop)  |
 * | out | `out`      | Audio | Oscillator-uitgang                   |
 *
 * Controls: `bank` (0..4), `morph` (0..7), `coarse` (semi), `fine` (ct),
 * `level` (0..1). USER-frames: `wslot` (0..7) + wavetable-push.
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

/** @brief Morphing-wavetable-oscillator als AudioStream. */
class MorphWtVoice : public AudioStream {
public:
    static constexpr int kFrames  = 8;
    static constexpr int kSamples = 256;
    static constexpr int kBanks   = 5;   ///< 4 ingebouwd + USER.

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
    /** USER-frame vullen (256 samples, int16) — via Module::setWaveformData. */
    bool writeUserFrame(const std::int16_t* data, std::size_t count) {
        if (count != kSamples) return false;
        float* dst = banks()[4][writeSlot_];
        for (int i = 0; i < kSamples; ++i)
            dst[i] = static_cast<float>(data[i]) * (1.0f / 32768.0f);
        return true;
    }

    void update() override {
        audio_block_t* out = allocate();
        if (!out) return;
        if (!banks()) {
            std::memset(out->data, 0, sizeof(out->data));
            transmit(out, 0);
            release(out);
            return;
        }
        float m = clampf(morphBase_ + morphCv_, 0.0f, 6.999f);
        const int   f0   = static_cast<int>(m);
        const float fMix = m - static_cast<float>(f0);
        const float (*bank)[kSamples] = banks()[bank_];
        const float* a = bank[f0];
        const float* b = bank[f0 + 1];

        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            const float pos = phase_ * kSamples;
            const int   i0  = static_cast<int>(pos) & (kSamples - 1);
            const int   i1  = (i0 + 1) & (kSamples - 1);
            const float sf  = pos - std::floor(pos);
            const float sa  = a[i0] + (a[i1] - a[i0]) * sf;
            const float sb  = b[i0] + (b[i1] - b[i0]) * sf;
            float y = (sa + (sb - sa) * fMix) * level_;
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

    /// Banken: [bank][frame][sample], ~40 KB float — éénmalig op de heap
    /// (RAM2) gebouwd, ≤24 harmonischen tegen het ergste aliasen. (Een
    /// function-local static met .dmabuffers-sectie botst met de
    /// AudioMemory-pool in dezelfde TU — vandaar heap.)
    using Frame = float[kSamples];
    using BankArray = Frame[kFrames];
    static BankArray* banks() {
        static BankArray* b = [] {
            auto* mem = new (std::nothrow) float[kBanks * kFrames * kSamples]();
            return reinterpret_cast<BankArray*>(mem);
        }();
        return b;
    }

    static void ensureBanks() {
        static bool done = false;
        if (done) return;
        if (!banks()) return;   // heap-OOM: stilte, geen crash
        done = true;
        auto add = [](float* f, int h, float amp, float phase = 0.0f) {
            for (int i = 0; i < kSamples; ++i)
                f[i] += amp * sinf(6.2831853f * (h * i / float(kSamples)) + phase);
        };
        auto normalize = [](float* f) {
            float mx = 0.0f;
            for (int i = 0; i < kSamples; ++i) {
                const float a = f[i] < 0 ? -f[i] : f[i];
                if (a > mx) mx = a;
            }
            if (mx > 0.0001f)
                for (int i = 0; i < kSamples; ++i) f[i] *= 0.95f / mx;
        };
        auto* B = banks();

        // Bank 0 — Analog: sin → tri → saw → sqr → smalle puls.
        for (int fr = 0; fr < kFrames; ++fr) {
            float* f = B[0][fr];
            const float t = fr / 7.0f;                    // 0..1
            for (int h = 1; h <= 24; ++h) {
                const bool odd = h & 1;
                float amp = 0.0f;
                if (t < 0.33f) {          // sin → tri
                    const float u = t / 0.33f;
                    if (h == 1) amp = 1.0f;
                    else if (odd) amp = u / float(h * h) * ((h / 2) % 2 ? -1.0f : 1.0f);
                } else if (t < 0.66f) {   // tri → saw
                    const float u = (t - 0.33f) / 0.33f;
                    const float tri = odd ? 1.0f / float(h * h) : 0.0f;
                    const float saw = 1.0f / float(h);
                    amp = tri + (saw - tri) * u;
                } else {                  // saw → sqr/puls
                    const float u = (t - 0.66f) / 0.34f;
                    const float saw = 1.0f / float(h);
                    const float sqr = odd ? 1.0f / float(h) : 0.0f;
                    amp = saw + (sqr - saw) * u;
                }
                if (amp != 0.0f) add(f, h, amp);
            }
            normalize(f);
        }
        // Bank 1 — Vocal: twee formant-pieken die door de reeks schuiven.
        for (int fr = 0; fr < kFrames; ++fr) {
            float* f = B[1][fr];
            const float f1 = 2.0f + fr * 0.9f;      // formant 1 (harm.)
            const float f2 = 6.0f + fr * 2.0f;      // formant 2
            for (int h = 1; h <= 24; ++h) {
                const float d1 = (h - f1) / 1.2f;
                const float d2 = (h - f2) / 2.0f;
                const float amp = expf(-d1 * d1) + 0.6f * expf(-d2 * d2)
                                + 0.15f / float(h);
                add(f, h, amp);
            }
            normalize(f);
        }
        // Bank 2 — Harmonics: drawbar-opbouw 1 → 1+2 → ... → vol orgel.
        for (int fr = 0; fr < kFrames; ++fr) {
            float* f = B[2][fr];
            static constexpr int kBars[] = { 1, 2, 3, 4, 6, 8, 10, 12 };
            for (int k = 0; k <= fr; ++k) add(f, kBars[k], 1.0f / (k + 1));
            normalize(f);
        }
        // Bank 3 — Digital: spectra met gaten en fase-flips (klokkig/hard).
        for (int fr = 0; fr < kFrames; ++fr) {
            float* f = B[3][fr];
            for (int h = 1; h <= 24; ++h) {
                if (((h * (fr + 2)) % (fr + 3)) == 0) continue;   // gaten
                const float amp = 1.0f / float(1 + ((h * 7) % (fr + 2)));
                add(f, h, amp, (h % 3) * 2.0f);
            }
            normalize(f);
        }
        // Bank 4 — USER: start als sinus zodat hij nooit stil is.
        for (int fr = 0; fr < kFrames; ++fr) {
            add(B[4][fr], 1, 1.0f);
            normalize(B[4][fr]);
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
        if      (portId == "voct")             voice_.setVoct(value);
        else if (cvPortIs(portId, "morph"))    voice_.setMorphCv(value);
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
