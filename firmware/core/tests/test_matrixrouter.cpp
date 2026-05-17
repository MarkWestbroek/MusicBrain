// Tests for VoiceAllocator, SynthPatch blob, and MatrixRouter.

#include "mb/MatrixRouter.h"
#include "mb/SynthPatch.h"
#include "mb/VoiceAllocator.h"
#include "test_harness.h"

namespace {

mb::Patch makeSynthPatch(uint8_t voices = 8, uint8_t caseId = 0,
                         uint8_t firstSlot = 0x10) {
    mb::Patch p{};
    p.id = 1;
    p.schemaVersion = 1;
    p.setName("Synth");
    mb::synth::SynthPatchV1 sp{};
    sp.voiceCount = voices;
    sp.caseId     = caseId;
    sp.firstSlot  = firstSlot;
    sp.pitchBits  = 16;
    MB_REQUIRE(mb::synth::writeBlob(p, sp));
    return p;
}

mb::InputEvent noteOn(uint8_t n)  { return {mb::InputKind::MidiNoteOn,  0, n, 100}; }
mb::InputEvent noteOff(uint8_t n) { return {mb::InputKind::MidiNoteOff, 0, n, 0};   }

}  // namespace

// ---------- SynthPatch blob ----------
MB_TEST(synthpatch_roundtrip) {
    auto p = makeSynthPatch(8, 0, 0x10);
    auto sp = mb::synth::readBlob(p);
    MB_REQUIRE(sp.has_value());
    MB_REQUIRE(sp->voiceCount == 8);
    MB_REQUIRE(sp->caseId     == 0);
    MB_REQUIRE(sp->firstSlot  == 0x10);
    MB_REQUIRE(sp->pitchBits  == 16);
    MB_REQUIRE(sp->pitchChannel(0) == 0x0010);
    MB_REQUIRE(sp->gateChannel(0)  == 0x0011);
    MB_REQUIRE(sp->pitchChannel(7) == 0x001E);
    MB_REQUIRE(sp->gateChannel(7)  == 0x001F);
}

MB_TEST(synthpatch_rejects_bad_crc) {
    auto p = makeSynthPatch();
    p.blob[6] ^= 0xFF;
    MB_REQUIRE(!mb::synth::readBlob(p).has_value());
}

MB_TEST(synthpatch_rejects_bad_version) {
    auto p = makeSynthPatch();
    p.blob[0] = 0xFF;
    MB_REQUIRE(!mb::synth::readBlob(p).has_value());
}

MB_TEST(synthpatch_rejects_out_of_range_voices) {
    mb::Patch p{};
    mb::synth::SynthPatchV1 sp{};
    sp.voiceCount = 0; sp.pitchBits = 16;
    MB_REQUIRE(!mb::synth::writeBlob(p, sp));
    sp.voiceCount = 17; sp.pitchBits = 16;
    MB_REQUIRE(!mb::synth::writeBlob(p, sp));
}

// ---------- VoiceAllocator ----------
MB_TEST(voicealloc_picks_first_free_voice) {
    mb::VoiceAllocator va;
    va.configure(4);
    auto r = va.noteOn(60);
    MB_REQUIRE(r.voiceIdx == 0);
    MB_REQUIRE(!r.stole);
}

MB_TEST(voicealloc_fills_voices_in_order_when_empty) {
    mb::VoiceAllocator va;
    va.configure(4);
    MB_REQUIRE(va.noteOn(60).voiceIdx == 0);
    MB_REQUIRE(va.noteOn(62).voiceIdx == 1);
    MB_REQUIRE(va.noteOn(64).voiceIdx == 2);
    MB_REQUIRE(va.noteOn(67).voiceIdx == 3);
}

MB_TEST(voicealloc_steals_oldest_when_full) {
    mb::VoiceAllocator va;
    va.configure(4);
    va.noteOn(60);  // voice 0, age 1
    va.noteOn(62);  // voice 1, age 2
    va.noteOn(64);  // voice 2, age 3
    va.noteOn(67);  // voice 3, age 4
    auto r = va.noteOn(72);  // must steal oldest = voice 0
    MB_REQUIRE(r.voiceIdx == 0);
    MB_REQUIRE(r.stole);
    MB_REQUIRE(r.prevNote == 60);
}

MB_TEST(voicealloc_noteoff_releases_correct_voice) {
    mb::VoiceAllocator va;
    va.configure(4);
    va.noteOn(60);
    va.noteOn(62);
    va.noteOn(64);
    const uint8_t v = va.noteOff(62);
    MB_REQUIRE(v == 1);
    // With voice 3 still never-used (age 0), it wins over the freshly-freed
    // voice 1 (high age). Voice 1 is reused only after every voice has been
    // touched once — that's how RR spreading works.
    auto r = va.noteOn(70);
    MB_REQUIRE(r.voiceIdx == 3);
    MB_REQUIRE(!r.stole);
    // Now voice 1 is the only never-used-equivalent free slot.
    auto r2 = va.noteOn(71);
    MB_REQUIRE(r2.voiceIdx == 1);
    MB_REQUIRE(!r2.stole);
}

MB_TEST(voicealloc_noteoff_unknown_note_returns_ff) {
    mb::VoiceAllocator va;
    va.configure(4);
    va.noteOn(60);
    MB_REQUIRE(va.noteOff(99) == 0xFF);
}

MB_TEST(voicealloc_oldest_release_reused_first) {
    mb::VoiceAllocator va;
    va.configure(4);
    va.noteOn(60); va.noteOn(62); va.noteOn(64); va.noteOn(67);  // all held
    va.noteOff(60);  // voice 0 freed at age 5
    va.noteOff(62);  // voice 1 freed at age 6
    // Voice 0 was freed first → should be picked first.
    MB_REQUIRE(va.noteOn(70).voiceIdx == 0);
    MB_REQUIRE(va.noteOn(72).voiceIdx == 1);
}

// ---------- midiNoteToCvCode ----------
MB_TEST(matrixrouter_midi_to_cv_code_anchor_points) {
    MB_REQUIRE(mb::MatrixRouter::midiNoteToCvCode(60) == 0);
    // MIDI 72 = +1 octave = +1V out of ±5V → +32767/5 ≈ +6553
    const int16_t v72 = mb::MatrixRouter::midiNoteToCvCode(72);
    MB_REQUIRE(v72 > 6500 && v72 < 6610);
    // MIDI 48 = -1 octave → ≈ -6553
    const int16_t v48 = mb::MatrixRouter::midiNoteToCvCode(48);
    MB_REQUIRE(v48 < -6500 && v48 > -6610);
    // MIDI 0 well past -5V → clipped to -32767
    MB_REQUIRE(mb::MatrixRouter::midiNoteToCvCode(0)   == -32767);
    // MIDI 127 past +5V → clipped to +32767
    MB_REQUIRE(mb::MatrixRouter::midiNoteToCvCode(127) ==  32767);
}

// ---------- MatrixRouter ----------
MB_TEST(matrixrouter_noteon_emits_cv_then_gate) {
    auto p = makeSynthPatch(8, 0, 0x10);
    mb::MatrixRouter r;
    auto out = r.handle(noteOn(60), &p);
    MB_REQUIRE(out.count == 2);

    MB_REQUIRE(out.commands[0].kind    == mb::OutputKind::CvSet);
    MB_REQUIRE(out.commands[0].channel == 0x0010);
    MB_REQUIRE(out.commands[0].data    == 0);

    MB_REQUIRE(out.commands[1].kind    == mb::OutputKind::GateSet);
    MB_REQUIRE(out.commands[1].channel == 0x0011);
    MB_REQUIRE(out.commands[1].data    == 1);
}

MB_TEST(matrixrouter_noteoff_drops_gate) {
    auto p = makeSynthPatch(8);
    mb::MatrixRouter r;
    r.handle(noteOn(60), &p);
    auto out = r.handle(noteOff(60), &p);
    MB_REQUIRE(out.count == 1);
    MB_REQUIRE(out.commands[0].kind    == mb::OutputKind::GateSet);
    MB_REQUIRE(out.commands[0].channel == 0x0011);
    MB_REQUIRE(out.commands[0].data    == 0);
}

MB_TEST(matrixrouter_steal_emits_gate_off_first) {
    auto p = makeSynthPatch(2);  // only 2 voices to force a steal quickly
    mb::MatrixRouter r;
    r.handle(noteOn(60), &p);
    r.handle(noteOn(62), &p);
    auto out = r.handle(noteOn(64), &p);  // must steal voice 0
    // Expect: GateOff(voice0), CvSet(voice0), GateOn(voice0)
    MB_REQUIRE(out.count == 3);
    MB_REQUIRE(out.commands[0].kind == mb::OutputKind::GateSet);
    MB_REQUIRE(out.commands[0].data == 0);
    MB_REQUIRE(out.commands[1].kind == mb::OutputKind::CvSet);
    MB_REQUIRE(out.commands[2].kind == mb::OutputKind::GateSet);
    MB_REQUIRE(out.commands[2].data == 1);
    // All three on voice-0's channels (pitch=0x10, gate=0x11).
    MB_REQUIRE(out.commands[0].channel == 0x0011);
    MB_REQUIRE(out.commands[1].channel == 0x0010);
    MB_REQUIRE(out.commands[2].channel == 0x0011);
}

MB_TEST(matrixrouter_no_patch_emits_nothing) {
    mb::MatrixRouter r;
    auto out = r.handle(noteOn(60), nullptr);
    MB_REQUIRE(out.count == 0);
}

MB_TEST(matrixrouter_program_change_emits_display_dirty) {
    auto p = makeSynthPatch(8);
    mb::MatrixRouter r;
    auto out = r.handle({mb::InputKind::MidiProgramChange, 0, 1, 0}, &p);
    MB_REQUIRE(out.count == 1);
    MB_REQUIRE(out.commands[0].kind == mb::OutputKind::DisplayDirty);
}
