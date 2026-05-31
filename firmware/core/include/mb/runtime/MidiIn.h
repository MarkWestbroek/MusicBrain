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
 * - Control Change (mod-wheel CC1 + two configurable CC numbers).
 * - Pitch-bend (14-bit, ± `bendRange` semitones).
 *
 * **Planned:** aftertouch.
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
 * | `steal`      | int     | poly voice-stealing: 0=oldest,1=lowest,2=highest |
 * | `priority`   | int     | mono note-priority (accepted; FW-1, not yet acted on) |
 * | `legato`     | int     | mono legato on/off (accepted; FW-1, not yet acted on) |
 * | `cc1Num`     | int     | CC number routed to `cv_cc1` (0..127; default 74)  |
 * | `cc2Num`     | int     | CC number routed to `cv_cc2` (0..127; default 71)  |
 * | `bendRange`  | int     | pitch-bend range in semitones (1..24; default 2)   |
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
     *  Supported ids: `"channel"` (0–16), `"voiceCount"` (1…kMaxAllocVoices),
     *  `"steal"` (0=oldest/1=lowest/2=highest). `"priority"` and `"legato"`
     *  are accepted but not yet acted on (FW-1). */
    void setControl(std::string_view controlId, ControlValue value) override;

    /** @brief Declare the kind of each named output port.
     *  `pitch` → Cv (V/Oct), `gate` → Gate (0.0 / 1.0), `vel` → Cv.
     *  Modulation outputs `cv_mod` (mod-wheel), `cv_bend` (pitch-bend, V/Oct),
     *  `cv_cc1`/`cv_cc2` (configurable CC) are all Cv.
     *  Voice-indexed variants `pitchK`/`gateK`/`velK` (K = 1…voiceCount,
     *  1-based) report the same kinds for per-voice routing (ADR 0011 §4). */
    PortKind outputPortKind(std::string_view portId) const override {
        if (portId == "pitch") return PortKind::Cv;
        if (portId == "gate")  return PortKind::Gate;
        if (portId == "vel")   return PortKind::Cv;
        if (portId == "cv_mod"  || portId == "cv_bend" ||
            portId == "cv_cc1"  || portId == "cv_cc2") return PortKind::Cv;
        if (parseVoicePort(portId, "pitch") >= 0) return PortKind::Cv;
        if (parseVoicePort(portId, "vel")   >= 0) return PortKind::Cv;
        if (parseVoicePort(portId, "gate")  >= 0) return PortKind::Gate;
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

    /** @brief Accept a MIDI Control Change event.
     *  Updates the mod-wheel (CC 1) and the two configurable CC slots
     *  (`cc1Num`/`cc2Num`). CC 123 (All Notes Off) lowers every gate.
     *  No-op when the channel is filtered. */
    void onControlChange(std::uint8_t channel, std::uint8_t cc, std::uint8_t value);

    /** @brief Accept a MIDI pitch-bend event.
     *  @param value14 raw 14-bit bend value (0–16383; 8192 = centre).
     *  Mapped to ±`bendRange` semitones on `cv_bend`. No-op when filtered. */
    void onPitchBend(std::uint8_t channel, int value14);

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

    /** @brief Current poly voice-stealing strategy (set via `"steal"`). */
    StealStrategy stealStrategy() const { return alloc_.stealStrategy(); }

    /** @brief Mod-wheel (CC 1) value, normalised 0.0…1.0. */
    float modWheel() const { return static_cast<float>(modWheel_) * (1.0f / 127.0f); }

    /** @brief Pitch-bend offset in V/Oct (±`bendRange` semitones). */
    float pitchBendV() const {
        const float norm = (static_cast<float>(bend14_) - 8192.0f) / 8192.0f; // -1..~+1
        return norm * (static_cast<float>(bendRange_) / 12.0f);
    }

    static void registerFactory();

private:
    // Returns true if the event should be ignored (channel doesn't match).
    bool filteredOut(std::uint8_t channel) const;

    /** @brief Parse a voice-indexed port id of the form `<base><K>` (K ≥ 1).
     *  @return 0-based voice index (K−1) on a match, or −1 if @p portId is not
     *          exactly @p base followed by a positive 1-based integer.
     *  Example: `parseVoicePort("pitch2", "pitch") == 1`. */
    static int parseVoicePort(std::string_view portId, std::string_view base) {
        if (portId.size() <= base.size())            return -1;
        if (portId.substr(0, base.size()) != base)   return -1;
        const std::string_view digits = portId.substr(base.size());
        std::uint32_t k = 0;
        for (char c : digits) {
            if (c < '0' || c > '9') return -1;
            k = k * 10 + static_cast<std::uint32_t>(c - '0');
            if (k > kMaxAllocVoices) return -1;  // guard against overflow.
        }
        if (k == 0) return -1;  // 1-based: "pitch0" is not valid.
        return static_cast<int>(k - 1);
    }

    VoiceAllocator             alloc_{};
    std::uint8_t               channelFilter_ = kOmni;

    // Mono legato (FW-1). Only active when voiceCount()==1 && legato_. Holds
    // the stack of currently-pressed notes in press order so a NoteOff falls
    // back to the previously-held note (last-note priority), and overlapping
    // notes change pitch on voice 0 *without* lowering the gate (no envelope
    // retrigger — that is the whole point of legato).
    bool                       legato_ = false;
    static constexpr std::uint8_t kMonoStackMax = 32;
    std::array<std::uint8_t, kMonoStackMax> monoStack_{};
    std::uint8_t               monoStackLen_ = 0;

    bool monoLegatoActive() const { return legato_ && alloc_.voiceCount() == 1; }
    void monoPush(std::uint8_t note);
    void monoRemove(std::uint8_t note);

    // Modulation state (ED-MI-4). Mod-wheel and two configurable CC slots are
    // stored as raw 0..127; pitch-bend keeps the raw 14-bit value (8192 = no
    // bend) so `pitchBendV()` can rescale when `bendRange` changes.
    std::uint8_t               modWheel_  = 0;       // CC 1
    std::uint8_t               cc1Num_    = 74;      // default: filter cutoff
    std::uint8_t               cc2Num_    = 71;      // default: resonance
    std::uint8_t               cc1Val_    = 0;
    std::uint8_t               cc2Val_    = 0;
    int                        bend14_    = 8192;    // 14-bit centre
    std::uint8_t               bendRange_ = 2;       // semitones

    // Per-voice state, indexed 0..kMaxAllocVoices-1. We keep velocity
    // separate from the allocator's `VoiceState` so the allocator stays
    // generic (no audio-domain concepts).
    std::array<std::uint8_t, kMaxAllocVoices> velocity_{};   // 0..127
    std::array<std::uint8_t, kMaxAllocVoices> currentNote_{}; // last note assigned
    std::array<bool,         kMaxAllocVoices> gate_{};
};

}  // namespace mb::runtime
