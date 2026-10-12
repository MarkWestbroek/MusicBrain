#pragma once
// BeadsHost — Mutable Instruments Beads (Émilie Gillet, MIT; vendored in
// beads/, commit d8f4739 van 2026-10-11) als MusicBrain-module. Gedeeld door
// de Teensy (BeadsModule.h) en de simulator (tools/mmb-wasm/beads_wasm.cc).
// Plan: doc/plans/beads.md. Eigen code (MIT).
//
// Wat hier gebeurt, zoals beads/beads.cc het op de hardware doet:
//  - knoppen en CV → beads::Parameters (Time/Size/Shape/Pitch met
//    attenuverter: zonder kabel bepaalt de attenuverter het toeval),
//    ModulatedParameter (Density), MixParameters (Feedback/Dry-wet/Reverb);
//    de potmeterwetten van cv_reader.h (attenuverter, detune) en de
//    CV-bereiken van settings.cc (Time/Size/Shape ±1,6, Pitch ±60 halve tonen).
//  - geen audio in → Synth (de wavetable-stand), anders Processor.
//  - Quality kiest het medium; elk medium heeft zijn eigen samplerate
//    (24/48/32/48 kHz, de wavetable-stand 48 kHz). Wij draaien op 44,1 kHz:
//    lineair omzetten heen en terug, met een kleine FIFO (≈4 samples).
//  - de vrij toe te wijzen CV en de automatische ingangsversterking van het
//    origineel zitten er (nog) niet in.

#include <cmath>
#include <cstdint>
#include <cstring>

#include "beads/dsp/processor.h"
#include "beads/dsp/synth.h"

namespace mmb_beads {

constexpr size_t kDelayBytes  = 768 * 1024;   // beads.cc: 512 KB + 256 KB
constexpr size_t kReverbWords = 32768;        // beads.cc: uint16_t reverb_buffer[32768]
constexpr float  kHostRate    = 44100.0f;
constexpr int    kChunk       = 32;           // frames per Process-aanroep van Beads

struct Controls {
    float time = 0.5f, size = 0.5f, shape = 0.5f, pitch = 0.5f, density = 0.5f;
    float time_amt = 0.0f, size_amt = 0.0f, shape_amt = 0.0f, pitch_amt = 0.0f;   // −1 … +1
    float feedback = 0.0f, mix = 0.5f, reverb = 0.0f;
    int   quality = 3;           // 0 dirty tape, 1 clean tape, 2 vintage digital, 3 digital
    bool  freeze = false;        // knop
    bool  seed = false;          // knop (ingedrukt)
    // SEED vergrendeld: korrels vanzelf volgens Density (zoals het origineel
    // na het opstarten; ui.cc `seed_button_locked_ = true`). Uit: alleen een
    // korrel bij Seed of een trigger op de Seed-ingang. Met een trigger en
    // Lock aan: de ingang is een klok en Density een deler (RenderDivider).
    bool  seed_lock = true;
};

struct Cv {
    bool has_time = false, has_size = false, has_shape = false, has_pitch = false, has_density = false;
    float time = 0, size = 0, shape = 0, pitch = 0, density = 0;   // pitch in V/Oct
    bool has_seed = false, seed = false;                           // trigger-ingang
    bool freeze = false;                                           // gate-ingang
};

/** cv_reader.h LAW_ATTENUVERTER, met de knop als −1 … +1 (midden = 0). */
inline float attenuverterLaw(float k) {
    float v = 0.5f * (k < -1.0f ? -1.0f : (k > 1.0f ? 1.0f : k));
    const float a = std::fabs(v) - 0.03f;
    return (2.0f / 0.47f) * v * (a > 0.0f ? a : 0.0f);
}

/** cv_reader.h LAW_DETUNE: 0 … 1 → halve tonen, met rustpunten op 0, 1, 3, 4, 7, 12, 24. */
inline float detuneLaw(float k) {
    float detune = 2.0f * (k < 0.0f ? 0.0f : (k > 1.0f ? 1.0f : k)) - 1.0f;
    const float sign = detune < 0.0f ? -1.0f : 1.0f;
    detune = detune * sign * 6.0f;
    int integral = static_cast<int>(detune);
    if (integral > 6) integral = 6;
    float fractional = detune - static_cast<float>(integral);
    static const float kIntervals[8] = { 0.0f, 1.0f, 3.0f, 4.0f, 7.0f, 12.0f, 24.0f, 24.0f };
    fractional = (fractional - 0.33333333f) * 1.5f;
    if (fractional < 0.0f) fractional = 0.0f;
    const float s = fractional * fractional * (3.0f - 2.0f * fractional);   // SmoothStep
    return (kIntervals[integral] + (kIntervals[integral + 1] - kIntervals[integral]) * s) * sign;
}

inline float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

/** Lineaire stroom-omzetter (heen of terug), met het vorige sample als geheugen. */
struct LinearResampler {
    double step = 1.0;     // invoersamples per uitvoersample
    double pos = 0.0;      // positie tussen prev (0) en het volgende invoersample (1)
    float prevL = 0.0f, prevR = 0.0f;
    template <class Emit>
    void push(float l, float r, Emit&& emit) {
        while (pos < 1.0) {
            const float t = static_cast<float>(pos);
            emit(prevL + (l - prevL) * t, prevR + (r - prevR) * t);
            pos += step;
        }
        pos -= 1.0;
        prevL = l; prevR = r;
    }
};

class BeadsHost {
public:
    /** Buffers van de aanroeper (Teensy: PSRAM; simulator: statisch). Het
     *  object zelf moet genuld zijn (MI-code rekent op genulde statics). */
    void Init(uint8_t* delay, uint16_t* reverb) {
        uint8_t* buffers[3] = { delay, delay + 256 * 1024, delay + 512 * 1024 };
        processor_.Init(buffers, reverb);
        synth_.Init(reverb);
        media_ = 3; mono_ = false; synth_mode_ = true;
        processor_.Configure(beads::Processor::Media(media_), mono_);
        setRate(48000.0f);
        ready_ = true;
    }

    /** Eén blok op 44,1 kHz. inL/inR mogen nullptr zijn (niet aangesloten). */
    void Process(const Controls& c, const Cv& cv, const float* inL, const float* inR,
                 float* outL, float* outR, int n) {
        if (!ready_) { std::memset(outL, 0, n * sizeof(float)); std::memset(outR, 0, n * sizeof(float)); return; }
        const bool synth = !inL && !inR;
        const bool mono = !inR || !inL;
        const int media = c.quality < 0 ? 0 : (c.quality > 3 ? 3 : c.quality);
        if (synth != synth_mode_ || mono != mono_ || media != media_) {
            synth_mode_ = synth; mono_ = mono; media_ = media;
            processor_.Configure(beads::Processor::Media(media_), mono_);
            setRate(synth_mode_ ? 48000.0f : processor_.sample_rate());
        }
        params(c, cv);
        for (int i = 0; i < n; ++i) {
            const float l = inL ? inL[i] : (inR ? inR[i] : 0.0f);
            const float r = inR ? inR[i] : l;
            down_.push(l, r, [&](float a, float b) {
                in_[fill_].l = a; in_[fill_].r = b;
                if (++fill_ == kChunk) runChunk();
            });
        }
        // Uitvoer: FIFO op 44,1 kHz; bij een tekort het laatste sample herhalen.
        for (int i = 0; i < n; ++i) {
            if (fifoCount_ > 0) {
                lastL_ = fifoL_[fifoRead_]; lastR_ = fifoR_[fifoRead_];
                fifoRead_ = (fifoRead_ + 1) % kFifo; --fifoCount_;
            }
            outL[i] = clampf(lastL_, -1.0f, 1.0f);
            outR[i] = clampf(lastR_, -1.0f, 1.0f);
        }
    }

    float rate() const { return rate_; }

private:
    static constexpr int kFifo = 1024;

    void setRate(float r) {
        rate_ = r;
        down_.step = kHostRate / r;   // 44,1 k → r: invoer per uitvoer
        up_.step = r / kHostRate;     // r → 44,1 k
        fill_ = 0;
    }

    void params(const Controls& c, const Cv& cv) {
        p_.time.base = c.time;   p_.time.attenuverter = attenuverterLaw(c.time_amt);
        p_.time.has_cv = cv.has_time;   p_.time.cv = clampf(cv.time, -1.6f, 1.6f);
        p_.size.base = c.size;   p_.size.attenuverter = attenuverterLaw(c.size_amt);
        p_.size.has_cv = cv.has_size;   p_.size.cv = clampf(cv.size, -1.6f, 1.6f);
        p_.shape.base = c.shape; p_.shape.attenuverter = attenuverterLaw(c.shape_amt);
        p_.shape.has_cv = cv.has_shape; p_.shape.cv = clampf(cv.shape, -1.6f, 1.6f);
        p_.pitch.base = detuneLaw(c.pitch); p_.pitch.attenuverter = attenuverterLaw(c.pitch_amt);
        p_.pitch.has_cv = cv.has_pitch; p_.pitch.cv = clampf(cv.pitch * 12.0f, -60.0f, 60.0f);
        p_.monophonic_mode = false;
        d_.base = c.density;
        d_.cv = cv.has_density ? clampf(cv.density, -1.0f, 1.0f) : 0.0f;
        m_.feedback = clampf(c.feedback * 1.005f, 0.0f, 1.0f);
        m_.dry_wet = clampf(c.mix * 1.005f, 0.0f, 1.0f);
        m_.reverb_amount = clampf(c.reverb * 1.005f, 0.0f, 1.0f);
        m_.output_gate = false;
        seedState_ = c.seed_lock ? beads::SEED_BUTTON_STATE_LOCKED
                   : (c.seed ? beads::SEED_BUTTON_STATE_ON : beads::SEED_BUTTON_STATE_OFF);
        freeze_ = c.freeze || cv.freeze;
        hasSeedIn_ = cv.has_seed;
        seedIn_ = cv.seed;
    }

    void runChunk() {
        const size_t size = static_cast<size_t>(fill_);
        fill_ = 0;
        bool freeze[kChunk];
        stmlib::GateFlags seed[kChunk];
        for (size_t i = 0; i < size; ++i) {
            freeze[i] = freeze_;
            prevSeed_ = seed[i] = stmlib::ExtractGateFlags(prevSeed_, seedIn_);
        }
        const stmlib::GateFlags* seedInput = hasSeedIn_ ? seed : nullptr;
        if (!hasSeedIn_) prevSeed_ = stmlib::GATE_FLAG_LOW;
        if (synth_mode_) {
            synth_.Render(seedState_, seedInput, freeze, beads::Synth::Resolution(media_),
                          d_, p_, m_, out_, size);
        } else {
            processor_.Process(seedState_, seedInput, freeze, d_, p_, m_, in_, out_, size);
        }
        for (size_t i = 0; i < size; ++i) {
            up_.push(out_[i].l, out_[i].r, [&](float a, float b) {
                if (fifoCount_ == kFifo) return;   // vol: laten vallen (gebeurt niet bij gelijke klokken)
                const int w = (fifoRead_ + fifoCount_) % kFifo;
                fifoL_[w] = a; fifoR_[w] = b; ++fifoCount_;
            });
        }
    }

    beads::Processor processor_;
    beads::Synth synth_;
    beads::Parameters p_;
    beads::ModulatedParameter d_;
    beads::Processor::MixParameters m_;
    beads::SeedButtonState seedState_ = beads::SEED_BUTTON_STATE_OFF;
    stmlib::GateFlags prevSeed_ = stmlib::GATE_FLAG_LOW;
    bool freeze_ = false, hasSeedIn_ = false, seedIn_ = false;
    beads::FloatFrame in_[kChunk], out_[kChunk];
    int fill_ = 0;
    LinearResampler down_, up_;
    float fifoL_[kFifo], fifoR_[kFifo];
    int fifoRead_ = 0, fifoCount_ = 0;
    float lastL_ = 0.0f, lastR_ = 0.0f;
    float rate_ = 48000.0f;
    int media_ = 3;
    bool mono_ = false, synth_mode_ = true, ready_ = false;
};

}  // namespace mmb_beads
