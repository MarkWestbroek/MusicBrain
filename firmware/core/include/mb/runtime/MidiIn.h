#pragma once
/**
 * @file MidiIn.h
 * @brief MIDI note event source — the polyphony entry point for the synth.
 *
 * @details
 * `MidiInModule` sits at the top of every polyphonic voice chain.  It
 * receives raw MIDI events, distributes them across voice slots via an
 * internal `VoiceAllocator`, and exposes the resulting per-voice state
 * (pitch in V/Oct, gate, velocity) to downstream envelope and oscillator
 * modules.
 *
 * **Supported MIDI events (current):**
 * - NoteOn / NoteOff (zero-velocity NoteOn counts as NoteOff per the MIDI spec).
 * - All Notes Off (CC 123) via `allNotesOff()`.
 *
 * **Planned:** pitch-bend, mod-wheel, CC-to-CV, aftertouch.
 *
 * **Platform independence:**
 * The class has no knowledge of Teensy USB-MIDI, DIN-MIDI, or any concrete
 * transport.  Tests call `onNoteOn()` / `onNoteOff()` directly; at runtime
 * the Arduino `usbMIDI` ISR (or `firmware/lib/midi_common/`) wires to the
 * same methods.  This makes unit tests for polyphony fast and host-only.
 *
 * **Layer-2 controls (via `setControl()`):**
 * | controlId    | type    | notes                                         |
 * |--------------|---------|-----------------------------------------------|
 * | `voiceCount` | int     | 1 .. `kMaxAllocVoices`; resets voice state    |
 * | `channel`    | int     | 0 = omni; 1..16 = listen to specific channel  |
 *
 * **V/Oct convention:**
 * MIDI note 60 (middle C) = 0.0 V; each octave (12 semitones) = ±1.0 V.
 *
 * **Editor mirror:** `tp_mmb_midiin` in
 * `editor/src/modular-mb/seedModules.ts::mmbMidiIn()`.
 * Role = `"event-source"`; outputs `pitch` + `gate` with
 * `eventKind: "voice"`.
 *
 * **ADR references:** ADR-0009 (module hierarchy), ADR-0010 (polyphony).
 */

#include "CvModule.h"
#include "Registry.h"
#include "mb/VoiceAllocator.h"
#include <cstdint>

namespace mb::runtime {

/** @brief MIDI note-event source and per-voice state provider. */
class MidiInModule final : public CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_midiin";

    /** @brief Channel value that means "accept all MIDI channels". */
    static constexpr std::uint8_t kOmni = 0;

    explicit MidiInModule(std::string_view id);

    // --- Module overrides ------------------------------------------------

    /** @brief Apply a layer-2 control change from the editor.
     *  Supported ids: `"channel"` (0–16), `"voiceCount"` (1…kMaxAllocVoices). */
    void setControl(std::string_view controlId, ControlValue value) override;

    /** @brief Declare the kind of each named output port.
     *  `pitch` → Cv (V/Oct), `gate` → Gate (0.0 / 1.0). */
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "pitch") return PortKind::Cv;
        if (portId == "gate")  return PortKind::Gate;
        if (portId == "vel")   return PortKind::Cv;
        return PortKind::None;
    }

    /** @brief Sample a CV/gate output port.
     *  `pitch` returns the V/Oct of the most recently gated voice (or the
     *  last value when no voice is gated, so release tails play in tune).
     *  `gate` returns 1.0 when any voice is gated, else 0.0.
     *  This collapses polyphonic state into the mono signals the current
     *  graph layer consumes; true per-voice routing comes later. */
    float readCvPort(std::string_view portId) const override;

    // --- CvModule override ----------------------------------------------

    /** @brief No-op tick: MidiInModule is event-driven, not scheduled.
     *  Implements CvModule so it can share the same timer-ISR dispatch loop
     *  as Lfo and Ahdsr without special-casing in the scheduler. */
    void tick() override {}

    // --- MIDI event sinks (called from MIDI ISR or test code) -----------

    /** @brief Accept a MIDI NoteOn event.
     *  Applies the channel filter, allocates (or steals) a voice, and raises
     *  that voice's gate.  A velocity-zero NoteOn is treated as NoteOff. */
    void onNoteOn (std::uint8_t channel, std::uint8_t note, std::uint8_t velocity);

    /** @brief Accept a MIDI NoteOff event.
     *  Releases the voice currently holding @p note, if any.  No-op when
     *  the channel is filtered or no voice holds the note. */
    void onNoteOff(std::uint8_t channel, std::uint8_t note);

    /** @brief Lower all gates and forget all held notes.
     *  Called on patch load and on MIDI "All Notes Off" (CC 123). */
    void allNotesOff();

    // --- Per-voice readout -----------------------------------------------

    /** @brief V/Oct pitch for voice @p voiceIdx.
     *  MIDI note 60 → 0.0 V; ±1 V per octave.  Returns 0.0f for out-of-range indices. */
    float voicePitchV  (std::uint8_t voiceIdx) const;

    /** @brief Gate state for voice @p voiceIdx; true while a note is held. */
    bool  voiceGate    (std::uint8_t voiceIdx) const;

    /** @brief Normalised velocity [0.0…1.0] for voice @p voiceIdx.
     *  Holds the value from the most recent NoteOn even after NoteOff, so
     *  envelope release can still read it. */
    float voiceVelocity(std::uint8_t voiceIdx) const;

    /** @brief Currently configured polyphony count. */
    std::uint8_t voiceCount() const { return alloc_.voiceCount(); }

    /** @brief Active MIDI channel filter; 0 = omni, 1–16 = specific channel. */
    std::uint8_t channel() const { return channelFilter_; }

    static void registerFactory();

private:
    // Returns true if the event should be ignored (channel doesn't match).
    bool filteredOut(std::uint8_t channel) const;

    VoiceAllocator             alloc_{};
    std::uint8_t               channelFilter_ = kOmni;

    // Per-voice state, indexed 0..kMaxAllocVoices-1. We keep velocity
    // separate from the allocator's `VoiceState` so the allocator stays
    // generic (no audio-domain concepts).
    std::array<std::uint8_t, kMaxAllocVoices> velocity_{};   // 0..127
    std::array<std::uint8_t, kMaxAllocVoices> currentNote_{}; // last note assigned
    std::array<bool,         kMaxAllocVoices> gate_{};
};

}  // namespace mb::runtime
