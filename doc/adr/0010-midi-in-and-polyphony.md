# ADR 0010 – MIDI-In, polyphony, and the editor's "voice stamp"

## Status
Proposed (2026-05-23)

## Context

ADR 0009 set up the four-layer modular architecture but deliberately deferred two questions:

1. **How does polyphony work at the patch level?** Project-3 must drive analog VCOs + VCAs polyphonically. Today, [`SynthPatch.h`](../../firmware/core/include/mb/SynthPatch.h) stores a `voiceCount` and [`VoiceAllocator`](../../firmware/core/include/mb/VoiceAllocator.h) (`kMaxAllocVoices = 16`, last-note priority, oldest-held steal) exists and is tested, but the editor patch (`Patch.connections[]`) has no notion of "this fragment runs once per voice". The simulator and the MIDI-In module are mono.
2. **Where does MIDI live in the runtime hierarchy?** Layer 3 has `Module → CvModule / AudioModule / ExternalModule`. MIDI is neither CV nor audio nor external Eurorack — it is an *event source* that has to feed the voice allocator and then drive whatever envelopes/VCOs the patch wires up.

The current editor MIDI-In module (`tp_mmb_midiin`, [seedModules.ts](../../editor/src/modular-mb/seedModules.ts) `mmbMidiIn()`) exposes one `pitch` + one `gate` output and is documented as "mono · last-note". That's good enough for a test patch but not for the project goal.

The user constraint added on top of all that: **voice count is a per-patch choice**, not a global compile-time number. A patch may be mono, duophonic, 4-voice or 8-voice; the cap is what the hardware can do (currently 16, matching the allocator), not a fixed 8. And — crucially — the user wants to *draw* a polyphonic patch by **patching one voice and marking the fragment as "×N"**, not by manually duplicating and re-wiring every cable N times.

## Decision

### 1. Voice count belongs to the patch

- `Patch.voiceCount: uint8_t` (1..`kMaxAllocVoices`) is the single source of truth. It already exists in [`SynthPatchV1`](../../firmware/core/include/mb/SynthPatch.h) and now becomes mandatory in the layer-2 TypeScript `Patch` as well.
- The MIDI-In module reads it from the patch; it does **not** own it. Two MIDI-In modules in the same patch share the same allocator slot count (with separate channel filters they can address different keyboards into the same voice pool, or the patch can configure two pools — see "Open questions").
- Reducing `voiceCount` is destructive (some voices disappear); the editor warns + offers undo.

### 2. `MidiInModule` is a new sibling of `CvModule`

We add a third concrete runtime branch:

```
Module (abstract)
 ├─ CvModule
 ├─ AudioModule
 ├─ ExternalModule
 └─ EventSourceModule  (new — abstract)
       └─ MidiInModule
```

Rationale: `EventSourceModule` produces *discrete events* (note on/off, CC, pitchbend, aftertouch) at irregular times, not periodic CV samples. It belongs on the same tick clock (1 kHz) as `CvModule` for output smoothing, but its `tick()` mainly drains an event queue filled from the MIDI ISR. Putting MIDI under `CvModule` would force every CV module to think about event semantics; putting it under `AudioModule` is nonsensical.

`MidiInModule` owns:
- A `VoiceAllocator` configured from `Patch.voiceCount`.
- A `channelFilter` (0 = omni, 1..16).
- One `OutputBus` carrying, per voice:
  - `pitch_cv` (V/oct, 16-bit, smoothed by the per-voice glide / portamento)
  - `gate`
  - `velocity_cv` (0..1, latched at note-on)
  - `aftertouch_cv` (per-voice, 0..1, optional)
- Plus *global* (non-per-voice) outputs:
  - `mod_cv` (CC1)
  - `pitchbend_cv` (-1..+1)
  - `channel_aftertouch_cv` (0..1)
  - `clock_pulse` (24 ppqn or 1 ppqn, switch)

The panel exposes `voiceCount` as a knob mirrored from `Patch.voiceCount` (read-only there; the canonical control is the patch property). Mode is `mono | last | legato | poly`; selecting `poly` makes the per-voice output bus active and disables the legacy single `pitch`/`gate` pair.

### 3. Polyphony in the editor: the "voice stamp"

A patch may declare one or more **voice stamps**. A voice stamp is a *named subgraph* of the patch — a set of module instances plus all connections between them — flagged "repeated N times, one per voice".

#### Data model

Added to layer 2:

```ts
interface VoiceStamp {
  id: string;              // stable id
  name: string;            // user-visible, e.g. "Voice"
  voiceCount: number;      // typically === patch.voiceCount, but a patch may
                           // also have e.g. a 2-voice stamp inside an 8-voice
                           // patch (a paraphonic sub-section). Default: patch-wide.
  memberIds: string[];     // module instance ids inside the stamp
  inputs: StampPort[];     // ports on stamp members that receive a single
                           // shared signal from outside the stamp; the editor
                           // shows them as one port on the stamp boundary
                           // (e.g. a global LFO going into all voices' VCFs).
  outputs: StampPort[];    // ports inside the stamp that contribute to a
                           // shared output bus (typically the per-voice audio
                           // out feeding a mixer outside the stamp).
}

interface StampPort {
  instanceId: string;
  portId: string;
  shareMode: 'broadcast' | 'sum' | 'voice-indexed';
}

Patch {
  ...,
  voiceCount: number,
  voiceStamps: VoiceStamp[],
}
```

#### Semantics — every module is either *inside* a stamp or *global*

- **Inside a stamp**: the module is *per-voice*. The brain instantiates `voiceStamp.voiceCount` copies at compile time. The voice allocator's voice index `v ∈ [0, voiceCount)` selects which copy receives each MIDI event.
- **Outside any stamp**: the module is *global*. One instance, one set of CV values, shared by all voices.

So in the user's example:

| Module | Placement | Concrete instances on the brain |
|---|---|---|
| VCO   | inside "Voice" stamp (8-voice) | 8 |
| AHDSR 1 (VCA env) | inside "Voice" stamp | 8 |
| AHDSR 2 (filter env) | inside "Voice" stamp | 8 (so 2× AHDSR ⇒ 16 envelopes) |
| LFO "vibrato" | inside "Voice" stamp | 8 (per-voice — each voice can have its own random S&H) |
| LFO "filter sweep" | outside any stamp | 1 (shared) |
| VCF | inside "Voice" stamp | 8 |
| VCA | inside "Voice" stamp | 8 |
| Mixer | outside any stamp | 1 (sums the 8 VCA outputs) |
| CV-breakout (pitch) | outside any stamp | 1 board, but its channels are addressed per-voice via voice-index expansion |

#### Connection expansion rules at compile time

Let `S` be a stamp with voice count `N`. A connection `(fromInstance.fromPort) → (toInstance.toPort)` is expanded as follows:

| `from ∈ S` | `to ∈ S` | Resulting connections |
|---|---|---|
| no  | no  | 1 connection (unchanged; both global) |
| no  | yes | `N` connections — global source fanned out to every voice copy (e.g. global LFO into every voice's VCF cutoff) |
| yes | no  | `N` connections summed into the global sink, *or* `N` connections fanned into a voice-indexed sink (e.g. the pitch-breakout's per-voice channel). The `to.shareMode` decides — default `sum` for audio sinks, `voice-indexed` for breakout channels. |
| yes | yes | `N` connections — voice `v` of source to voice `v` of sink (no cross-voice wiring; that's a separate cable the user can draw explicitly between two stamps if they want it). |

This is purely **at compile time** (= when materialising a `SynthPatch` for the firmware, or when building the simulator graph). The C++ firmware only ever sees the flattened patch: many `ModuleInstance`s and many `Connection`s. There is no stamp concept on the brain. The brain doesn't even need to know which module came from which stamp — it just sees `vco_voice3` and a cable from `midi_in.voice3.pitch` to `vco_voice3.voct`. (See "Open questions" for whether stamp metadata stays in the binary for round-tripping.)

#### Visual representation

- A stamp is drawn as a translucent **rounded rectangle** behind its member modules with a header showing `name · ×N`.
- Boundary ports (the StampPort list) appear as **larger sockets on the stamp's outline**, one per shared signal. Internally each boundary socket is wired to the matching port on every member copy, but in the editor you only see *one* socket on the outside.
- "Member" modules inside the stamp are drawn once, in their normal place. A small "×N" badge in the corner indicates they are voiced.
- Toggling a single voice's view (e.g. "show voice 3") is a *projection* — the user keeps editing the one canonical instance; voice 3 is just a debug view.
- Drag-out / drag-in a module to/from the stamp is the only way to change its per-voice / global status. Editor enforces that connections still resolve through the expansion table; cables that would become ambiguous are flagged before the change is committed.

#### Compile-time vs simulator

The simulator (TS `AudioEngine`) runs the expansion in memory and feeds Tone.js the flattened graph (`N` `Tone.Oscillator`s, one per voice, fed by an in-browser allocator). The simulator is what proves the polyphony before any device sees the patch. The firmware sees the same flattened graph encoded in `SynthPatchV1`.

### 4. Firmware wiring

- `MidiInModule` (firmware) reads the MIDI ISR queue every `tick()`, drives its embedded `VoiceAllocator`, and pushes per-voice CV/gate updates to its per-voice output bus.
- The output bus is wired to consuming modules via the same `Connection`-driven plumbing as any other CV. The fact that "voice 3's gate" goes to "ahdsr_voice3.gate" is just a connection in the patch.
- USB-MIDI and DIN-MIDI are merged at a layer below `MidiInModule`: a single brain-wide `MidiSource` aggregator deduplicates / interleaves both transports into a unified event stream tagged with `(transport, channel)`. The `MidiInModule` subscribes to that stream filtered by `channelFilter`. This keeps `MidiInModule` device-agnostic.
- The brain remains the master for the SPI/CAN-FD bus (ADR 0006); MIDI does not introduce any new bus concern.

### 5. `CvBreakout` family — first scaffolding

Concrete first cut, header-only stubs to land alongside this ADR so other code can already reference them:

```
runtime/
  CvBreakout.h      // abstract: holds (caseId, slotId), exposes input
                    // slots; tick() forwards latest values to a pluggable
                    // BreakoutSink (default: null sink; tests inject a
                    // capturing sink; firmware injects the SPI sender).
  CvOut12.h         // 8-channel 12-bit modulation breakout
                    // (per dac-sh-mux.md; mux + S&H at ~5 kHz/channel)
  CvOut16.h         // 4- or 8-channel 16-bit pitch breakout (DAC8568)
  GateOut.h         // N-channel digital gate/trigger breakout
```

- `BreakoutSink` is a small abstract interface (`virtual void send(const SpiFrame&) = 0;`) so `CvBreakout::tick()` can run on the host for tests without dragging in any hardware headers.
- The concrete classes self-register against the existing `Registry` (`kTypeId = "tp_mmb_cv_out_12"` / `"tp_mmb_cv_out_16"` / `"tp_mmb_gate_out"`).
- DAC bit-depth + voltage scaling lives on the breakout class, not on the source modules — the source always sends a normalised float (cf. ADR 0004).
- Channel addressing: each breakout instance carries its `(caseId, slotId)` address, plus an offset table mapping its input slot index to a wire-level `channel = (caseId << 8) | (firstSlot + i)`. The voice-stamp expansion uses `voice-indexed` share mode to write voice `v`'s pitch to `firstSlot + v` on the pitch breakout — that's how 8 voices land on 8 different DAC channels with one cable in the editor.

This scaffolding is intentionally *not* the full breakout implementation. It pins down the seams (sink interface, channel addressing, normalised float in / opcode out) so the rest of the runtime can keep building against them.

## Consequences

- **Pro**: the user can patch one voice and ship 8. The mental model on the canvas is "one voice + a couple of globals", which is what the user actually thinks about.
- **Pro**: the brain stays dumb. No stamp logic on the device — flattened patch + connection list, exactly what `SynthPatchV1` and the runtime registry already handle.
- **Pro**: a paraphonic patch (e.g. 8 oscillators sharing 1 envelope) is a natural special case — VCO inside the stamp, AHDSR outside it.
- **Pro**: per-voice vs global is a *placement* decision, not a per-module flag in the layer-1 catalog. The same `tp_mmb_lfo` definition is used for "per-voice random S&H" and "global filter sweep" — only its location in / out of a stamp differs.
- **Pro**: MIDI-In stays a single module type from the user's perspective; `mode = poly` flips on the per-voice bus without forcing a different catalog entry.
- **Pro**: no new bus concern. Per-voice CV traffic is more frequent only because there are more channels; per-channel rate is unchanged. Bandwidth budget below.
- **Con**: the editor has to render and edit a subgraph-with-stamp UI, including drag in/out of the stamp boundary. Non-trivial UX work — the visual decisions above are starting points, not finished design.
- **Con**: undo/redo must treat stamp membership changes atomically (the expansion table determines whether existing connections are still valid).
- **Con**: the simulator has to support `N` voices for real. Today's mono engine needs a per-voice fan-out pass (mirrors what the firmware does at compile time, but inside Tone.js).
- **Con**: presets stored with a stamp need a sensible behaviour when the user changes `voiceCount` afterwards. Likely answer: the stamp pattern is per-stamp data, not per-voice data; preset stays valid as `N` changes because the pattern is "shape", and the engine instantiates as many copies as the new `N` says.
- **Neutral**: file format. `voiceStamps` is added to layer 2 JSON; the firmware blob does not need to carry stamp info because it stores the already-flattened graph. Stamp info stays in the editor JSON only.

### Bandwidth check (sanity)

Per-voice CV channels at 8 voices, 1 kHz tick, worst case all changing every tick:

| Source | Channels per voice | Tick rate | Bytes per update (SPI frame) | Bytes/sec at 8 voices |
|---|---:|---:|---:|---:|
| pitch (16-bit, smoothed by breakout) | 1 | 1 kHz | 8 (CvSet) | 64 kB/s |
| gate | 1 | event-rate, ≪ 1 kHz | 7 (GateSet) | negligible |
| velocity, aftertouch | 2 | ≤ 1 kHz | 16 | 128 kB/s |
| envelope CV (×2 envs) | 2 | 1 kHz | 16 | 128 kB/s |
| total per voice | — | — | — | ~320 kB/s |
| **× 8 voices** | — | — | — | **~2.6 MB/s** |

SPI master at 10 MHz half-duplex ≈ 1.25 MB/s after framing overhead — already tight at 8 voices, comfortable at 4. **Implication**: pitch and envelope CV must use `CvSegment` (interpolated by the breakout per ADR 0008), not `CvSet` per tick. That confirms a decision already made in ADR 0008 and locks it in for the polyphonic case.

## Open questions

- **Multiple voice pools per patch.** A patch with both 8 mono synth voices and a 4-voice drum sub-pool would want two allocators. Likely answer: one `MidiInModule` per pool, each with its own `channelFilter` and its own stamp. Confirm when the second use case actually appears.
- **CC routing as patchable signals.** Today only pitchbend / mod / aftertouch are surfaced. A full "CC matrix" output (one CV per CC number the user is interested in) belongs in MIDI-In but pushes the panel design. Defer until project-3 ergonomics demand it.
- **Stamp nesting.** Can a stamp contain another stamp? (E.g. 4-voice outer × 2-osc inner.) The expansion math generalises but the UI starts to bite. **Decision for now: no nesting in v1; revisit if a real patch needs it.**
- **Bus arbitration with multi-case.** ADR 0006 leaves CAN-FD priority assignment to a follow-up. At 8 voices the head bridge's CAN-FD link becomes the bottleneck for any remote case carrying per-voice CV. A simple priority scheme (pitch > envelope > LFO > management) probably suffices but needs measurement on real hardware.
- **External MIDI feedback (CV → MIDI out).** Not in scope here; that's a separate `MidiOutModule` once the brain has a MIDI-out port wired.
