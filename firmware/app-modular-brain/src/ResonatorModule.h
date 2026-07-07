#pragma once
/**
 * @file ResonatorModule.h
 * @brief Sympathetic-resonator-bank (typeId `tp_mmb_resonator`, FW-FX-6):
 *        12 gestemde snaar-resonatoren die meetrillen met het ingangssignaal.
 *
 * @details
 * Zelf-gemodelleerd (geen upstream-bron). Twaalf Karplus-Strong-achtige
 * comb-resonatoren (feedback-delaylijn met een demp-lowpass in de lus) staan
 * gestemd op een schaal rond een grondtoon. Het audio-ingangssignaal
 * excite't ze allemaal tegelijk; snaren die harmonisch verwant zijn aan wat
 * je speelt gaan meeklinken (sympathetische resonantie), ook de niet-direct-
 * aangeslagen "snaren". Dat is de rijkdom van een sitar- of piano-klankkast,
 * berekend i.p.v. gesampeld — dus mét de dynamiek van de excitatie.
 *
 * Goedkoop: 12 × (fractionele delay-read + one-pole + write) ≈ enkele % CPU.
 * Delaylijnen op de heap (12 × 1600 float ≈ 75 KB).
 *
 * Port map:
 * | Dir | portId | Kind  | Betekenis                               |
 * |-----|--------|-------|------------------------------------------|
 * | in  | `in`   | Audio | Excitatie (de "aanslag")                |
 * | in  | `voct` | Cv    | Grondtoon (1 V/oct rond C2)             |
 * | in  | `struct`/`struct_cv` | Cv | Structuur (spreiding tuning) |
 * | out | `out`  | Audio | Resonatie (nat)                         |
 * | out | `mix`  | Audio | Dry/wet-mengsel (mix-knop)              |
 *
 * Controls: `root` (grondnoot semitonen rond C2), `scale` (0=chromatisch,
 * 1=majeur, 2=mineur, 3=kwint/octaaf, 4=harmonisch), `structure` (0..1 spreidt
 * de stemming uit), `decay` (0..1 → resonantietijd/feedback), `damping`
 * (0..1 → helderheid; laag = donker), `mix` (0..1 dry→wet), `level` (0..1).
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <memory>
#include <new>
#include <string_view>

namespace mmb_link {

/** @brief Bank van 12 gestemde snaar-resonatoren als AudioStream. */
class ResonatorVoice : public AudioStream {
public:
    static constexpr int kStrings = 12;
    static constexpr int kMaxLen  = 1600;   ///< laagste ~27.6 Hz @ 44.1k.

    ResonatorVoice() : AudioStream(1, inputQueueArray_) {
        buf_ = new (std::nothrow) float[kStrings * kMaxLen]();
        retune();
    }

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

    float takePeak() { const float p = peak_; peak_ = 0.0f; return p * (1.0f / 32768.0f); }

    void update() override {
        audio_block_t* in = receiveReadOnly(0);
        audio_block_t* out = allocate();
        if (!out) { if (in) release(in); return; }
        if (!buf_) {                        // heap-OOM: dry-through
            if (in) { memcpy(out->data, in->data, sizeof(out->data)); release(in); }
            else memset(out->data, 0, sizeof(out->data));
            transmit(out, 0); release(out); return;
        }
        constexpr float kInv = 1.0f / 32768.0f;
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            const float x = in ? in->data[i] * kInv : 0.0f;
            float wet = 0.0f;
            for (int s = 0; s < kStrings; ++s) wet += processString(s, x);
            wet *= (0.9f / kStrings);       // sommatie-normalisatie
            float y = (x * (1.0f - mix_) + wet * mix_) * level_;
            if (y >  1.0f) y =  1.0f;
            if (y < -1.0f) y = -1.0f;
            const float a = y < 0 ? -y : y;
            if (a > peak_) peak_ = a;
            out->data[i] = static_cast<int16_t>(y * 32767.0f);
        }
        transmit(out, 0);
        release(out);
        if (in) release(in);
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
            float d = AUDIO_SAMPLE_RATE_EXACT / hz;
            if (d < 2.0f) d = 2.0f;
            if (d > kMaxLen - 2) d = kMaxLen - 2;
            delay_[s] = d;
        }
    }

    audio_block_t* inputQueueArray_[1] = { nullptr };
    float* buf_ = nullptr;
    float  delay_[kStrings] = {};
    float  lp_[kStrings]    = {};
    int    wpos_[kStrings]  = {};

    float root_ = 0.0f, voct_ = 0.0f, structure_ = 0.3f, structCv_ = 0.0f;
    int   scale_ = 1;
    float feedback_ = 0.981f, damp_ = 0.5f, mix_ = 0.6f, level_ = 0.8f;  // = decay 0.7
    volatile float peak_ = 0.0f;
};

/** @brief Module-wrapper rond @ref ResonatorVoice. */
class ResonatorModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_resonator";

    explicit ResonatorModule(std::string_view id)
        : AudioModule(kTypeId, id) {}

    ResonatorVoice& voice() { return voice_; }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out" || portId == "mix")
            return { const_cast<ResonatorVoice*>(&voice_), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "in")
            return { const_cast<ResonatorVoice*>(&voice_), 0, true };
        return {};
    }

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out" || portId == "mix") ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "in")   return PortKind::Audio;
        if (portId == "voct") return PortKind::Cv;
        if (cvPortIs(portId, "struct")) return PortKind::Cv;
        return PortKind::None;
    }

    void writeCvPort(std::string_view portId, float value) override {
        if      (portId == "voct")          voice_.setVoct(value);
        else if (cvPortIs(portId, "struct")) voice_.setStructureCv(value);
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            return fb;
        };
        if      (controlId == "root")      voice_.setRoot(asFloat(0.0f));
        else if (controlId == "scale")     voice_.setScale(static_cast<int>(asFloat(1.0f)));
        else if (controlId == "structure") voice_.setStructure(asFloat(0.3f));
        else if (controlId == "decay")     voice_.setDecay(asFloat(0.7f));
        else if (controlId == "damping")   voice_.setDamping(asFloat(0.5f));
        else if (controlId == "mix")       voice_.setMix(asFloat(0.6f));
        else if (controlId == "level")     voice_.setLevel(asFloat(0.8f));
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<ResonatorModule>(id);
            });
    }

private:
    mutable ResonatorVoice voice_;
};

}  // namespace mmb_link
