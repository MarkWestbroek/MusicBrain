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
 * | 0     | Plucked     | stk::Plucked           | Getokkelde snaar (KS)    |
 * | 1     | Clarinet    | stk::Clarinet          | Riet-instrument           |
 * | 2     | Bowed       | stk::Bowed             | Gestreken snaar          |
 * | 3     | Flute       | stk::Flute             | Fluit (jet-injectie)     |
 * | 4     | Brass       | stk::Brass             | Koperblaas               |
 * | 5     | Saxophony   | stk::Saxofony          | Saxofoon                 |
 * | 6     | BlowHole    | stk::BlowHole          | Enkelriet + klankgat     |
 * | 7     | BandedWG    | stk::BandedWG          | Waveguide-modale mix     |
 * | 8     | Mandolin    | stk::Mandolin          | Mandoline (commuted)     |
 *
 * @note stk::Mandolin draait op geëmbedde samples: de mand*.raw body-excitatie
 *       zit als C-array in flash (MandolinData.h) en wordt afgespeeld via
 *       stk::MemoryWvIn (MMB-toevoeging) i.p.v. FileWvIn — er is geen
 *       bestandssysteem op de Teensy. STK spelt "Saxofony" met een f;
 *       het UI-label blijft Saxophony.
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
#  include "stk/Plucked.h"
#  include "stk/Clarinet.h"
#  include "stk/Bowed.h"
#  include "stk/Flute.h"
#  include "stk/Brass.h"
#  include "stk/Saxofony.h"
#  include "stk/BlowHole.h"
#  include "stk/BandedWG.h"
#  include "stk/Mandolin.h"
#  define HAVE_STK 1
#else
#  define HAVE_STK 0
#endif

namespace mmb_link {

// ---------------------------------------------------------------------------
// Sound enum — moet synchroon blijven met de editor seed (stkSound-options).
// ---------------------------------------------------------------------------
enum class Sound : uint8_t {
    Plucked    = 0,
    Clarinet   = 1,
    Bowed      = 2,
    Flute      = 3,
    Brass      = 4,
    Saxophony  = 5,
    BlowHole   = 6,
    BandedWG   = 7,
    Mandolin   = 8,
    kCount     = 9
};

/// @brief Human-readable labels — synchroon met de editor.
static constexpr const char* kSoundName(enum Sound s) {
    switch (s) {
        case Sound::Plucked:   return "Plucked";
        case Sound::Clarinet:  return "Clarinet";
        case Sound::Bowed:     return "Bowed";
        case Sound::Flute:     return "Flute";
        case Sound::Brass:     return "Brass";
        case Sound::Saxophony: return "Saxophony";
        case Sound::BlowHole:  return "BlowHole";
        case Sound::BandedWG:  return "BandedWG";
        case Sound::Mandolin:  return "Mandolin";
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
#if HAVE_STK
        // Eén keer, vóór het eerste instrument: STK op de exacte Teensy-rate.
        stk::Stk::setSampleRate(AUDIO_SAMPLE_RATE_EXACT);
#endif
        selectSound(Sound::Plucked);
    }

    /// @brief Wissel van STK-instrument.
    ///
    /// ISR-veiligheid: het nieuwe instrument wordt éérst volledig gebouwd
    /// (heap-werk buiten de audio-fence), daarna wordt de pointer geswapt
    /// en het oude instrument vernietigd bínnen `AudioNoInterrupts()`. Een
    /// kale `instr_ = make_unique<…>` gaf een use-after-free: de audio-ISR
    /// kon midden in `instr_->tick()` zitten terwijl de assignment het oude
    /// object al vrijgaf → heap-corruptie → de StkFrames::resize-crashes
    /// (DACCVIOL) bij sound-wissels tijdens het spelen.
    void selectSound(Sound s) {
        currentSound_ = s;
#if HAVE_STK
        // Constructor-argument is de láágste speelbare frequentie (bepaalt de
        // delay-line-lengte), niet de speeltoonhoogte — die gaat via setFrequency.
        constexpr stk::StkFloat kLowestHz = 20.0f;
        const float freq = midiNoteToHz(note_);
        const float amp  = strength_;
        std::unique_ptr<stk::Instrmnt> fresh;
        switch (s) {
            case Sound::Plucked:
                fresh = std::make_unique<stk::Plucked>(kLowestHz);
                break;
            case Sound::Clarinet:
                fresh = std::make_unique<stk::Clarinet>(kLowestHz);
                break;
            case Sound::Bowed:
                fresh = std::make_unique<stk::Bowed>(kLowestHz);
                break;
            case Sound::Flute:
                fresh = std::make_unique<stk::Flute>(kLowestHz);
                break;
            case Sound::Brass:
                fresh = std::make_unique<stk::Brass>(kLowestHz);
                break;
            case Sound::Saxophony:
                fresh = std::make_unique<stk::Saxofony>(kLowestHz);
                break;
            case Sound::BlowHole:
                fresh = std::make_unique<stk::BlowHole>(kLowestHz);
                break;
            case Sound::BandedWG:
                fresh = std::make_unique<stk::BandedWG>();
                break;
            case Sound::Mandolin:
                fresh = std::make_unique<stk::Mandolin>(kLowestHz);
                break;
            default:
                break;
        }
        if (fresh) {
            fresh->setFrequency(freq);
            if (gate_) fresh->noteOn(freq, amp);
        }
        AudioNoInterrupts();
        instr_ = std::move(fresh);   // oude instrument sterft binnen de fence
        AudioInterrupts();
        applyControlChanges();
#else
        // Fallback: simpele sinus — geen STK nodig. (freq/amp bestaan alleen
        // in de HAVE_STK-tak; de stub leest note_/strength_ zelf in update().)
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

    void setPitch(float voct) {
        note_ = 60.0f + 12.0f * voct;
#if HAVE_STK
        if (instr_) instr_->setFrequency(midiNoteToHz(note_));  // live tracking
#else
        stubFreq_ = midiNoteToHz(note_);
#endif
    }
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
            // Instrmnt::tick() neemt een channel-index, géén audio-input.
            float y = instr_ ? instr_->tick() : 0.0f;
            if (y >  1.0f) y =  1.0f;
            if (y < -1.0f) y = -1.0f;
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

    Sound           currentSound_ = Sound::Plucked;
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