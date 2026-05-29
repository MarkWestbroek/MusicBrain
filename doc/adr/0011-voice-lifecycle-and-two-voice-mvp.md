# ADR 0011 – Voice lifecycle, steal strategy, and the two-voice MVP

## Status
Accepted (2026-05-29)

## Context

[ADR 0010](0010-midi-in-and-polyphony.md) lays out the *full* polyphony vision:
per-patch `voiceCount`, the editor "voice stamp" (patch one voice, ship N),
compile-time connection expansion, and the `CvBreakout` family. That is the
destination. It is also a large amount of UI + graph-expansion work, and it is
still marked **Proposed**.

We want to *start* polyphony now, on hardware, with a contained vertical slice
that proves the per-voice signal path end-to-end (MIDI → 2 voices → mix → out)
**without** first building the voice-stamp editor. Separately, real playing on
the current mono CV-bridge patch surfaced two questions about the
[`VoiceAllocator`](../../firmware/core/include/mb/VoiceAllocator.h):

1. **When is a voice really free?** Today `noteOff` marks a voice free
   immediately (gate low). But the envelope is still in its release phase and
   still making sound. Reusing such a voice for a new note cuts the release
   tail. The user proposed: a voice stays *busy* until its envelope release has
   actually finished, and only then becomes a candidate for a fresh note.
2. **Steal strategy should be selectable.** Oldest-note stealing is one policy;
   lowest/highest-note (bass/lead priority) are others a player may want.

This ADR records the decisions for both, plus the concrete shape of the
two-voice MVP. It intentionally does **not** supersede ADR 0010; it is the
incremental first step toward it.

## Decision

### 1. Voice/note model

A **voice** owns at most **one active note** at a time, exactly as the user
described:

- A MIDI NoteOn assigns the note to a voice (allocate or steal).
- A NoteOn on a voice that already holds a note *breaks* the previous note
  (retrigger). The previous note simply ends.
- A NoteOff drops the voice's gate. The note is no longer *held*, but the voice
  is not instantly free — its envelope runs its release.

This gives a three-state voice lifecycle (was two-state):

```
        NoteOn (allocate/steal)
  idle ───────────────────────────► held
   ▲                                  │
   │ release complete (env → 0)       │ NoteOff (gate low)
   │                                  ▼
   └──────────── releasing ◄──────────┘
                    │  NoteOn (reuse/soft-steal)
                    └───────────────────────────► held
```

- **idle** — gate low, envelope finished (or never played). First choice for a
  new note (no audible tail to cut).
- **held** — gate high, note sounding.
- **releasing** — gate low, envelope still ringing. Reusable, but only after all
  `idle` voices are exhausted; reusing one cuts its tail, so it is preferred
  over stealing a `held` voice but not over a truly `idle` one.

**Backward compatibility:** with 1 voice (mono) the single voice cycles
`idle → held → releasing → held …`. Because `releasing` voices are still
allocatable, mono never deadlocks even if nobody reports "release complete".

### 2. "Release complete" — the threshold question

The user asked: *when is the release really done — a threshold?*

Decision: **prefer the authoritative phase signal; use an amplitude threshold
only as a fallback.**

- The AHDSR already has a `Phase::Zero` state it enters when the release ramp
  reaches 0. That is the **authoritative** "done" signal — no guessing. The
  runtime calls `VoiceAllocator::markReleaseComplete(voiceIdx)` when the voice's
  amp envelope reports `Phase::Zero`.
- For envelope shapes/sources without a clean zero phase (or for a generic
  amplitude tap), fall back to a level threshold: release is "complete" when the
  voice's amplitude has stayed below **`kReleaseDoneLevel = 0.001`** (≈ −60 dBFS,
  inaudible) for at least one control tick. The constant lives with the runtime
  integration, not in the allocator.

Rationale: a fixed dB threshold is fragile across envelope curves and sustain
levels; the envelope's own phase machine already knows the exact moment. The
threshold is a safety net, not the primary mechanism.

**Wiring note (deferred):** driving `markReleaseComplete()` requires the runtime
to know *which envelope belongs to which voice*. That mapping only exists once
the per-voice graph is materialised (this MVP, item 4, and ADR 0010's
expansion). Until then the allocator's safe default (`releasing` voices remain
allocatable, lowest priority) gives correct behaviour without the feedback. The
feedback is a pure *improvement* (avoids cutting a long tail when an `idle`
voice is also available), not a correctness requirement.

### 3. Steal strategy

`VoiceAllocator` gains a configurable strategy that governs **which** voice is
chosen when a `releasing` voice must be reused or a `held` voice must be stolen:

```cpp
enum class StealStrategy : uint8_t {
    Oldest = 0,   // longest-sounding voice (default; current behaviour)
    Lowest = 1,   // lowest MIDI note — keeps the bass, steals melody
    Highest = 2,  // highest MIDI note — keeps a lead, steals lower notes
};
```

- Default is `Oldest`, which preserves all existing behaviour and tests.
- Strategy applies identically to the *reuse-a-releasing-voice* and
  *steal-a-held-voice* steps. Selecting `idle` voices is **always** oldest-age
  (never-used first), independent of strategy, because there is no tail to
  protect there — only click-minimisation matters.
- "Quietest" (steal the voice with the lowest current amplitude) is attractive
  but needs per-voice amplitude feedback (same plumbing as item 2). Deferred.

The strategy is set via `setStealStrategy()`; the editor MIDI-In panel will
later expose it as a control. Not surfaced in the editor yet.

### 4. Two-voice MVP — poly-group expansion at config-push (ADR 0010 §3)

The editor model stays **single-voice**: the user patches one voice chain and
marks the voiced modules as a rack-level `PolyGroup` (×N). Cables are drawn only
between *masters* (`members[0]`, voice 1) and *global* modules; followers
(`members[1..]`) are real modules but carry no cables of their own. Just before
the project is pushed to the Teensy, `flattenProjectForFirmware()`
(`editor/src/modular-mb/polyExpand.ts`) expands these master cables into the
flat per-voice connection list the firmware runs — so the brain stays "dumb"
and only ever sees a flat module + cable graph (ADR 0009/0010).

The firmware-side expansion *target* is the **voice-indexed output ports** on
the MIDI-In module:

- `MidiInModule` keeps its mono ports `pitch` / `gate` / `vel` (these carry
  `eventKind: 'voice'` in the editor) and additionally exposes **1-based
  voice-indexed** ports `pitchK` / `gateK` / `velK` up to `voiceCount`. `pitchK`
  returns `voicePitchV(K-1)`, etc. This is *why* a mono `pitch` cable can fan
  out: voice K reads `pitch{K}`.

Expansion rules (`expandPatchConnections`), with N = group `voiceCount`:

| source → sink | expansion |
|---|---|
| global → group, source port `eventKind:'voice'` | fan-out: voice v ← `pitch{v+1}` / `gate{v+1}` / `vel{v+1}` |
| global → group, plain global signal | fan-out: same source port → every voice |
| group → group (same N) | voice v of source → voice v of sink |
| group → global, numbered sink port (`in1`…) | voice v → `in{1+v}` |
| group → global, non-numbered sink | summed onto the same port |
| global → global | unchanged |

The seeded two-voice patch (`seedTwoVoicePatch`) therefore contains **one**
readable voice chain (VCO → envFlt → VCF → envAmp → CvMath(vel×env) → VCA) as
the master, a follower chain as plain modules, six `PolyGroup`s (one per voiced
type, ×2), and a single set of master cables: mono `pitch`/`gate`/`vel` → the
master modules, intra-chain group→group cables, and `VCA → mixer.in1`. The
flatten turns this into the two independent per-voice chains summed via the
mixer (`in1`/`in2`).

The editor sets `MidiIn.voiceCount = 2` (and `Patch.voiceCount = 2`) for this
patch so the allocator hands out two voices.

When the dedicated voice-stamp UI lands, it reuses the *same* expansion step —
only the way a PolyGroup is authored changes; the flatten is already the
compile-time stamp expansion of ADR 0010 §3.

## Consequences

- **Pro:** polyphony is testable on hardware now. The per-voice CV path
  (pitch/gate/vel → independent chains → mix) is proven, and the editor already
  exercises the real expansion path — not a hand-wired throwaway.
- **Pro:** the editor model stays clean (one voice chain + PolyGroups); the
  patcher shows a single set of cables with `×N` badges, matching the hardware.
- **Pro:** the allocator refinement is fully unit-testable in `core` (no
  envelope dependency): the three-state lifecycle and the three steal strategies
  are pure data transitions. Tests added in `test_matrixrouter.cpp`.
- **Pro:** the "release complete" feedback is optional and additive — correct
  behaviour without it, better behaviour with it. No risk to mono.
- **Con:** voice-indexed ports (`pitch1`, `pitch2`, …) remain a firmware-side
  surface, but they are now an *internal expansion target* the user never wires
  by hand.
- **Con:** patch-local poly overrides (`PatchPolyOverride`) and cell-member
  groups are not yet handled by the flatten — only whole-module rack PolyGroups.
- **Neutral:** `StealStrategy` and `markReleaseComplete()` are new public API on
  `VoiceAllocator`; both default to today's behaviour, so nothing else changes
  unless opted in.

## Open questions (carried forward to ADR 0010)

- Surfacing `StealStrategy` and the release-done threshold as editor controls on
  the MIDI-In panel.
- Generic per-voice amplitude feedback (enables "Quietest" steal + authoritative
  release-done for non-AHDSR sources).
- Replacing hand-wired voice chains with stamp expansion (ADR 0010 §3).
