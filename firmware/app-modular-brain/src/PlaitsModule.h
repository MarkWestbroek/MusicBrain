#pragma once
/**
 * @file PlaitsModule.h
 * @brief Mutable Instruments *Plaits* macro-oscillator als MusicBrain-module
 *        (typeId `tp_mmb_plaits`).
 *
 * @details
 * Wrapper rond de gevendorde Plaits-DSP (`firmware/lib/mi-plaits`, MIT,
 * (c) Emilie Gillet): één module met 16 synth-engines — van virtual-analog
 * en FM tot granular, spraak, modaal en drums. Engine-keuze via de
 * `engine`-control; `harmonics`/`timbre`/`morph` zijn de drie macro-knoppen.
 *
 * Zelfde architectuur en lessen als Elements/Rings (FW-AU-9/11):
 * 48 kHz → 44.1 kHz resampling, genulde allocatie, NaN-vangnet, peak-meter.
 * Plaits' werkgeheugen is één 16 KB-blok via stmlib::BufferAllocator (heap).
 *
 * Port map:
 * | Dir | portId      | Kind  | Betekenis                                    |
 * |-----|-------------|-------|----------------------------------------------|
 * | in  | `voct`      | Cv    | Toonhoogte (V/Oct, MIDI 60 = 0 V)            |
 * | in  | `gate`      | Gate  | Trigger (excitatie/envelope, `trig` alias)   |
 * | in  | `harmonics` | Cv    | (ook `harmonics_cv`) macro 1                 |
 * | in  | `timbre`    | Cv    | (ook `timbre_cv`) macro 2                    |
 * | in  | `morph`     | Cv    | (ook `morph_cv`) macro 3                     |
 * | in  | `level`     | Cv    | (ook `level_cv`) interne LPG-level           |
 * | out | `out_l`     | Audio | Hoofd-uitgang (OUT)                          |
 * | out | `out_r`     | Audio | AUX-uitgang (variant/sub)                    |
 *
 * Controls: `engine` (0..15), `harmonics` `timbre` `morph` (0..1),
 * `decay` (0..1, interne LPG), `lpg` (0..1, LPG-kleur), `coarse` (semitonen),
 * `fine` (centen), `level` (0..1 uitgang).
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <new>
#include <string_view>

// Gevendorde upstream Plaits-DSP (MIT, (c) Emilie Gillet):
// firmware/lib/mi-plaits.
//
// Teensy's Audio-lib (synth_waveform.h) definieert WAVEFORM_* als macro's;
// plaits' fm/lfo.h gebruikt dezelfde namen als enum-waarden. Push/undef/pop
// zodat beide werelden elkaar in deze vertaal-eenheid niet raken.
#pragma push_macro("WAVEFORM_SINE")
#pragma push_macro("WAVEFORM_SQUARE")
#pragma push_macro("WAVEFORM_TRIANGLE")
#pragma push_macro("WAVEFORM_SAWTOOTH")
#pragma push_macro("WAVEFORM_PULSE")
#undef WAVEFORM_SINE
#undef WAVEFORM_SQUARE
#undef WAVEFORM_TRIANGLE
#undef WAVEFORM_SAWTOOTH
#undef WAVEFORM_PULSE
#include "plaits/dsp/voice.h"
#include "stmlib/utils/buffer_allocator.h"
#pragma pop_macro("WAVEFORM_PULSE")
#pragma pop_macro("WAVEFORM_SAWTOOTH")
#pragma pop_macro("WAVEFORM_TRIANGLE")
#pragma pop_macro("WAVEFORM_SQUARE")
#pragma pop_macro("WAVEFORM_SINE")

namespace mmb_link {

// ---------------------------------------------------------------------------
// PlaitsVoice — Teensy AudioStream wrapper rond plaits::Voice.
// ---------------------------------------------------------------------------
class PlaitsVoice : public AudioStream {
public:
    static constexpr float kPlaitsRate = 48000.0f;
    static constexpr float kStep = 48000.0f / AUDIO_SAMPLE_RATE_EXACT;
    static constexpr size_t kSharedBufferSize = 16384;

    PlaitsVoice()
        : AudioStream(0, inputQueue_)
    {
        patch_.note = 60.0f;
        patch_.harmonics = 0.5f;
        patch_.timbre = 0.5f;
        patch_.morph = 0.5f;
        patch_.frequency_modulation_amount = 0.0f;
        patch_.timbre_modulation_amount = 0.0f;
        patch_.morph_modulation_amount = 0.0f;
        patch_.engine = 0;
        patch_.decay = 0.5f;
        patch_.lpg_colour = 0.5f;
        mods_.engine = 0.0f;
        mods_.note = 0.0f;
        mods_.frequency = 0.0f;
        mods_.harmonics = 0.0f;
        mods_.timbre = 0.0f;
        mods_.morph = 0.0f;
        mods_.trigger = 0.0f;
        mods_.level = 1.0f;
        mods_.frequency_patched = false;
        mods_.timbre_patched = false;
        mods_.morph_patched = false;
        // trigger_patched aan: wij leveren expliciete triggers via `gate`,
        // net als een gepatchte trig-jack op de hardware (interne LPG vuurt
        // per trigger in plaats van vrij te lopen).
        mods_.trigger_patched = true;
        mods_.level_patched = false;
        // Plaits' complete werkgeheugen: één 16 KB-blok (BufferAllocator).
        sharedBuf_.reset(new (std::nothrow) char[kSharedBufferSize]());
        if (sharedBuf_) {
            stmlib::BufferAllocator allocator(sharedBuf_.get(), kSharedBufferSize);
            voice_.Init(&allocator);
            ready_ = true;
            Serial.printf("[plaits] init ok (werkbuffer 16 KB @ %p)\n",
                          static_cast<void*>(sharedBuf_.get()));
        } else {
            Serial.println("[plaits] werkbuffer alloc FAILED — module blijft stil");
        }
    }

    plaits::Patch& patch() { return patch_; }

    void setNote(float midiNote) { patch_.note = midiNote; }
    void trigger(bool high)      { mods_.trigger = high ? 1.0f : 0.0f; }
    void setLevelCv(float v)     { mods_.level = v; mods_.level_patched = true; }
    void setLevel(float l)       { level_ = l; }

    bool  dspReady() const { return ready_; }
    float takePeak() { const float p = peak_; peak_ = 0.0f; return p; }

    void update() override {
        if (!ready_) return;

        audio_block_t* outL = allocate();
        audio_block_t* outR = allocate();
        if (!outL || !outR) {
            if (outL) release(outL);
            if (outR) release(outR);
            return;
        }

        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            float yL = s0L_ + (s1L_ - s0L_) * phase_;
            float yR = s0R_ + (s1R_ - s0R_) * phase_;
            phase_ += kStep;
            while (phase_ >= 1.0f) {
                phase_ -= 1.0f;
                s0L_ = s1L_;
                s0R_ = s1R_;
                nextSourceSample(s1L_, s1R_);
            }
            if (!(yL == yL)) yL = 0.0f;
            if (!(yR == yR)) yR = 0.0f;
            const float aL = yL < 0.0f ? -yL : yL;
            if (aL > peak_) peak_ = aL;
            yL *= level_;
            yR *= level_;
            if (yL > 1.0f) yL = 1.0f; else if (yL < -1.0f) yL = -1.0f;
            if (yR > 1.0f) yR = 1.0f; else if (yR < -1.0f) yR = -1.0f;
            outL->data[i] = static_cast<int16_t>(yL * 32767.0f);
            outR->data[i] = static_cast<int16_t>(yR * 32767.0f);
        }

        transmit(outL, 0);
        transmit(outR, 1);
        release(outL);
        release(outR);
    }

private:
    inline void nextSourceSample(float& l, float& r) {
        if (srcRead_ >= srcAvail_) generateBlock();
        l = srcBufMain_[srcRead_];
        r = srcBufAux_[srcRead_++];
    }

    void generateBlock() {
        plaits::Voice::Frame frames[plaits::kBlockSize];
        voice_.Render(patch_, mods_, frames, plaits::kBlockSize);
        constexpr float kInv = 1.0f / 32768.0f;
        for (size_t i = 0; i < plaits::kBlockSize; ++i) {
            srcBufMain_[i] = static_cast<float>(frames[i].out) * kInv;
            srcBufAux_[i]  = static_cast<float>(frames[i].aux) * kInv;
        }
        srcAvail_ = static_cast<int>(plaits::kBlockSize);
        srcRead_  = 0;
    }

    audio_block_t*  inputQueue_[1] = { nullptr };
    volatile bool   ready_ = false;
    float           level_ = 0.8f;
    volatile float  peak_  = 0.0f;
    std::unique_ptr<char[]> sharedBuf_;

    plaits::Voice        voice_;
    plaits::Patch        patch_{};
    plaits::Modulations  mods_{};

    // 48 kHz → 44.1 kHz resampler-staat (out/aux).
    float srcBufMain_[plaits::kBlockSize] = {};
    float srcBufAux_[plaits::kBlockSize]  = {};
    int   srcRead_  = 0;
    int   srcAvail_ = 0;
    float phase_ = 0.0f;
    float s0L_ = 0.0f, s1L_ = 0.0f, s0R_ = 0.0f, s1R_ = 0.0f;
};

// ---------------------------------------------------------------------------
// PlaitsModule — AudioModule wrapper (tp_mmb_plaits).
// ---------------------------------------------------------------------------
class PlaitsModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_plaits";

    /// Genulde allocatie — zie ElementsModule: de MI-DSP rekent op genulde
    /// (BSS-)staat; heap-garbage gaf daar NaN-ketens en wilde pointers.
    static void* operator new(std::size_t n) {
        void* p = ::malloc(n);
        if (p) std::memset(p, 0, n);
        return p;
    }
    static void operator delete(void* p) { ::free(p); }

    explicit PlaitsModule(std::string_view id)
        : AudioModule(kTypeId, id) {}

    PlaitsVoice& voice() { return voice_; }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out" || portId == "out_l")
            return { const_cast<PlaitsVoice*>(&voice_), 0, true };
        if (portId == "out_r" || portId == "aux")
            return { const_cast<PlaitsVoice*>(&voice_), 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view /*portId*/) const override {
        return {};
    }

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out" || portId == "out_l" ||
                portId == "out_r" || portId == "aux")
                   ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "voct") return PortKind::Cv;
        if (portId == "gate" || portId == "trig") return PortKind::Gate;
        if (cvPortIs(portId, "harmonics") || cvPortIs(portId, "timbre") ||
            cvPortIs(portId, "morph")     || cvPortIs(portId, "level"))
            return PortKind::Cv;
        return PortKind::None;
    }

    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct") {
            voct_ = value;
            applyPitch();
        } else if (portId == "gate" || portId == "trig") {
            voice_.trigger(value >= 0.5f);
        } else if (cvPortIs(portId, "harmonics")) {
            voice_.patch().harmonics = clamp01(value);
        } else if (cvPortIs(portId, "timbre")) {
            voice_.patch().timbre = clamp01(value);
        } else if (cvPortIs(portId, "morph")) {
            voice_.patch().morph = clamp01(value);
        } else if (cvPortIs(portId, "level")) {
            voice_.setLevelCv(clamp01(value));
        }
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>  (&value)) return *f;
            if (auto* i = std::get_if<int32_t>(&value)) return static_cast<float>(*i);
            return fallback;
        };
        if      (controlId == "harmonics") voice_.patch().harmonics = clamp01(asFloat(0.5f));
        else if (controlId == "timbre")    voice_.patch().timbre    = clamp01(asFloat(0.5f));
        else if (controlId == "morph")     voice_.patch().morph     = clamp01(asFloat(0.5f));
        else if (controlId == "decay")     voice_.patch().decay     = clamp01(asFloat(0.5f));
        else if (controlId == "lpg")       voice_.patch().lpg_colour = clamp01(asFloat(0.5f));
        else if (controlId == "engine") {
            int e = static_cast<int>(asFloat(0.0f));
            if (e < 0) e = 0;
            if (e > 15) e = 15;
            voice_.patch().engine = e;
        }
        else if (controlId == "coarse") { coarse_ = asFloat(0.0f); applyPitch(); }
        else if (controlId == "fine")   { fine_   = asFloat(0.0f); applyPitch(); }
        else if (controlId == "level")  voice_.setLevel(clamp01(asFloat(0.8f)));
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<PlaitsModule>(id);
            });
    }

private:
    static float clamp01(float v) {
        return v < 0.0f ? 0.0f : v > 1.0f ? 1.0f : v;
    }
    void applyPitch() {
        voice_.setNote(60.0f + 12.0f * voct_ + coarse_ + fine_ / 100.0f);
    }

    mutable PlaitsVoice voice_;
    float voct_   = 0.0f;
    float coarse_ = 0.0f;
    float fine_   = 0.0f;
};

}  // namespace mmb_link
