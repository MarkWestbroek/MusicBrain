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
