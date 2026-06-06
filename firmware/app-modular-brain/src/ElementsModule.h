#pragma once
/**
 * @file ElementsModule.h
 * @brief SPIKE skeleton for porting Mutable Instruments *Elements* (MIT) as a
 *        MusicBrain AudioModule (typeId `tp_mmb_elements`).
 *
 * @details
 * ## What this is
 * Elements is an open-source (MIT) modal / physical-modelling synth voice:
 * an **exciter** (bow / blow / strike) feeds a tuned **resonator** (modal
 * filter bank + optional string model).  Upstream source lives in
 * `mutable-instruments/eurorack` under `elements/dsp/` (`part.cc`,
 * `voice.cc`, `exciter.cc`, `resonator.cc`, `tube.cc`, `string.cc`, …).
 *
 * This file is the **integration layer**.  The real Mutable Instruments DSP is
 * now vendored byte-exact under `lib/mi-elements/` (see its `VENDORED.md`) and
 * driven here through `elements::Part`.  `ElementsVoice` renders the Part at its
 * native 32 kHz and linearly resamples to the Teensy's 44.1 kHz audio rate.
 *
 * ## Porting notes (M4 @ 168 MHz → Teensy 4.1 M7 @ 600 MHz + FPU)
 * - **Sample rate:** Elements runs internally at **32 kHz** in blocks of 16
 *   samples; the Teensy Audio lib runs at **44.1 kHz** in blocks of 128.
 *   The wrapper must resample 32 kHz → 44.1 kHz (and any external blow/strike
 *   input the other way).  For the skeleton we run the stub directly at the
 *   Teensy rate; see `kElementsRate` / `TODO(resample)` in `ElementsVoice`.
 * - **stmlib / CMSIS-DSP:** replace `stmlib` fixed-point helpers and CMSIS
 *   intrinsics with plain float math (the M7 FPU makes this cheap).
 * - **Memory:** Elements reverb/resonator buffers are modest; allocate as
 *   members, never in the audio ISR.
 *
 * ## Port map (target — for app-modular-brain integration)
 * | Direction | portId    | Domain | Meaning                              |
 * |-----------|-----------|--------|--------------------------------------|
 * | input     | `voct`    | Cv     | pitch (V/Oct, MIDI 60 = 0 V)         |
 * | input     | `gate`    | Gate   | rising edge → strike / note-on       |
 * | input     | `strength`| Cv     | exciter strength / contour           |
 * | input     | `blow_in` | Audio  | external blow excitation (optional)  |
 * | input     | `strike_in`| Audio | external strike excitation (optional)|
 * | output    | `out`     | Audio  | main (aux+main mixed) voice output   |
 *
 * ## Controls (target)
 * | controlId   | type  | maps to Elements param        |
 * |-------------|-------|-------------------------------|
 * | `exciter`   | int   | bow / blow / strike model     |
 * | `geometry`  | float | resonator geometry            |
 * | `brightness`| float | resonator brightness          |
 * | `damping`   | float | resonator damping             |
 * | `position`  | float | excitation position           |
 * | `space`     | float | reverb / space amount         |
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <string_view>

// Genuine upstream Mutable Instruments *Elements* DSP (MIT, (c) Emilie Gillet),
// vendored under firmware/app-elements/lib/mi-elements. See VENDORED.md there.
#include "elements/dsp/dsp.h"
#include "elements/dsp/part.h"

namespace mmb_link {

// ---------------------------------------------------------------------------
// ElementsVoice — Teensy AudioStream wrapper around elements::Part.
//
// elements::Part runs natively at 32 kHz in blocks of up to 16 samples; the
// Teensy Audio library runs at 44.1 kHz in blocks of 128.  This class renders
// the Part on demand and linearly resamples 32 kHz -> 44.1 kHz.
//
// 2 audio inputs are declared (0 = blow_in, 1 = strike_in) for the future
// port map, but external excitation is not yet down-sampled into the Part —
// silence is fed for now (the internal bow/blow/strike exciters are active).
// 1 audio output carries the mono "main" voice signal.
// ---------------------------------------------------------------------------
class ElementsVoice : public AudioStream {
public:
    /// Native Elements sample rate (32 kHz).
    static constexpr float kElementsRate = 32000.0f;
    /// Source-samples consumed per output sample (32000 / 44100 ~= 0.7256).
    static constexpr float kStep = 32000.0f / AUDIO_SAMPLE_RATE_EXACT;

    ElementsVoice()
        : AudioStream(2, inputQueue_)
    {
        ps_.gate       = false;
        ps_.note       = 69.0f;   // A4
        ps_.modulation = 0.0f;
        ps_.strength   = 0.8f;
    }

    /// Initialise the DSP.  Call once from setup() before audio starts.
    void begin() {
        part_.Init();
    }

    /// MIDI-style note-on: convert Hz to a MIDI note number and raise the gate.
    void noteOn(float hz, float strength) {
        ps_.note     = 69.0f + 12.0f * log2f(hz / 440.0f);
        ps_.strength = strength;
        ps_.gate     = true;
    }
    /// Release the gate (lets bow/blow exciters stop; strike rings out anyway).
    void noteOff() { ps_.gate = false; }

    void setGate(bool g)         { ps_.gate     = g; }
    void setNote(float midiNote) { ps_.note     = midiNote; }
    void setStrength(float s)    { ps_.strength = s; }
    void setModulation(float m)  { ps_.modulation = m; }

    elements::Part& part() { return part_; }

    void update() override {
        // Drain any connected excitation inputs so blocks don't pile up.
        if (audio_block_t* blow   = receiveReadOnly(0)) release(blow);
        if (audio_block_t* strike = receiveReadOnly(1)) release(strike);

        audio_block_t* outL = allocate();
        audio_block_t* outR = allocate();
        if (!outL || !outR) {
            if (outL) release(outL);
            if (outR) release(outR);
            return;
        }

        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            float yL = s0L_ + (s1L_ - s0L_) * phase_;   // linear interpolation
            float yR = s0R_ + (s1R_ - s0R_) * phase_;
            phase_ += kStep;
            while (phase_ >= 1.0f) {
                phase_ -= 1.0f;
                s0L_ = s1L_;
                s0R_ = s1R_;
                nextSourceSample(s1L_, s1R_);
            }
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
    /// Pull the next 32 kHz stereo sample pair, regenerating a Part block when exhausted.
    inline void nextSourceSample(float& l, float& r) {
        if (srcRead_ >= srcAvail_) generateBlock();
        l = srcBufMain_[srcRead_];
        r = srcBufAux_[srcRead_++];
    }

    void generateBlock() {
        static const float kSilence[elements::kMaxBlockSize] = {};
        float main[elements::kMaxBlockSize];
        float aux[elements::kMaxBlockSize];
        part_.Process(ps_, kSilence, kSilence, main, aux,
                      elements::kMaxBlockSize);
        for (size_t i = 0; i < elements::kMaxBlockSize; ++i) {
            srcBufMain_[i] = main[i];
            srcBufAux_[i]  = aux[i];
        }
        srcAvail_ = static_cast<int>(elements::kMaxBlockSize);
        srcRead_  = 0;
    }

    audio_block_t*             inputQueue_[2] = { nullptr, nullptr };
    elements::Part             part_;
    elements::PerformanceState ps_{};

    // 32 kHz -> 44.1 kHz resampler state (stereo).
    float srcBufMain_[elements::kMaxBlockSize] = {};
    float srcBufAux_[elements::kMaxBlockSize] = {};
    int   srcAvail_ = 0;
    int   srcRead_  = 0;
    float phase_    = 0.0f;
    float s0L_      = 0.0f;
    float s1L_      = 0.0f;
    float s0R_      = 0.0f;
    float s1R_      = 0.0f;
};

// ---------------------------------------------------------------------------
// ElementsModule — AudioModule wrapper (tp_mmb_elements).
//
// Ready to register with the runtime; in the spike, main.cpp drives the voice
// directly.  When integrated into app-modular-brain, AudioGraph wires `out`
// and CvGraph drives `voct` / `gate` / `strength`.
// ---------------------------------------------------------------------------
class ElementsModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_elements";

    explicit ElementsModule(std::string_view id)
        : AudioModule(kTypeId, id) {}

    ElementsVoice& voice() { return voice_; }

    /// Forward to ElementsVoice::begin — bind the OCRAM reverb buffer and
    /// initialise the DSP.  Call once from setup() before audio starts.
    void begin() { voice_.begin(); }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out" || portId == "out_l")
            return { const_cast<ElementsVoice*>(&voice_), 0, true };
        if (portId == "out_r")
            return { const_cast<ElementsVoice*>(&voice_), 1, true };
        return {};
    }

    AudioPort inputPort(std::string_view portId) const override {
        if (portId == "blow_in")
            return { const_cast<ElementsVoice*>(&voice_), 0, true };
        if (portId == "strike_in")
            return { const_cast<ElementsVoice*>(&voice_), 1, true };
        return {};  // voct / gate / strength are CV-domain
    }

    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out" || portId == "out_l" || portId == "out_r")
                   ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "voct")      return PortKind::Cv;
        if (portId == "gate")      return PortKind::Gate;
        if (portId == "strength")  return PortKind::Cv;
        if (portId == "blow_in" || portId == "strike_in") return PortKind::Audio;
        return PortKind::None;
    }

    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct") {
            voct_ = value;
            // Port-map convention: MIDI 60 = 0 V.
            voice_.setNote(60.0f + 12.0f * voct_);
        } else if (portId == "strength") {
            strength_ = value;
            voice_.setStrength(strength_);
        } else if (portId == "gate") {
            const bool high = value >= 0.5f;
            if (high && !lastGateHigh_) {
                voice_.setNote(60.0f + 12.0f * voct_);
                voice_.setStrength(strength_);
            }
            voice_.setGate(high);
            lastGateHigh_ = high;
        }
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>  (&value)) return *f;
            if (auto* i = std::get_if<int32_t>(&value)) return static_cast<float>(*i);
            return fallback;
        };
        elements::Patch* p = voice_.part().mutable_patch();
        if (controlId == "geometry")        p->resonator_geometry   = asFloat(0.2f);
        else if (controlId == "brightness") p->resonator_brightness = asFloat(0.5f);
        else if (controlId == "damping")    p->resonator_damping    = asFloat(0.25f);
        else if (controlId == "position")   p->resonator_position   = asFloat(0.3f);
        else if (controlId == "space")      p->space                = asFloat(0.5f);
        else if (controlId == "envelope")   p->exciter_envelope_shape = asFloat(1.0f);
        else if (controlId == "bow_timbre")    p->exciter_bow_timbre    = asFloat(0.5f);
        else if (controlId == "blow_timbre")   p->exciter_blow_timbre   = asFloat(0.5f);
        else if (controlId == "strike_timbre") p->exciter_strike_timbre = asFloat(0.5f);
        else if (controlId == "blow_meta")     p->exciter_blow_meta     = asFloat(0.5f);
        else if (controlId == "strike_meta")   p->exciter_strike_meta   = asFloat(0.5f);
        else if (controlId == "signature")     p->exciter_signature     = asFloat(0.0f);
        else if (controlId == "mod_freq") {
            const float f = asFloat(0.5f);
            p->resonator_modulation_frequency = (f * 2.0f) / 32000.0f;
        }
        else if (controlId == "mod_offset") p->resonator_modulation_offset = asFloat(0.1f);
        else if (controlId == "fm") {
            const float f = asFloat(0.0f);
            voice_.setModulation(f * 48.0f - 24.0f);
        }
        else if (controlId == "exciter") {
            const int mode = static_cast<int>(asFloat(2.0f));
            p->exciter_bow_level    = (mode == 0) ? 0.8f : 0.0f;
            p->exciter_blow_level   = (mode == 1) ? 0.8f : 0.0f;
            p->exciter_strike_level = (mode == 2) ? 0.8f : 0.0f;
        }
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<ElementsModule>(id);
            });
    }

private:
    mutable ElementsVoice voice_;
    float voct_         = 0.0f;
    float strength_     = 0.8f;
    bool  lastGateHigh_ = false;
};

}  // namespace mmb_link
