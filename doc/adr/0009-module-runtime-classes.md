# ADR 0009 – Module runtime classes: OO domain layer, shared between TS editor and C++ firmware

## Status
Proposed (2026-05-22)

## Context
The MusicBrain modular editor (`editor/src/modular-mb/`) and the (still empty) `firmware/app-modular-brain/` both need to represent the same domain: oscillators, filters, envelopes, amplifiers, sequencers — wired together in a patch. Today the editor uses a fully data-oriented approach: TypeScript interfaces (`Module`, `ModuleType`, `Patch`, `Rack`, `Control`) as POJOs, with behaviour scattered across `seedModules.ts` (factories), `AudioEngine.ts` (one growing class with `switch(node.kind)` per operation), and React components (rendering).

Pros of the current setup: trivial JSON snapshots → free save/load, undo/redo, transport over the wire to firmware. Cons: adding a new module type touches 5+ places, module-specific knowledge is spread across files, `AudioEngine.ts` is becoming a god-module, and the C++ side will have to reinvent the same dispatch problem.

We want a domain model that:
- maps naturally onto our mental model (a module *is* a thing, with specialisations);
- gives one place per module type for its behaviour;
- mirrors cleanly between TypeScript (simulator) and C++17 (firmware);
- does **not** break the snapshot-based persistence, undo/redo, or React reconciliation that we rely on.

Tone.js (the simulator's audio backend) demonstrates a class hierarchy worth borrowing from: `ToneAudioNode` → `Source` / `Effect` / `Instrument` / `Envelope`, each with uniform `input`/`output`, `connect()`, `dispose()`, and lifecycle events like `triggerAttack(time)`. We can lean on those patterns where they fit.

## Decision

We introduce a **three-layer architecture** for the modular domain, with OO classes only where polymorphism removes a `switch` and stateful behaviour benefits from encapsulation.

### Layer 1 — Definition (data, serialisable)
Plain POJOs / PODs. What's in JSON on disk, in undo snapshots, and on the wire to firmware.

- TypeScript: `interface ModuleSnapshot`, `interface PatchSnapshot`, `interface ModularProjectSnapshot`, `interface ControlValueMap`, `interface ConnectionSnapshot`. (Current `interface Module` in `editor/src/modular-mb/types.ts` is renamed to `ModuleSnapshot` to free the class name.)
- C++: matching `struct`s in `firmware/core/include/mb/` (same field names, same shape).
- Rule: **no methods that mutate audio state** here. Only pure helpers like `nameView()`. Anything that produces sound or holds audio nodes lives in layer 2.

### Layer 2 — Runtime (OO, behaviour)
Living instances. One class per module type. Constructed from a `ModuleSnapshot`; **not** itself serialised.

Folder: `editor/src/modular-mb/runtime/` and `firmware/core/include/mb/runtime/`.

Class hierarchy (identical in both languages):

```
Module (abstract)               ← inputs[], outputs[], controls[], connect(), dispose()
 ├─ Source (abstract)            ← start(time), stop(time)
 │   ├─ Oscillator (abstract)    ← pitchCvIn, audioOut, tuning control
 │   │   ├─ Vco
 │   │   └─ Lfo                   (low-rate Oscillator specialisation)
 │   └─ Noise
 ├─ Filter (abstract)             ← audioIn, audioOut, cutoffCvIn
 │   ├─ Vcf
 │   └─ Svf
 ├─ Amplifier (abstract)          ← audioIn, audioOut, gainCvIn
 │   └─ Vca
 ├─ EnvelopeGenerator (abstract)  ← gateIn, envOut, triggerAttack(time), triggerRelease(time)
 │   ├─ Ad
 │   ├─ Adsr
 │   └─ Ahdsr                     (specialisation of Adsr / EnvelopeGenerator)
 └─ Sequencer (abstract)
     └─ Seq16
```

Naming rules:
- Classes are named after **what the thing is** (`Vco`, `Ahdsr`), never after their layer (no `VcoRuntime`).
- Abstract bases declare the minimum surface their level guarantees. `Oscillator` guarantees only `pitchCvIn`, `audioOut`, and a `tuning` control. `Vco` adds waveform / PWM / sync.
- Lifecycle methods follow Tone.js where applicable: `connect()`, `disconnect()`, `dispose()`, `triggerAttack(time)`, `triggerRelease(time)`.
- Control values that can be modulated use a `Param`/`Signal`-style wrapper (not raw `number`), so automation has a typed home.

TS-specific:
- The runtime class **wraps** Tone.js nodes by composition (`this.osc = new Tone.Oscillator(...)`). We do not extend Tone classes directly — composition keeps the hierarchy ours.

C++-specific:
- Same class names and method signatures. Where TS wraps a `Tone.Oscillator`, C++ wraps the equivalent (a DAC-driven CV stream, or an AudioStream object for project-3 internal voices).
- Definition and Runtime **may** coalesce into a single class with `serialize()/deserialize()` if it keeps the firmware leaner; the editor splits them because React requires immutable data.

### Layer 3 — View (frontend only)
React functional components. They read from layer 1 (the snapshot), dispatch edits to the store, and never reach into layer 2.

- Components mirror the class hierarchy by **composition**, not by class inheritance: `OscillatorPanel` is a function that renders pitch-CV-in + tuning + audio-out; `VcoPanel` is a function that calls `<OscillatorPanel .../>` and then renders the extra controls. No `class Panel` — that fights React.

### Cross-cutting rules
- **Registry**: each runtime class registers itself by `typeId` (e.g. `tp_mmb_vcf`). `AudioEngine` becomes a thin dispatcher: `registry.get(snapshot.typeId).create(snapshot)`. No more `switch(kind)`.
- **Persistence stays snapshot-based.** Save / load / undo / redo / presets all operate on layer 1. Migration on load: build runtime instances from snapshots.
- **TS ↔ C++ symmetry by convention**, not by code generation, in the first iteration: same class names, same `typeId`s, same control IDs. If drift becomes a problem we add a shared JSON schema and generate stubs (deferred to a future ADR).

## Migration plan (informative, not part of the decision)
1. Rename `interface Module` → `ModuleSnapshot` in `editor/src/modular-mb/types.ts`. Update call sites.
2. Add `editor/src/modular-mb/runtime/` with `Module` (abstract) and `Registry`.
3. Migrate **one** module type (`Vcf`) end-to-end as proof: snapshot → `Vcf` runtime → `VcfPanel` reads snapshot.
4. Refactor `AudioEngine` to dispatch via registry instead of `switch`.
5. Migrate remaining types one per iteration: `Vco`, `Vca`, `Ahdsr`, `Lfo`, `Seq16`, …
6. Mirror the skeleton in `firmware/core/include/mb/runtime/` (headers only at first).

## Consequences
- **Pro:** new module type = one class file + one registry call + one React panel. Module-specific knowledge co-located.
- **Pro:** `EnvelopeGenerator → Ahdsr` and `Oscillator → Vco` express real domain relationships, ready for `Adsr`, `Ad`, sub-octave VCOs, etc., without `switch` growth.
- **Pro:** C++ firmware starts with the same vocabulary; no translation layer.
- **Con:** one-time rename `Module → ModuleSnapshot` ripples through ~15 files (mechanical).
- **Con:** an extra construction step on load (snapshot → runtime); cost is negligible (≤ ms for any realistic patch).
- **Neutral:** save/load/undo/redo/presets unchanged because they operate on snapshots.

## Open questions
- POJO suffix: `ModuleSnapshot` (preferred — matches undo-snapshot semantics) vs `ModuleData`. To be confirmed before step 1 of the migration.
- Whether `Lfo` should subclass `Oscillator` (sharing pitch-CV semantics) or be its own branch under `Source`.
- Whether `Param`/`Signal` wrapper for control values lands in layer 1 (serialised metadata) or only layer 2 (runtime).

## References
- [ADR 0002](0002-editor-stack.md) — editor stack.
- [ADR 0005](0005-patch-storage-format.md) — JSON in editor, CBOR on device. This ADR builds on the snapshot format defined there.
- Tone.js class hierarchy — inspiration for layer-2 naming and lifecycle (`connect` / `dispose` / `triggerAttack` / `triggerRelease`).
