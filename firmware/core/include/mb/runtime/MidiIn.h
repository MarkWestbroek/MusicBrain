#pragma once
// ADR 0009 / ADR 0010 — MIDI-in event-source module (firmware side).
//
// `MidiInModule` is the polyphony entry point: it consumes raw MIDI events
// (currently NoteOn / NoteOff; CC + pitch-bend follow later), assigns notes
// to voice slots through an internal `VoiceAllocator`, and exposes per-voice
// pitch (V/Oct convention, MIDI 60 → 0 V) + gate state.
//
// The class is platform-independent on purpose: tests drive `onNoteOn` /
// `onNoteOff` directly, and the Teensy USB-MIDI ISR (or DIN-MIDI port in
// `firmware/lib/midi_common/`) wires the same methods at runtime. There is
// no `MidiSource` abstract base yet — that comes when we merge USB + DIN
// into one stream. For now: one MidiInModule listens to one stream.
//
// Editor mirror: `tp_mmb_midiin` (see `editor/src/modular-mb/seedModules.ts`
// `mmbMidiIn()`). Marked `role: 'event-source'` in the editor; outputs
// `pitch` + `gate` are `eventKind: 'voice'`.

#include "CvModule.h"
#include "Registry.h"
#include "mb/VoiceAllocator.h"
#include <cstdint>

namespace mb::runtime {

class MidiInModule final : public CvModule {
public:
    static constexpr const char* kTypeId = "tp_mmb_midiin";

    // 0 = omni (accept all channels). 1..16 = listen to that channel only.
    static constexpr std::uint8_t kOmni = 0;

    explicit MidiInModule(std::string_view id);

    // --- Module overrides ------------------------------------------------

    // Supported control ids:
    //   "channel"     → int 0..16 (0 = omni)
    //   "voiceCount"  → int 1..kMaxAllocVoices (clamped); reconfigures
    //                   the allocator AND clears all voice state.
    void setControl(std::string_view controlId, ControlValue value) override;

    // --- CvModule override ----------------------------------------------

    // No-op: this module is event-driven (state updates happen synchronously
    // inside `onNoteOn` / `onNoteOff`). The tick override exists so the
    // module fits in the same scheduler loop as Lfo/Ahdsr without special
    // casing.
    void tick() override {}

    // --- MIDI event sinks (called from MIDI ISR or test code) -----------

    // Apply the channel filter, allocate a voice (steal if needed), and
    // raise that voice's gate. Velocity is stored per-voice in [0..1].
    // Note: zero-velocity NoteOn is treated as NoteOff (MIDI convention).
    void onNoteOn (std::uint8_t channel, std::uint8_t note, std::uint8_t velocity);

    // Release the voice that holds `note` (if any). No-op if the channel
    // is filtered out or no voice currently holds the note.
    void onNoteOff(std::uint8_t channel, std::uint8_t note);

    // Hard reset: lower every gate, forget every held note. Used on patch
    // load and on MIDI "All Notes Off" (CC 123).
    void allNotesOff();

    // --- Per-voice readout -----------------------------------------------

    // V/Oct: MIDI 60 → 0.0 V, ±1 V per octave. Returns 0.0f when the index
    // is out of range, so callers can iterate up to `kMaxAllocVoices`
    // without first reading `voiceCount()`.
    float voicePitchV  (std::uint8_t voiceIdx) const;

    // True while the voice currently holds a note.
    bool  voiceGate    (std::uint8_t voiceIdx) const;

    // [0.0 .. 1.0]; equals (velocity / 127.0f) of the most recent NoteOn
    // on this voice. Sticks at the last value after NoteOff so an envelope
    // can still read it during release.
    float voiceVelocity(std::uint8_t voiceIdx) const;

    // Currently configured polyphony.
    std::uint8_t voiceCount() const { return alloc_.voiceCount(); }

    // 0 = omni; otherwise the listening channel (1..16).
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
