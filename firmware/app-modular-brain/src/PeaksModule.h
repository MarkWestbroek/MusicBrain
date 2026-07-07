#pragma once
/**
 * @file PeaksModule.h
 * @brief Mutable Instruments *Peaks* drumstem (typeId `tp_mmb_peaks`).
 *
 * @details
 * Wrapper rond de gevendorde Peaks-drums (`firmware/lib/mi-peaks`, MIT,
 * (c) Emilie Gillet): de 808-achtige analoge-model-drums BassDrum,
 * SnareDrum, HighHat en de FmDrum. Eén drum per instantie (kies met
 * `drum`), getriggerd door de gate-ingang. Peaks rekent op 48 kHz; we
 * renderen native op 48 k en resamplen lineair naar 44.1 k (drums zijn
 * kort en vergevingsgezind — een aparte resampler zoals bij Rings).
 *
 * De twee macro-knoppen `tone` en `decay` mappen op de parameter-array
 * die elke drum via `Configure()` accepteert; BassDrum/SnareDrum krijgen
 * daarnaast `punch`/`snappy` op de derde knop en pitch via V/Oct + `coarse`.
 * HighHat negeert de parameters (vaste 808-hat) maar volgt wel de gate.
 *
 * Port map:
 * | Dir | portId | Kind  | Betekenis                          |
 * |-----|--------|-------|-------------------------------------|
 * | in  | `gate` | Gate  | Trigger (rising edge slaat de drum) |
 * | in  | `voct` | Cv    | Toonhoogte (BD/SD/FM)               |
 * | in  | `accent`/`accent_cv` | Cv | Accent → hardere aanslag  |
 * | out | `out`  | Audio | Mono drum-uitgang                   |
 *
 * Controls: `drum` (0=BD, 1=SD, 2=HH, 3=FM), `tone` (0..1), `decay` (0..1),
 * `snap` (0..1 — punch/snappy/fm-amount), `coarse` (semi), `level` (0..1).
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <memory>
#include <string_view>

// Gevendorde upstream Peaks-DSP (MIT, (c) Emilie Gillet):
// firmware/lib/mi-peaks.
#include "peaks/drums/bass_drum.h"
#include "peaks/drums/snare_drum.h"
#include "peaks/drums/high_hat.h"
#include "peaks/drums/fm_drum.h"
#include "peaks/gate_processor.h"

namespace mmb_link {

/** @brief Eén Peaks-drum als AudioStream (48k render → 44.1k resample). */
class PeaksVoice : public AudioStream {
public:
    PeaksVoice() : AudioStream(0, nullptr) {
        bd_.Init(); sd_.Init(); hh_.Init(); fm_.Init();
        reconfigure();
    }

    void setDrum(int d) {
        if (d < 0) d = 0;
        if (d > 3) d = 3;
        drum_ = d; reconfigure();
    }
    void setTone(float v)   { tone_  = clamp01(v); reconfigure(); }
    void setDecay(float v)  { decay_ = clamp01(v); reconfigure(); }
    void setSnap(float v)   { snap_  = clamp01(v); reconfigure(); }
    void setVoct(float v)   { voct_  = v; reconfigure(); }
    void setCoarse(float s) { coarse_= s; reconfigure(); }
    void setAccent(float v) { accent_ = clamp01(v); }
    void setLevel(float v)  { level_ = clamp01(v); }

    void trigger() { pending_ = true; }

    float takePeak() { const float p = peak_; peak_ = 0.0f; return p * (1.0f / 32768.0f); }

    void update() override {
        audio_block_t* out = allocate();
        if (!out) return;
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            // 44.1k-tel → haal zoveel 48k-drumsamples als de fase vraagt.
            outPhase_ += kStep;   // 48000/44100 ≈ 1.088 per uit-sample
            while (outPhase_ >= 1.0f) {
                outPhase_ -= 1.0f;
                s0_ = s1_;
                s1_ = renderOne();
            }
            float y = (s0_ + (s1_ - s0_) * outPhase_) * level_;
            if (y >  32767.0f) y =  32767.0f; else if (y < -32768.0f) y = -32768.0f;
            const float a = y < 0 ? -y : y;
            if (a > peak_) peak_ = a;
            out->data[i] = static_cast<int16_t>(y);
        }
        transmit(out, 0);
        release(out);
    }

private:
    static float clamp01(float v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    static uint16_t u16(float v)  { return static_cast<uint16_t>(clamp01(v) * 65535.0f); }

    /// Eén 48k-sample uit de gekozen drum; injecteert de trigger op tijd.
    float renderOne() {
        peaks::GateFlags gf = peaks::GATE_FLAG_LOW;
        if (pending_) {
            pending_ = false;
            gf = static_cast<peaks::GateFlags>(peaks::GATE_FLAG_HIGH | peaks::GATE_FLAG_RISING);
            gateHigh_ = true;
        } else if (gateHigh_) {
            gf = peaks::GATE_FLAG_HIGH;      // laat de drum uitklinken
            heldSamples_++;
            if (heldSamples_ > 96) { gateHigh_ = false; heldSamples_ = 0; }  // ~2 ms puls
        }
        int16_t s = 0;
        switch (drum_) {
            case 0: bd_.Process(&gf, &s, 1); break;
            case 1: sd_.Process(&gf, &s, 1); break;
            case 2: hh_.Process(&gf, &s, 1); break;
            default: fm_.Process(&gf, &s, 1); break;
        }
        return static_cast<float>(s);
    }

    void reconfigure() {
        const int16_t pitch = static_cast<int16_t>(
            (voct_ * 12.0f + coarse_) * 128.0f);   // ~ semitonen → int16-noten
        uint16_t p[4];
        switch (drum_) {
            case 0:  // BassDrum: freq / punch / tone / decay
                p[0] = static_cast<uint16_t>(32768 + pitch);
                p[1] = u16(0.4f + 0.6f * snap_);       // punch
                p[2] = u16(tone_);
                p[3] = u16(decay_);
                bd_.Configure(p, peaks::CONTROL_MODE_FULL);
                break;
            case 1:  // SnareDrum: freq / tone / snappy / decay
                p[0] = static_cast<uint16_t>(32768 + pitch);
                p[1] = u16(tone_);
                p[2] = u16(snap_);
                p[3] = u16(decay_);
                sd_.Configure(p, peaks::CONTROL_MODE_FULL);
                break;
            case 2:  // HighHat: geen parameters (vaste 808-hat).
                break;
            default: // FmDrum: freq / fm-amount / decay / noise
                p[0] = static_cast<uint16_t>(32768 + pitch);
                p[1] = u16(snap_);
                p[2] = u16(decay_);
                p[3] = u16(tone_);
                fm_.Configure(p, peaks::CONTROL_MODE_FULL);
                break;
        }
    }

    peaks::BassDrum  bd_;
    peaks::SnareDrum sd_;
    peaks::HighHat   hh_;
    peaks::FmDrum    fm_;

    int   drum_   = 0;
    float tone_   = 0.5f, decay_ = 0.5f, snap_ = 0.5f;
    float voct_   = 0.0f, coarse_ = 0.0f, accent_ = 1.0f, level_ = 0.8f;

    bool  pending_    = false;
    bool  gateHigh_   = false;
    int   heldSamples_ = 0;

    static constexpr float kStep = 48000.0f / 44100.0f;
    float outPhase_ = 0.0f, s0_ = 0.0f, s1_ = 0.0f;
    volatile float peak_ = 0.0f;
};

/** @brief Module-wrapper rond @ref PeaksVoice. */
class PeaksModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_peaks";

    explicit PeaksModule(std::string_view id)
        : AudioModule(kTypeId, id) {}

    PeaksVoice& voice() { return voice_; }

    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out")
            return { const_cast<PeaksVoice*>(&voice_), 0, true };
        return {};
    }
    AudioPort inputPort(std::string_view /*portId*/) const override { return {}; }

    PortKind outputPortKind(std::string_view portId) const override {
        return portId == "out" ? PortKind::Audio : PortKind::None;
    }
    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "gate" || portId == "trig") return PortKind::Gate;
        if (portId == "voct") return PortKind::Cv;
        if (cvPortIs(portId, "accent")) return PortKind::Cv;
        return PortKind::None;
    }

    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "gate" || portId == "trig") {
            const bool high = value >= 0.5f;
            if (high && !gatePrev_) voice_.trigger();
            gatePrev_ = high;
        } else if (portId == "voct") {
            voice_.setVoct(value);
        } else if (cvPortIs(portId, "accent")) {
            voice_.setAccent(value);
        }
    }

    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fb) -> float {
            if (auto* f = std::get_if<float>       (&value)) return *f;
            if (auto* i = std::get_if<std::int32_t>(&value)) return static_cast<float>(*i);
            return fb;
        };
        if      (controlId == "drum")   voice_.setDrum(static_cast<int>(asFloat(0.0f)));
        else if (controlId == "tone")   voice_.setTone(asFloat(0.5f));
        else if (controlId == "decay")  voice_.setDecay(asFloat(0.5f));
        else if (controlId == "snap")   voice_.setSnap(asFloat(0.5f));
        else if (controlId == "coarse") voice_.setCoarse(asFloat(0.0f));
        else if (controlId == "level")  voice_.setLevel(asFloat(0.8f));
    }

    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<PeaksModule>(id);
            });
    }

private:
    mutable PeaksVoice voice_;
    bool gatePrev_ = false;
};

}  // namespace mmb_link
