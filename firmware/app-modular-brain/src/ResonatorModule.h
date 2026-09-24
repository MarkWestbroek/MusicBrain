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
 * Delaylijnen op de heap (12 × 1600 float ≈ 75 KB). De DSP zelf is de kernel
 * `mmb_dsp::Resonator` (firmware/lib/mmb-dsp), gedeeld met de browser.
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

#include "mmb_dsp/resonator.h"

namespace mmb_link {

/** @brief AudioStream-schil rond de kernel @ref mmb_dsp::Resonator: int16
 *  erin, float door de kernel, geklemd weer int16 eruit. De DSP zelf staat in
 *  firmware/lib/mmb-dsp/mmb_dsp/resonator.h, dezelfde code als de
 *  browser-simulator draait (bit-identiek geverifieerd tegen de oude inline
 *  versie, 2026-09-24). */
class ResonatorVoice : public AudioStream {
public:
    static constexpr int kStrings = mmb_dsp::Resonator::kStrings;
    static constexpr int kMaxLen  = mmb_dsp::Resonator::kMaxLen;

    ResonatorVoice() : AudioStream(1, inputQueueArray_) {
        buf_ = new (std::nothrow) float[kStrings * kMaxLen]();
        res_.Init(AUDIO_SAMPLE_RATE_EXACT, buf_);
    }

    void setRoot(float semis)   { res_.setRoot(semis); }
    void setVoct(float v)       { res_.setVoct(v); }
    void setScale(int s)        { res_.setScale(s); }
    void setStructure(float v)  { res_.setStructure(v); }
    void setStructureCv(float v){ res_.setStructureCv(v); }
    void setDecay(float v)      { res_.setDecay(v); }
    void setDamping(float v)    { res_.setDamping(v); }
    void setMix(float v)        { res_.setMix(v); }
    void setLevel(float v)      { res_.setLevel(v); }

    float takePeak() { const float p = peak_; peak_ = 0.0f; return p * (1.0f / 32768.0f); }

    void update() override {
        audio_block_t* in = receiveReadOnly(0);
        audio_block_t* out = allocate();
        if (!out) { if (in) release(in); return; }
        if (!res_.ready()) {                // heap-OOM: dry-through
            if (in) { memcpy(out->data, in->data, sizeof(out->data)); release(in); }
            else memset(out->data, 0, sizeof(out->data));
            transmit(out, 0); release(out); return;
        }
        constexpr float kInv = 1.0f / 32768.0f;
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            const float x = in ? in->data[i] * kInv : 0.0f;
            float y = res_.Tick(x);
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
    audio_block_t* inputQueueArray_[1] = { nullptr };
    float* buf_ = nullptr;
    mmb_dsp::Resonator res_;
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
