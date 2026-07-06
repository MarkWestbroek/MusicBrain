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
#include <cstdlib>
#include <cstring>
#include <memory>
#include <new>
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

    // Delay-line-geheugen voor één Part (float-aantallen). LET OP: de
    // vendored `DelayLine::Init()` zónder buffer laat `line_` op nullptr
    // staan en `Write()` checkt niet — Part::Init(nullptr) is dus een
    // tijdbom die afgaat zodra het bowed/string-pad één sample schrijft
    // (DACCVIOL @0x0). Daarom alloceren we hier één heap-blok en slicen
    // dat in een VoiceBuffers, net als app-elements met zijn statische
    // OCRAM-arrays doet.
    static constexpr size_t kDelayFloats =
        elements::kNumStrings * elements::kDelayLineSize          // string
      + elements::kNumStrings * (elements::kDelayLineSize / 2)    // stretch
      + elements::kMaxBowedModes * elements::kMaxDelayLineSize    // bow
      + 1024;                                                     // diffuser

    ElementsVoice()
        : AudioStream(2, inputQueue_)
    {
        ps_.gate       = false;
        ps_.note       = 69.0f;   // A4
        ps_.modulation = 0.0f;
        ps_.strength   = 0.8f;
        // DSP hier initialiseren: de Registry-factory roept begin() nooit
        // aan. Bij heap-OOM blijft ready_ false → update() blijft stil in
        // plaats van te crashen (~96 KB per instantie).
        delayMem_.reset(new (std::nothrow) float[kDelayFloats]());
        if (delayMem_) {
            float* p = delayMem_.get();
            for (size_t i = 0; i < elements::kNumStrings; ++i) {
                bufs_.string_buf[i] = p;  p += elements::kDelayLineSize;
            }
            for (size_t i = 0; i < elements::kNumStrings; ++i) {
                bufs_.stretch_buf[i] = p; p += elements::kDelayLineSize / 2;
            }
            for (size_t i = 0; i < elements::kMaxBowedModes; ++i) {
                bufs_.resonator_bow_buf[i] = p; p += elements::kMaxDelayLineSize;
            }
            bufs_.diffuser_buf = p;
            part_.Init(&bufs_);
            ready_ = true;
            Serial.printf("[elements] delay-buffers ok: %u KB @ %p\n",
                          static_cast<unsigned>(kDelayFloats * sizeof(float) / 1024),
                          static_cast<void*>(delayMem_.get()));
        } else {
            Serial.printf("[elements] delay-buffer alloc FAILED (%u KB) — module blijft stil\n",
                          static_cast<unsigned>(kDelayFloats * sizeof(float) / 1024));
        }
    }

    /// True wanneer de DSP-buffers gebonden zijn en de voice rendert.
    bool dspReady() const { return ready_; }

    /// Hoogste |output| sinds de vorige aanroep (0..~1); reset bij uitlezen.
    float takePeak() { const float p = peak_; peak_ = 0.0f; return p; }

    /// Initialise the DSP. Idempotent — de constructor doet dit al; blijft
    /// bestaan voor expliciete re-inits vanuit setup()-code.
    void begin() {
        if (delayMem_) part_.Init(&bufs_);
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
    /// Uitgangsniveau (0..1) — toegepast in de resample-lus van update().
    void setLevel(float l)       { level_ = l; }

    elements::Part& part() { return part_; }

    void update() override {
        // AudioStream's basisconstructor linkt dit object al in de update-
        // lijst vóórdat Part::Init() heeft gedraaid — tot die tijd stil zijn.
        if (!ready_) return;
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
            // NaN-vangnet: een NaN uit de DSP zou anders geruisloos naar 0
            // casten én alle meters blind maken (NaN-vergelijkingen zijn
            // altijd false). Flush naar 0 zodat de rest van het graph
            // schoon blijft.
            if (!(yL == yL)) yL = 0.0f;
            if (!(yR == yR)) yR = 0.0f;
            // Peak-meter op de rauwe DSP-output (vóór level) — telemetrie
            // voor "rendert hij wel maar horen we niks?" (status-bericht).
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
    volatile bool              ready_ = false;  ///< true zodra Part::Init() klaar is.
    float                      level_ = 0.8f;   ///< Uitgangsniveau (control `level`).
    volatile float             peak_  = 0.0f;   ///< Peak-meter (zie takePeak()).
    std::unique_ptr<float[]>   delayMem_;       ///< Eén blok voor alle delay-lines.
    elements::VoiceBuffers     bufs_{};         ///< Slices in delayMem_.
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

    /**
     * Genulde allocatie. De Mutable-DSP is geschreven voor globale statics
     * (BSS = genuld bij boot); diverse interne filter/exciter-velden hebben
     * geen Init en rekenen daar stilzwijgend op. Op een verse heap staat er
     * garbage → NaN's in de hele signaalketen (symptoom: res-meter klemt op
     * 1.00, exc = NaN, output stil) of wilde pointers (tube_-crash). Door
     * het complete object op nul te zetten vóór constructie krijgt de DSP
     * exact de omgeving waarvoor hij ontworpen is; member-initializers
     * overschrijven daarna gewoon hun eigen velden.
     */
    static void* operator new(std::size_t n) {
        void* p = ::malloc(n);
        if (p) std::memset(p, 0, n);
        return p;
    }
    static void operator delete(void* p) { ::free(p); }

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
            applyPitch();
        } else if (portId == "strength") {
            strength_ = value;
            voice_.setStrength(strength_);
        } else if (portId == "gate") {
            const bool high = value >= 0.5f;
            if (high && !lastGateHigh_) {
                applyPitch();
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
        // Continue exciter-levels — zoals de drie level-knoppen op de echte
        // Elements (mengbaar, i.p.v. de exclusieve `exciter`-switch hieronder).
        else if (controlId == "bow")    p->exciter_bow_level    = asFloat(0.0f);
        else if (controlId == "blow")   p->exciter_blow_level   = asFloat(0.0f);
        else if (controlId == "strike") p->exciter_strike_level = asFloat(0.8f);
        // Pitch-offsets t.o.v. de inkomende V/Oct (zoals VcoModule).
        else if (controlId == "coarse") { coarse_ = asFloat(0.0f); applyPitch(); }
        else if (controlId == "fine")   { fine_   = asFloat(0.0f); applyPitch(); }
        // Uitgangsniveau van de wrapper (0..1).
        else if (controlId == "level")  voice_.setLevel(asFloat(0.8f));
        else if (controlId == "exciter") {
            // Legacy 3-standen-switch (0=bow, 1=blow, 2=strike, exclusief).
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
    /// V/Oct + coarse (semitonen) + fine (centen) → MIDI-noot voor de voice.
    /// Port-map-conventie: MIDI 60 = 0 V.
    void applyPitch() {
        voice_.setNote(60.0f + 12.0f * voct_ + coarse_ + fine_ / 100.0f);
    }

    mutable ElementsVoice voice_;
    float voct_         = 0.0f;
    float strength_     = 0.8f;
    float coarse_       = 0.0f;   ///< Semitoon-offset (control `coarse`).
    float fine_         = 0.0f;   ///< Cent-offset (control `fine`).
    bool  lastGateHigh_ = false;
};

}  // namespace mmb_link
