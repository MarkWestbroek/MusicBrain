#pragma once
// MatrixRouter: project 3 (modular brain) synth router.
//   * Reads a Patch whose blob is a patch.synth.v1 (see SynthPatch.h).
//   * Uses VoiceAllocator (last-note priority, RR steal) to pick voice.
//   * Emits per-NoteOn: optional GateSet=0 + CvSet (pitch) + GateSet=1.
//     The brief gate-off when stealing lets the breakout re-trigger envelopes.
//   * Emits per-NoteOff: GateSet=0 on the releasing voice.
//   * Stateless w.r.t. the patch contents — re-parses on every call so the
//     editor can hot-swap patches at any tick.
//
// data field convention (see Router.h):
//   CvSet:   data = int32_t carrying a normalised CV value [-1..+1] mapped
//            to int16 codes (-32767..+32767). This matches the SPI CvSet
//            opcode's int16 payload directly.
//   GateSet: data = 0 (off) or 1 (on).

#include "Router.h"
#include "VoiceAllocator.h"
#include "SynthPatch.h"

namespace mb {

class MatrixRouter : public Router {
public:
    // Convert a MIDI note 0..127 to the i16 CV code described in
    // patch.synth.v1.md (MIDI 60 = 0, ±5 octaves = ±32767, clipped).
    static int16_t midiNoteToCvCode(uint8_t midiNote);

    RouterResult handle(const InputEvent& ev, const Patch* active) override;

private:
    VoiceAllocator alloc_;
    uint8_t        configuredFor_ = 0;  // voiceCount the allocator was set up with
};

}  // namespace mb
