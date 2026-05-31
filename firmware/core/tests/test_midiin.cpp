// CTest — ADR 0010 MidiInModule:
//  - Registry self-registration round-trip
//  - Mono (1 voice): NoteOn raises gate + correct V/Oct, NoteOff lowers it
//  - Channel filter: omni vs single-channel
//  - Velocity-0 NoteOn behaves as NoteOff (MIDI convention)
//  - Polyphony: 4 voices, 4 simultaneous notes get distinct slots
//  - Voice stealing: 5th note kicks the oldest, gate retriggers cleanly
//  - allNotesOff() lowers every gate
//  - voiceCount control reconfigures + clears state
#include "test_harness.h"
#include "mb/runtime/MidiIn.h"
#include "mb/runtime/Registry.h"

#include <cmath>

using namespace mb::runtime;

namespace {

constexpr float kEps = 1e-4f;

// Count how many voice gates are currently high.
int countHighGates(const MidiInModule& m) {
    int n = 0;
    for (std::uint8_t i = 0; i < m.voiceCount(); ++i) {
        if (m.voiceGate(i)) ++n;
    }
    return n;
}

}  // namespace

MB_TEST(midiin_self_registers_in_global_registry) {
    MB_REQUIRE(Registry::global().has(MidiInModule::kTypeId));
    auto mod = Registry::global().create(MidiInModule::kTypeId, "midi1");
    MB_REQUIRE(mod != nullptr);
    MB_REQUIRE(mod->typeId() == MidiInModule::kTypeId);
    MB_REQUIRE(mod->id()     == "midi1");
}

MB_TEST(midiin_mono_noteon_raises_gate_and_sets_pitch) {
    MidiInModule midi("m");
    // Default: 1 voice, omni.
    MB_REQUIRE(midi.voiceCount() == 1);
    MB_REQUIRE(!midi.voiceGate(0));

    midi.onNoteOn(1, 60, 100);   // middle C → 0.0 V
    MB_REQUIRE(midi.voiceGate(0));
    MB_REQUIRE(std::fabs(midi.voicePitchV(0) - 0.0f) < kEps);
    MB_REQUIRE(std::fabs(midi.voiceVelocity(0) - (100.0f / 127.0f)) < kEps);

    midi.onNoteOn(1, 72, 64);    // one octave up → +1.0 V
    MB_REQUIRE(std::fabs(midi.voicePitchV(0) - 1.0f) < kEps);

    midi.onNoteOff(1, 72);
    MB_REQUIRE(!midi.voiceGate(0));
    // After NoteOff the pitch sticks (release-phase friendly).
    MB_REQUIRE(std::fabs(midi.voicePitchV(0) - 1.0f) < kEps);
}

MB_TEST(midiin_velocity_zero_noteon_is_noteoff) {
    MidiInModule midi("m");
    midi.onNoteOn(1, 60, 100);
    MB_REQUIRE(midi.voiceGate(0));
    midi.onNoteOn(1, 60, 0);     // MIDI convention: vel=0 == NoteOff
    MB_REQUIRE(!midi.voiceGate(0));
}

MB_TEST(midiin_channel_filter_ignores_other_channels) {
    MidiInModule midi("m");
    midi.setControl("channel", ControlValue{std::int32_t{3}});   // listen ch3 only
    MB_REQUIRE(midi.channel() == 3);

    midi.onNoteOn(1, 60, 100);   // wrong channel → ignored
    MB_REQUIRE(!midi.voiceGate(0));

    midi.onNoteOn(3, 60, 100);   // matching channel
    MB_REQUIRE(midi.voiceGate(0));

    midi.onNoteOff(1, 60);       // wrong channel → does not release
    MB_REQUIRE(midi.voiceGate(0));
    midi.onNoteOff(3, 60);
    MB_REQUIRE(!midi.voiceGate(0));
}

MB_TEST(midiin_channel_filter_omni_accepts_all) {
    MidiInModule midi("m");
    // Default channel = 0 (omni)
    MB_REQUIRE(midi.channel() == MidiInModule::kOmni);
    midi.onNoteOn(7, 60, 100);
    MB_REQUIRE(midi.voiceGate(0));
}

MB_TEST(midiin_polyphony_four_voices_distinct_slots) {
    MidiInModule midi("m");
    midi.setControl("voiceCount", ControlValue{std::int32_t{4}});
    MB_REQUIRE(midi.voiceCount() == 4);
    MB_REQUIRE(countHighGates(midi) == 0);

    midi.onNoteOn(1, 60, 100);
    midi.onNoteOn(1, 64, 100);
    midi.onNoteOn(1, 67, 100);
    midi.onNoteOn(1, 72, 100);
    MB_REQUIRE(countHighGates(midi) == 4);

    // Each held note should occupy a distinct slot, and the pitches
    // should collectively equal {0, 4/12, 7/12, 12/12}. (Slot order
    // depends on the allocator, so we don't pin a particular voice.)
    bool seen60 = false, seen64 = false, seen67 = false, seen72 = false;
    for (std::uint8_t i = 0; i < 4; ++i) {
        if (!midi.voiceGate(i)) continue;
        const float v = midi.voicePitchV(i);
        if (std::fabs(v - 0.0f)       < kEps) seen60 = true;
        if (std::fabs(v - (4/12.0f))  < kEps) seen64 = true;
        if (std::fabs(v - (7/12.0f))  < kEps) seen67 = true;
        if (std::fabs(v - 1.0f)       < kEps) seen72 = true;
    }
    MB_REQUIRE(seen60 && seen64 && seen67 && seen72);
}

MB_TEST(midiin_polyphony_fifth_note_steals_a_voice) {
    MidiInModule midi("m");
    midi.setControl("voiceCount", ControlValue{std::int32_t{4}});

    midi.onNoteOn(1, 60, 100);
    midi.onNoteOn(1, 64, 100);
    midi.onNoteOn(1, 67, 100);
    midi.onNoteOn(1, 72, 100);
    MB_REQUIRE(countHighGates(midi) == 4);

    // Fifth note: allocator steals the oldest; we still have 4 high gates.
    midi.onNoteOn(1, 75, 100);
    MB_REQUIRE(countHighGates(midi) == 4);

    // 75 (D#5) → 15 semitones above middle C = 1.25 V
    bool seen75 = false;
    for (std::uint8_t i = 0; i < 4; ++i) {
        if (midi.voiceGate(i) && std::fabs(midi.voicePitchV(i) - 1.25f) < kEps) {
            seen75 = true; break;
        }
    }
    MB_REQUIRE(seen75);
}

MB_TEST(midiin_allnotesoff_clears_every_gate) {
    MidiInModule midi("m");
    midi.setControl("voiceCount", ControlValue{std::int32_t{4}});
    midi.onNoteOn(1, 60, 100);
    midi.onNoteOn(1, 64, 100);
    MB_REQUIRE(countHighGates(midi) == 2);

    midi.allNotesOff();
    MB_REQUIRE(countHighGates(midi) == 0);
}

MB_TEST(midiin_reconfigure_voicecount_clears_state) {
    MidiInModule midi("m");
    midi.setControl("voiceCount", ControlValue{std::int32_t{4}});
    midi.onNoteOn(1, 60, 100);
    MB_REQUIRE(countHighGates(midi) == 1);

    midi.setControl("voiceCount", ControlValue{std::int32_t{2}});
    MB_REQUIRE(midi.voiceCount() == 2);
    MB_REQUIRE(countHighGates(midi) == 0);   // reconfigure resets gates
}

MB_TEST(midiin_steal_control_sets_strategy) {
    MidiInModule midi("m");
    // Default strategy is Oldest (matches VoiceAllocator default).
    MB_REQUIRE(midi.stealStrategy() == mb::StealStrategy::Oldest);

    midi.setControl("steal", ControlValue{std::int32_t{1}});
    MB_REQUIRE(midi.stealStrategy() == mb::StealStrategy::Lowest);

    midi.setControl("steal", ControlValue{std::int32_t{2}});
    MB_REQUIRE(midi.stealStrategy() == mb::StealStrategy::Highest);

    midi.setControl("steal", ControlValue{std::int32_t{0}});
    MB_REQUIRE(midi.stealStrategy() == mb::StealStrategy::Oldest);

    // Out-of-range values clamp into the valid 0..2 range.
    midi.setControl("steal", ControlValue{std::int32_t{99}});
    MB_REQUIRE(midi.stealStrategy() == mb::StealStrategy::Highest);
    midi.setControl("steal", ControlValue{std::int32_t{-5}});
    MB_REQUIRE(midi.stealStrategy() == mb::StealStrategy::Oldest);
}

MB_TEST(midiin_mono_legato_holds_gate_and_falls_back) {
    MidiInModule midi("m");          // defaults to 1 voice (mono).
    midi.setControl("legato", ControlValue{true});

    // First note raises the gate.
    midi.onNoteOn(1, 60, 100);
    MB_REQUIRE(midi.voiceGate(0));
    MB_REQUIRE(std::fabs(midi.voicePitchV(0) - 0.0f) < kEps);   // note 60 → 0 V

    // Overlapping note: pitch changes, gate stays high (no retrigger).
    midi.onNoteOn(1, 64, 100);
    MB_REQUIRE(midi.voiceGate(0));
    MB_REQUIRE(std::fabs(midi.voicePitchV(0) - (4.0f / 12.0f)) < kEps);

    // Release the top note → fall back to the still-held note, gate stays high.
    midi.onNoteOff(1, 64);
    MB_REQUIRE(midi.voiceGate(0));
    MB_REQUIRE(std::fabs(midi.voicePitchV(0) - 0.0f) < kEps);

    // Release the last note → gate finally drops.
    midi.onNoteOff(1, 60);
    MB_REQUIRE(!midi.voiceGate(0));
}

MB_TEST(midiin_mono_legato_only_when_mono) {
    MidiInModule midi("m");
    midi.setControl("legato", ControlValue{true});
    midi.setControl("voiceCount", ControlValue{std::int32_t{2}});  // poly: legato off

    // Two distinct notes occupy two voices (normal poly), not one mono voice.
    midi.onNoteOn(1, 60, 100);
    midi.onNoteOn(1, 64, 100);
    MB_REQUIRE(midi.voiceGate(0));
    MB_REQUIRE(midi.voiceGate(1));
}

MB_TEST(midiin_modwheel_and_cc_outputs) {
    MidiInModule midi("m");
    // Defaults: everything at 0.
    MB_REQUIRE(std::fabs(midi.readCvPort("cv_mod") - 0.0f) < kEps);
    MB_REQUIRE(std::fabs(midi.readCvPort("cv_cc1") - 0.0f) < kEps);
    MB_REQUIRE(std::fabs(midi.readCvPort("cv_cc2") - 0.0f) < kEps);

    // Mod-wheel = CC 1; 127 → 1.0.
    midi.onControlChange(1, 1, 127);
    MB_REQUIRE(std::fabs(midi.readCvPort("cv_mod") - 1.0f) < kEps);

    // Default configurable CCs: cc1Num=74, cc2Num=71.
    midi.onControlChange(1, 74, 64);
    midi.onControlChange(1, 71, 127);
    MB_REQUIRE(std::fabs(midi.readCvPort("cv_cc1") - (64.0f/127.0f)) < kEps);
    MB_REQUIRE(std::fabs(midi.readCvPort("cv_cc2") - 1.0f) < kEps);

    // Reassign cc1 to CC 20; CC 74 should no longer move cv_cc1.
    midi.setControl("cc1Num", ControlValue{std::int32_t{20}});
    midi.onControlChange(1, 74, 0);                 // old number, now ignored
    MB_REQUIRE(std::fabs(midi.readCvPort("cv_cc1") - (64.0f/127.0f)) < kEps);
    midi.onControlChange(1, 20, 127);
    MB_REQUIRE(std::fabs(midi.readCvPort("cv_cc1") - 1.0f) < kEps);

    // Channel filter applies to CC too.
    midi.setControl("channel", ControlValue{std::int32_t{2}});
    midi.onControlChange(5, 1, 0);                  // wrong channel → ignored
    MB_REQUIRE(std::fabs(midi.readCvPort("cv_mod") - 1.0f) < kEps);
}

MB_TEST(midiin_pitchbend_output_scales_with_range) {
    MidiInModule midi("m");
    // Centre = no bend.
    MB_REQUIRE(std::fabs(midi.readCvPort("cv_bend") - 0.0f) < kEps);

    // Full up-bend with default range (±2 semitones) → +2/12 V.
    midi.onPitchBend(1, 16383);
    MB_REQUIRE(std::fabs(midi.readCvPort("cv_bend") - (2.0f/12.0f)) < 2e-3f);

    // Full down-bend → about -2/12 V.
    midi.onPitchBend(1, 0);
    MB_REQUIRE(std::fabs(midi.readCvPort("cv_bend") - (-2.0f/12.0f)) < kEps);

    // Widen range to 12 semitones (1 octave): full up = +1 V.
    midi.setControl("bendRange", ControlValue{std::int32_t{12}});
    midi.onPitchBend(1, 16383);
    MB_REQUIRE(std::fabs(midi.readCvPort("cv_bend") - 1.0f) < 1e-2f);
}

// ---------- Voice-indexed ports (ADR 0011 §4) ----------
MB_TEST(midiin_voice_indexed_ports_route_each_voice) {
    MidiInModule midi("m");
    midi.setControl("voiceCount", ControlValue{std::int32_t{2}});
    midi.onNoteOn(1, 60, 100);   // voice 0: 0 V
    midi.onNoteOn(1, 72, 64);    // voice 1: +1 V

    MB_REQUIRE(std::fabs(midi.readCvPort("pitch1") - 0.0f) < kEps);
    MB_REQUIRE(std::fabs(midi.readCvPort("pitch2") - 1.0f) < kEps);
    MB_REQUIRE(midi.readCvPort("gate1") == 1.0f);
    MB_REQUIRE(midi.readCvPort("gate2") == 1.0f);
    MB_REQUIRE(std::fabs(midi.readCvPort("vel1") - (100.0f / 127.0f)) < kEps);
    MB_REQUIRE(std::fabs(midi.readCvPort("vel2") - (64.0f  / 127.0f)) < kEps);

    midi.onNoteOff(1, 72);       // voice 1 gate drops
    MB_REQUIRE(midi.readCvPort("gate2") == 0.0f);
    MB_REQUIRE(midi.readCvPort("gate1") == 1.0f);
}

MB_TEST(midiin_voice_indexed_ports_kind_and_bounds) {
    MidiInModule midi("m");
    midi.setControl("voiceCount", ControlValue{std::int32_t{2}});
    // Port kinds reported correctly.
    MB_REQUIRE(midi.outputPortKind("pitch1") == Module::PortKind::Cv);
    MB_REQUIRE(midi.outputPortKind("gate2")  == Module::PortKind::Gate);
    MB_REQUIRE(midi.outputPortKind("vel1")   == Module::PortKind::Cv);
    // Out-of-range / malformed names report no port.
    MB_REQUIRE(midi.outputPortKind("pitch0") == Module::PortKind::None);
    MB_REQUIRE(midi.outputPortKind("pitchX") == Module::PortKind::None);
    // Index above voiceCount reads as 0 (silent), not garbage.
    MB_REQUIRE(midi.readCvPort("gate3") == 0.0f);
}

// ---------- Portamento / glide (FW-1 slice) ----------
MB_TEST(midiin_glide_off_is_instant) {
    MidiInModule midi("m");
    // Default glide = 0 (off): pitch jumps immediately, no tick needed.
    midi.onNoteOn(1, 60, 100);
    MB_REQUIRE(std::fabs(midi.voicePitchV(0) - 0.0f) < kEps);
    midi.onNoteOn(1, 72, 100);                 // +1 octave
    MB_REQUIRE(std::fabs(midi.voicePitchV(0) - 1.0f) < kEps);
}

MB_TEST(midiin_glide_ramps_toward_target) {
    MidiInModule midi("m");
    // 100 ms per octave → 0.01 V per 1 ms tick.
    midi.setControl("glide", ControlValue{100.0f});

    // First note primes/snaps on the first tick (no upward sweep from 0).
    midi.onNoteOn(1, 60, 100);                 // target 0 V
    midi.tick();
    MB_REQUIRE(std::fabs(midi.voicePitchV(0) - 0.0f) < kEps);

    // Jump an octave up; output should now glide, not snap.
    midi.onNoteOn(1, 72, 100);                 // target +1 V
    midi.tick();                               // one 1 ms step → ~0.01 V
    const float afterOne = midi.voicePitchV(0);
    MB_REQUIRE(afterOne > 0.0f);
    MB_REQUIRE(afterOne < 1.0f);
    MB_REQUIRE(std::fabs(afterOne - 0.01f) < 1e-3f);

    // After enough ticks it reaches and clamps at the target.
    for (int i = 0; i < 200; ++i) midi.tick();
    MB_REQUIRE(std::fabs(midi.voicePitchV(0) - 1.0f) < kEps);
}

// ---------- Unison (ED-RV-9 firmware slice) ----------
MB_TEST(midiin_unison_drives_all_voices) {
    MidiInModule midi("m");
    midi.setControl("voiceCount", ControlValue{std::int32_t{4}});
    midi.setControl("unison", ControlValue{true});

    // One key gates every voice.
    midi.onNoteOn(1, 60, 100);
    for (std::uint8_t v = 0; v < 4; ++v) MB_REQUIRE(midi.voiceGate(v));

    // Last-note priority: a second key moves all voices to the new note.
    midi.onNoteOn(1, 67, 100);
    for (std::uint8_t v = 0; v < 4; ++v) MB_REQUIRE(midi.voiceGate(v));

    // Releasing the top note falls back to the still-held note; gates stay up.
    midi.onNoteOff(1, 67);
    for (std::uint8_t v = 0; v < 4; ++v) MB_REQUIRE(midi.voiceGate(v));

    // Releasing the last note drops every gate.
    midi.onNoteOff(1, 60);
    for (std::uint8_t v = 0; v < 4; ++v) MB_REQUIRE(!midi.voiceGate(v));
}

MB_TEST(midiin_unison_spread_detunes_symmetrically) {
    MidiInModule midi("m");
    midi.setControl("voiceCount", ControlValue{std::int32_t{4}});
    midi.setControl("unison", ControlValue{true});
    midi.setControl("spread", ControlValue{100.0f});   // 100 ct total spread
    midi.onNoteOn(1, 60, 100);                          // centre 0 V

    // Voices fan out symmetrically around the centre note.
    const float p0 = midi.voicePitchV(0);
    const float p3 = midi.voicePitchV(3);
    MB_REQUIRE(p0 < 0.0f);                  // lowest voice below centre
    MB_REQUIRE(p3 > 0.0f);                  // highest voice above centre
    MB_REQUIRE(std::fabs(p0 + p3) < kEps);  // symmetric: outer voices mirror
    // Total span = 100 ct = 1 semitone = 1/12 V across the outer voices.
    MB_REQUIRE(std::fabs((p3 - p0) - (1.0f / 12.0f)) < 1e-3f);

    // Spread is a unison-only feature: with unison off it has no effect.
    midi.setControl("unison", ControlValue{false});
    midi.onNoteOn(1, 60, 100);
    MB_REQUIRE(std::fabs(midi.voicePitchV(0) - 0.0f) < kEps);
}

