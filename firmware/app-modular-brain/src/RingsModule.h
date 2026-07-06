#pragma once
/**
 * @file RingsModule.h
 * @brief Mutable Instruments *Rings* resonator als MusicBrain-module
 *        (typeId `tp_mmb_rings`).
 *
 * @details
 * Wrapper rond de gevendorde Rings-DSP (`firmware/lib/mi-rings`, MIT,
 * (c) Emilie Gillet). Rings is een resonator: een korte interne excitatie
 * ("strum") wordt door een modaal / sympathetic-string / string-model
 * gestuurd. De module is intern polyfoon (1/2/4 stemmen, roterend per strum).
 *
 * Architectuur identiek aan ElementsModule (FW-AU-9), inclusief de daar
 * geleerde lessen:
 *  - **48 kHz → 44.1 kHz** lineaire resampling in `update()`.
 *  - **Genulde allocatie** via class-level `operator new`: de MI-DSP rekent
 *    op BSS-genulde statics; heap-garbage gaf NaN's/hard faults.
 *  - Delay-lines via de stmlib `DelayLine`-heap-fallback (zie
 *    mi-elements/stmlib/dsp/delay_line.h) — geen VoiceBuffers-gedoe nodig.
 *  - NaN-vangnet + peak-meter in de resample-lus (telemetrie).
 *
 * Port map:
 * | Dir | portId       | Kind  | Betekenis                                  |
 * |-----|--------------|-------|--------------------------------------------|
 * | in  | `voct`       | Cv    | Toonhoogte (V/Oct, MIDI 60 = 0 V)          |
 * | in  | `gate`       | Gate  | Strum op stijgende flank                   |
 * | in  | `structure`  | Cv    | (ook `structure_cv`) resonator-structuur   |
 * | in  | `brightness` | Cv    | (ook `brightness_cv`)                      |
 * | in  | `damping`    | Cv    | (ook `damping_cv`)                         |
 * | in  | `position`   | Cv    | (ook `position_cv`)                        |
 * | out | `out_l`      | Audio | Odd-uitgang (even/odd stem-split)          |
 * | out | `out_r`      | Audio | Even-uitgang                               |
 *
 * Controls: `structure` `brightness` `damping` `position` (0..1),
 * `model` (0..5: modal, sympathetic, string, fm, quantized, string+verb),
 * `polyphony` (0..2 → 1/2/4 stemmen), `coarse` (semitonen), `fine` (centen),
 * `level` (0..1).
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

// Gevendorde upstream Rings-DSP (MIT, (c) Emilie Gillet):
// firmware/lib/mi-rings. Zie VENDORED-notitie in library.json aldaar.
#include "rings/dsp/part.h"
#include "rings/dsp/patch.h"
#include "rings/dsp/performance_state.h"
#include "rings/dsp/strummer.h"

namespace mmb_link {

// ---------------------------------------------------------------------------
// RingsVoice — Teensy AudioStream wrapper rond rings::Part.
// ---------------------------------------------------------------------------
class RingsVoice : public AudioStream {
public:
    /// Rings rendert native op 48 kHz in blokken van max 24 samples.
    static constexpr float kRingsRate = 48000.0f;
    /// Bron-samples per uitgangssample (48000 / 44100 ≈ 1.088 — downsample).
    static constexpr float kStep = 48000.0f / AUDIO_SAMPLE_RATE_EXACT;

    RingsVoice()
        : AudioStream(0, inputQueue_)
    {
        ps_.strum            = false;
        ps_.internal_exciter = true;    // interne pluk-excitatie
        ps_.internal_strum   = false;   // wij strummen expliciet via `gate`
        ps_.internal_note    = false;
        ps_.tonic            = 0.0f;
        ps_.note             = 60.0f;   // C4
        ps_.fm               = 0.0f;
        ps_.chord            = 0;
        patch_.structure  = 0.4f;
        patch_.brightness = 0.6f;
        patch_.damping    = 0.6f;
        patch_.position   = 0.3f;
        // Strummer draait op block-rate, exact zoals rings/rings.cc.
        strummer_.Init(0.01f, kRingsRate / rings::kMaxBlockSize);
        // Reverb-buffer (64 KB) op de heap; bij OOM blijft ready_ false en
        // zwijgt update() in plaats van te crashen (zelfde patroon als
        // ElementsReverbStream).
        reverbBuf_.reset(new (std::nothrow) uint16_t[32768]());
        if (reverbBuf_) {
            part_.Init(reverbBuf_.get());
            part_.set_polyphony(1);
            part_.set_model(rings::RESONATOR_MODEL_MODAL);
            ready_ = true;
            Serial.printf("[rings] init ok (reverb 64 KB @ %p)\n",
                          static_cast<void*>(reverbBuf_.get()));
        } else {
            Serial.println("[rings] reverb-buffer alloc FAILED — module blijft stil");
        }
    }

    void setNote(float midiNote) { ps_.note = midiNote; }
    void strum()                 { strumPending_ = true; }

    rings::Patch& patch() { return patch_; }
    rings::Part&  part()  { return part_; }

    bool  dspReady() const { return ready_; }
    float takePeak() { const float p = peak_; peak_ = 0.0f; return p; }

    void update() override {
        // AudioStream's basisconstructor linkt dit object al in de update-
        // lijst vóórdat de DSP geïnitialiseerd is — tot die tijd stil zijn.
        if (!ready_) return;

        audio_block_t* outL = allocate();
        audio_block_t* outR = allocate();
        if (!outL || !outR) {
            if (outL) release(outL);
            if (outR) release(outR);
            return;
        }

        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            float yL = s0L_ + (s1L_ - s0L_) * phase_;   // lineaire interpolatie
            float yR = s0R_ + (s1R_ - s0R_) * phase_;
            phase_ += kStep;
            while (phase_ >= 1.0f) {
                phase_ -= 1.0f;
                s0L_ = s1L_;
                s0R_ = s1R_;
                nextSourceSample(s1L_, s1R_);
            }
            // NaN-vangnet + peak-meter (zelfde diagnose-patroon als Elements).
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

    void setLevel(float l) { level_ = l; }

private:
    inline void nextSourceSample(float& l, float& r) {
        if (srcRead_ >= srcAvail_) generateBlock();
        l = srcBufMain_[srcRead_];
        r = srcBufAux_[srcRead_++];
    }

    void generateBlock() {
        static const float kSilence[rings::kMaxBlockSize] = {};
        float out[rings::kMaxBlockSize];
        float aux[rings::kMaxBlockSize];
        // Strum-flag geldt voor precies één blok; de Strummer debounced en
        // verfijnt hem (zoals de CV-trigger-flow in rings/rings.cc).
        ps_.strum = strumPending_;
        strumPending_ = false;
        strummer_.Process(nullptr, rings::kMaxBlockSize, &ps_);
        part_.Process(ps_, patch_, kSilence, out, aux, rings::kMaxBlockSize);
        for (size_t i = 0; i < rings::kMaxBlockSize; ++i) {
            srcBufMain_[i] = out[i];
            srcBufAux_[i]  = aux[i];
        }
        srcAvail_ = static_cast<int>(rings::kMaxBlockSize);
        srcRead_  = 0;
    }

    audio_block_t*            inputQueue_[1] = { nullptr };
    volatile bool             ready_ = false;
    volatile bool             strumPending_ = false;
    float                     level_ = 0.8f;
    volatile float            peak_  = 0.0f;
    std::unique_ptr<uint16_t[]> reverbBuf_;

    rings::Part              part_;
    rings::Strummer          strummer_;
    rings::PerformanceState  ps_{};
    rings::Patch             patch_{};

    // 48 kHz → 44.1 kHz resampler-staat (stereo odd/even).
    float srcBufMain_[rings::kMaxBlockSize] = {};
    float srcBufAux_[rings::kMaxBlockSize]  = {};
    int   srcRead_  = 0;
    int   srcAvail_ = 0;
    float phase_ = 0.0f;
    float s0L_ = 0.0f, s1L_ = 0.0f, s0R_ = 0.0f, s1R_ = 0.0f;
};

// ---------------------------------------------------------------------------
// RingsModule — AudioModule wrapper (tp_mmb_rings).
// ---------------------------------------------------------------------------
class RingsModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_rings";

    /// Genulde allocatie — zie ElementsModule voor de volledige rationale:
    /// de MI-DSP is geschreven voor BSS-genulde statics; heap-garbage gaf
    /// daar NaN-ketens en wilde pointers. Nul het object vóór constructie.
    static void* operator new(std::size_t n) {
        void* p = ::malloc(n);
        if (p) std::memset(p, 0, n);
        return p;
    }
    static void operator delete(void* p) { ::free(p); }

    explicit RingsModule(std::string_view id)
        : AudioModule(kTypeId, id) {}

    RingsVoice& voice() { return voice_; }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out" || portId == "out_l")
            return { const_cast<RingsVoice*>(&voice_), 0, true };
        if (portId == "out_r")
            return { const_cast<RingsVoice*>(&voice_), 1, true };
        return {};
    }
    AudioPort inputPort(std::string_view /*portId*/) const override {
        return {};  // voct / gate / parameter-CV's zijn CV-domein
    }

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out" || portId == "out_l" || portId == "out_r")
                   ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "voct") return PortKind::Cv;
        if (portId == "gate" || portId == "strum") return PortKind::Gate;
        if (cvPortIs(portId, "structure") || cvPortIs(portId, "brightness") ||
            cvPortIs(portId, "damping")   || cvPortIs(portId, "position"))
            return PortKind::Cv;
        return PortKind::None;
    }

    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct") {
            voct_ = value;
            applyPitch();
        } else if (portId == "gate" || portId == "strum") {
            const bool high = value >= 0.5f;
            if (high && !lastGateHigh_) {
                applyPitch();
                voice_.strum();
            }
            lastGateHigh_ = high;
        } else if (cvPortIs(portId, "structure")) {
            voice_.patch().structure = clamp01(value);
        } else if (cvPortIs(portId, "brightness")) {
            voice_.patch().brightness = clamp01(value);
        } else if (cvPortIs(portId, "damping")) {
            voice_.patch().damping = clamp01(value);
        } else if (cvPortIs(portId, "position")) {
            voice_.patch().position = clamp01(value);
        }
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>  (&value)) return *f;
            if (auto* i = std::get_if<int32_t>(&value)) return static_cast<float>(*i);
            return fallback;
        };
        if      (controlId == "structure")  voice_.patch().structure  = clamp01(asFloat(0.4f));
        else if (controlId == "brightness") voice_.patch().brightness = clamp01(asFloat(0.6f));
        else if (controlId == "damping")    voice_.patch().damping    = clamp01(asFloat(0.6f));
        else if (controlId == "position")   voice_.patch().position   = clamp01(asFloat(0.3f));
        else if (controlId == "model") {
            int m = static_cast<int>(asFloat(0.0f));
            if (m < 0) m = 0;
            if (m >= rings::RESONATOR_MODEL_LAST) m = rings::RESONATOR_MODEL_LAST - 1;
            voice_.part().set_model(static_cast<rings::ResonatorModel>(m));
        }
        else if (controlId == "polyphony") {
            // Switch-indices 0/1/2 → 1/2/4 stemmen (roterend per strum).
            const int idx = static_cast<int>(asFloat(0.0f));
            voice_.part().set_polyphony(idx <= 0 ? 1 : idx == 1 ? 2 : 4);
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
                return std::make_unique<RingsModule>(id);
            });
    }

private:
    static float clamp01(float v) {
        return v < 0.0f ? 0.0f : v > 1.0f ? 1.0f : v;
    }
    /// V/Oct + coarse/fine → MIDI-noot. Rings-pitch = tonic + note; wij
    /// houden tonic 0 en sturen de absolute noot (MIDI 60 = 0 V).
    void applyPitch() {
        voice_.setNote(60.0f + 12.0f * voct_ + coarse_ + fine_ / 100.0f);
    }

    mutable RingsVoice voice_;
    float voct_         = 0.0f;
    float coarse_       = 0.0f;
    float fine_         = 0.0f;
    bool  lastGateHigh_ = false;
};

}  // namespace mmb_link
