#pragma once
/**
 * @file StkSoundModule.h
 * @brief Multi-sound physical-modelling voice based on The Synthesis ToolKit (STK)
 *        (typeId `tp_mmb_stk_sound`).
 *
 * @details
 * ## Concept
 * Eén module die een heel palet aan STK physical-modelling instrumenten bevat.
 * De sound-selector (een switch/rotary-control) kiest welk algoritme actief is:
 *
 * | Index | Sound       | Model                  | Karakter                 |
 * |-------|-------------|------------------------|--------------------------|
 * | 0     | Mandolin    | stk::Mandolin          | Getokkelde snaar         |
 * | 1     | Clarinet    | stk::Clarinet          | Riet-instrument           |
 * | 2     | Bowed       | stk::Bowed             | Gestreken snaar          |
 * | 3     | Flute       | stk::Flute             | Fluit (jet-injectie)     |
 * | 4     | Brass       | stk::Brass             | Koperblaas               |
 * | 5     | Saxophony   | stk::Saxophony         | Saxofoon                 |
 * | 6     | BlowHole    | stk::BlowHole          | Enkelriet + klankgat     |
 * | 7     | BandedWG    | stk::BandedWG          | Waveguide-modale mix     |
 *
 * ## Port map
 * | Direction | portId       | Domain | Betekenis per sound                          |
 * |-----------|--------------|--------|----------------------------------------------|
 * | input     | `voct`       | Cv     | Toonhoogte (V/Oct) — alle sounds             |
 * | input     | `gate`       | Gate   | Triggers noteOn / noteOff — alle sounds      |
 * | input     | `strength`   | Cv     | Aanslag/embouchure-sterkte — alle sounds     |
 * | input     | `timbre`     | Cv     | Sound-specifiek timbre (bodySize, reedStiffness, bowPressure, …) |
 * | input     | `modulation` | Cv     | Sound-specifieke modulatie (noiseGain, bowVelocity, vibrato, …)  |
 * | output    | `out`        | Audio  | Mono audio-uitgang                           |
 *
 * ## Controls (knobs op het paneel)
 * | controlId    | type  | koppeling                                    |
 * |--------------|-------|----------------------------------------------|
 * | `sound`      | int   | Sound-keuze (0..7) — via switch-control      |
 * | `level`      | float | Uitgangsniveau (0..1, default 0.8)           |
 * | `timbre`     | float | Timbre (default 0.5) — ook als CV-ingang     |
 * | `modulation` | float | Modulatie (default 0.5) — ook als CV-ingang  |
 * | `strength`   | float | Sterkte (default 0.8) — ook als CV-ingang    |
 *
 * CV-ingangen tellen **op** bij de knopwaarde (summing).
 *
 * ## STK-vendoring
 * STK (MIT, CCRMA) moet in `lib/stk/` zitten:
 * ```
 * firmware/lib/stk/
 * ├── include/stk/
 * │   ├── Stk.h              — base class, StkFloat config
 * │   ├── Instrmnt.h         — abstract instrument base
 * │   ├── Mandolin.h, Clarinet.h, Bowed.h, Flute.h, …
 * │   └── SKINI.msg          — MIDI control-change mapping
 * └── src/
 *     ├── Mandolin.cpp, Clarinet.cpp, …
 *     └── Stk.cpp
 * ```
 * Definieer `stk/config.h` of pas `Stk.h` aan: `typedef float StkFloat;`
 * en zet de sample rate op 44100.0f.
 *
 * @note De STK-modellen zijn sample-gebaseerd (`tick()`), géén block-processing.
 *       Dit is lichter dan block-gebaseerde modellen omdat er geen resampler
 *       nodig is — elke `update()` roept simpelweg 128× `instr_->tick()` aan.
 */

#include "AudioModule.h"
#include "mb/runtime/Registry.h"
#include <Audio.h>
#include <cmath>
#include <cstdint>
#include <memory>
#include <string_view>

// Stub-polyfill wanneer STK nog niet gevendored is: een simpele sinus-tone
// zodat de module in ieder geval compileert en geluid maakt.
#if __has_include("stk/Instrmnt.h")
#  include "stk/Mandolin.h"
#  include "stk/Clarinet.h"
#  include "stk/Bowed.h"
#  include "stk/Flute.h"
#  include "stk/Brass.h"
#  include "stk/Saxophony.h"
#  include "stk/BlowHole.h"
#  include "stk/BandedWG.h"
#  define HAVE_STK 1
#else
#  define HAVE_STK 0
#endif

namespace mmb_link {

// ---------------------------------------------------------------------------
// Sound enum — moet synchroon blijven met de editor seed (stkSound-options).
// ---------------------------------------------------------------------------
enum class Sound : uint8_t {
    Mandolin   = 0,
    Clarinet   = 1,
    Bowed      = 2,
    Flute      = 3,
    Brass      = 4,
    Saxophony  = 5,
    BlowHole   = 6,
    BandedWG   = 7,
    kCount     = 8
};

/// @brief Human-readable labels — synchroon met de editor.
static constexpr const char* kSoundName(enum Sound s) {
    switch (s) {
        case Sound::Mandolin:  return "Mandolin";
        case Sound::Clarinet:  return "Clarinet";
        case Sound::Bowed:     return "Bowed";
        case Sound::Flute:     return "Flute";
        case Sound::Brass:     return "Brass";
        case Sound::Saxophony: return "Saxophony";
        case Sound::BlowHole:  return "BlowHole";
        case Sound::BandedWG:  return "BandedWG";
        default:               return "?";
    }
}

// ---------------------------------------------------------------------------
// StkSoundVoice — Teensy AudioStream wrapper.
// ---------------------------------------------------------------------------
class StkSoundVoice : public AudioStream {
public:
    StkSoundVoice()
        : AudioStream(0, nullptr)  // geen audio-inputs
    {
        selectSound(Sound::Mandolin);
    }

    /// @brief Wissel van STK-instrument. Zelfs tijdens het spelen veilig.
    void selectSound(Sound s) {
        currentSound_ = s;
#if HAVE_STK
        const float freq = midiNoteToHz(note_);
        const float amp  = strength_;
        switch (s) {
            case Sound::Mandolin:
                instr_ = std::make_unique<stk::Mandolin>(freq);
                break;
            case Sound::Clarinet:
                instr_ = std::make_unique<stk::Clarinet>(freq);
                break;
            case Sound::Bowed:
                instr_ = std::make_unique<stk::Bowed>(freq);
                break;
            case Sound::Flute:
                instr_ = std::make_unique<stk::Flute>(freq);
                break;
            case Sound::Brass:
                instr_ = std::make_unique<stk::Brass>(freq);
                break;
            case Sound::Saxophony:
                instr_ = std::make_unique<stk::Saxophony>(freq);
                break;
            case Sound::BlowHole:
                instr_ = std::make_unique<stk::BlowHole>(freq);
                break;
            case Sound::BandedWG:
                instr_ = std::make_unique<stk::BandedWG>();
                break;
            default:
                break;
        }
        if (instr_ && gate_) {
            instr_->noteOn(freq, amp);
        }
        applyControlChanges();
#else
        // Fallback: simpele sinus — geen STK nodig.
        (void)freq; (void)amp;
        stubPhase_ = 0.0f;
#endif
    }

    void noteOn(float midiNote, float strength) {
        note_     = midiNote;
        strength_ = strength;
        gate_     = true;
#if HAVE_STK
        if (instr_) instr_->noteOn(midiNoteToHz(midiNote), strength);
#else
        stubFreq_ = midiNoteToHz(midiNote);
#endif
    }

    void noteOff() {
        gate_ = false;
#if HAVE_STK
        if (instr_) instr_->noteOff(strength_);
#endif
    }

    void setPitch(float voct) { note_ = 60.0f + 12.0f * voct; }
    void setGate(bool g)      { if (g != gate_) { if (g) noteOn(note_, strength_); else noteOff(); } }
    void setStrength(float s) { strength_ = s; }
    void setTimbre(float t)   { timbre_ = t; applyControlChanges(); }
    void setModulation(float m) { modulation_ = m; applyControlChanges(); }
    void setLevel(float l)    { level_ = l; }

    Sound currentSound() const { return currentSound_; }

    void update() override {
        audio_block_t* out = allocate();
        if (!out) return;

#if HAVE_STK
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            float y = instr_ ? instr_->tick(0.0f) : 0.0f;
            out->data[i] = static_cast<int16_t>(y * 32767.0f * level_);
        }
#else
        // Fallback-sinus zolang STK niet gevendored is.
        for (int i = 0; i < AUDIO_BLOCK_SAMPLES; ++i) {
            if (!gate_) { out->data[i] = 0; continue; }
            stubPhase_ += stubFreq_ / AUDIO_SAMPLE_RATE_EXACT;
            if (stubPhase_ >= 1.0f) stubPhase_ -= 1.0f;
            const float y = sinf(2.0f * M_PI * stubPhase_) * strength_ * level_;
            out->data[i] = static_cast<int16_t>(y * 32767.0f);
        }
#endif
        transmit(out, 0);
        release(out);
    }

private:
    static float midiNoteToHz(float note) {
        return 440.0f * powf(2.0f, (note - 69.0f) / 12.0f);
    }

    /// Stuur timbre/modulation door naar het actieve STK-model via controlChange.
    void applyControlChanges() {
#if HAVE_STK
        if (!instr_) return;
        // CC#2 = primair timbre (bodySize, reedStiffness, bowPressure, …)
        instr_->controlChange(2,  timbre_ * 127.0f);
        // CC#11 = secundaire modulatie (noiseGain, bowVelocity, vibratoRate, …)
        instr_->controlChange(11, modulation_ * 127.0f);
        // CC#1 = modwiel / breath (gekoppeld aan strength)
        instr_->controlChange(1,  strength_ * 127.0f);
#endif
    }

    Sound           currentSound_ = Sound::Mandolin;
    float           note_         = 60.0f;   ///< MIDI-noot (C4)
    float           strength_     = 0.8f;
    float           timbre_       = 0.5f;
    float           modulation_   = 0.5f;
    float           level_        = 0.8f;
    bool            gate_         = false;

#if HAVE_STK
    std::unique_ptr<stk::Instrmnt> instr_;
#else
    // Fallback voor compileerbaarheid zonder STK
    float stubFreq_ = 261.6256f;
    float stubPhase_ = 0.0f;
#endif
};

// ---------------------------------------------------------------------------
// StkSoundModule — AudioModule wrapper (tp_mmb_stk_sound).
// ---------------------------------------------------------------------------
class StkSoundModule final : public AudioModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_stk_sound";

    explicit StkSoundModule(std::string_view id)
        : AudioModule(kTypeId, id) {}

    StkSoundVoice& voice() { return voice_; }

    // --- Audio ports ----------------------------------------------------
    AudioPort outputPort(std::string_view portId) const override {
        if (portId == "out")
            return { const_cast<StkSoundVoice*>(&voice_), 0, true };
        return {};
    }

    AudioPort inputPort(std::string_view /*portId*/) const override {
        return {};  // alle inputs zijn CV-domein
    }

    // --- Port kinds -----------------------------------------------------
    PortKind outputPortKind(std::string_view portId) const override {
        return (portId == "out") ? PortKind::Audio : PortKind::None;
    }

    PortKind inputPortKind(std::string_view portId) const override {
        if (portId == "voct")        return PortKind::Cv;
        if (portId == "gate")        return PortKind::Gate;
        if (portId == "strength")    return PortKind::Cv;
        if (portId == "timbre")      return PortKind::Cv;
        if (portId == "modulation")  return PortKind::Cv;
        return PortKind::None;
    }

    // --- CV-bridge ------------------------------------------------------
    /** CV-waarden tellen op bij de knopwaarde (summing).
     *  De `control`-waarden (timbre, modulation, strength) zijn de *basis*
     *  van de potmeter; de CV-ingang schuift er bovenop (binnen 0..1). */
    void writeCvPort(std::string_view portId, float value) override {
        if (portId == "voct") {
            voct_ = value;
            voice_.setPitch(voct_);
        } else if (portId == "gate") {
            const bool high = value >= 0.5f;
            voice_.setGate(high);
            lastGateHigh_ = high;
        } else if (portId == "strength") {
            cvStrengthOffset_ = value;
            voice_.setStrength(saturate(controlStrength_ + cvStrengthOffset_));
        } else if (portId == "timbre") {
            cvTimbreOffset_ = value;
            voice_.setTimbre(saturate(controlTimbre_ + cvTimbreOffset_));
        } else if (portId == "modulation") {
            cvModOffset_ = value;
            voice_.setModulation(saturate(controlMod_ + cvModOffset_));
        }
    }

    // --- Controls (knop/schakelaar op paneel) ---------------------------
    void setControl(std::string_view controlId,
                    mb::runtime::ControlValue value) override {
        auto asFloat = [&](float fallback) -> float {
            if (auto* f = std::get_if<float>  (&value)) return *f;
            if (auto* i = std::get_if<int32_t>(&value)) return static_cast<float>(*i);
            return fallback;
        };
        auto asInt = [&](int32_t fallback) -> int32_t {
            if (auto* i = std::get_if<int32_t>(&value)) return *i;
            if (auto* f = std::get_if<float>  (&value)) return static_cast<int32_t>(*f);
            return fallback;
        };

        if (controlId == "sound") {
            const int idx = asInt(0);
            if (idx >= 0 && idx < static_cast<int>(Sound::kCount)) {
                voice_.selectSound(static_cast<Sound>(idx));
            }
        } else if (controlId == "level") {
            controlLevel_ = saturate(asFloat(0.8f));
            voice_.setLevel(controlLevel_);
        } else if (controlId == "strength") {
            controlStrength_ = saturate(asFloat(0.8f));
            voice_.setStrength(saturate(controlStrength_ + cvStrengthOffset_));
        } else if (controlId == "timbre") {
            controlTimbre_ = saturate(asFloat(0.5f));
            voice_.setTimbre(saturate(controlTimbre_ + cvTimbreOffset_));
        } else if (controlId == "modulation") {
            controlMod_ = saturate(asFloat(0.5f));
            voice_.setModulation(saturate(controlMod_ + cvModOffset_));
        }
    }

    /** @brief Register the StkSound factory.  Idempotent. */
    static void registerFactory() {
        auto& reg = mb::runtime::Registry::global();
        if (reg.has(kTypeId)) return;
        reg.register_(kTypeId,
            [](std::string_view id) -> std::unique_ptr<mb::runtime::Module> {
                return std::make_unique<StkSoundModule>(id);
            });
    }

private:
    static float saturate(float v) {
        if (v < 0.0f) return 0.0f;
        if (v > 1.0f) return 1.0f;
        return v;
    }

    mutable StkSoundVoice voice_;

    // CV-offsets (opgeteld bij de knopwaarde)
    float cvStrengthOffset_ = 0.0f;
    float cvTimbreOffset_   = 0.0f;
    float cvModOffset_      = 0.0f;

    // Knop-basiswaarden
    float controlLevel_     = 0.8f;
    float controlStrength_  = 0.8f;
    float controlTimbre_    = 0.5f;
    float controlMod_       = 0.5f;

    float voct_         = 0.0f;
    bool  lastGateHigh_ = false;
};

}  // namespace mmb_link