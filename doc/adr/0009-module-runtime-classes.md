# ADR 0009 – Modular domain: four-layer architecture (Definition / Instance / Runtime / View)

## Status
Proposed (2026-05-22)

## Context
The MusicBrain modular editor (`editor/src/modular-mb/`) and the (still empty) `firmware/app-modular-brain/` share a domain — oscillators, filters, envelopes, amplifiers, sequencers, wired together — but currently the editor models it data-first: TypeScript interfaces as POJOs plus a god-class `AudioEngine` with `switch(node.kind)` for every operation. Adding a new module touches 5+ places; module-specific knowledge is scattered; the C++ side will reinvent the same dispatch problem.

We also need to model two kinds of modules from day one:
- **Internal** modules that the brain actually synthesises (project-3 internal voices, plus everything in the web simulator).
- **External** Eurorack-style modules that the brain only routes signals to/from. The brain does not synthesise them; it remembers their patch settings so the user can recreate them on the real hardware. In the simulator, an external module is voiced by a **proxy** internal module (e.g. our generic `Vco` stands in for a "BrandX SolidStateVCO").

Tone.js (the simulator's audio backend) demonstrates a clean OO hierarchy worth borrowing patterns from: `ToneAudioNode` → `Source` / `Effect` / `Instrument` / `Envelope`, each with uniform `input`/`output`, `connect`/`dispose`, and lifecycle events like `triggerAttack(time)`.

This ADR replaces an earlier draft of 0009 that conflated *type schema* and *per-instance values* into a single "Definition" layer; that distinction is now made explicit.

## Decision

A **four-layer architecture** for the modular domain. Each layer owns one concern. Layers 1–2 are pure data (serialisable); layer 3 is OO (live behaviour); layer 4 is rendering (web and on-device).

### Layer 1 — Definition (catalog, schema)
*Which module models exist and what is on them.* Static, no user values.

- `ModuleDefinition` — brand, model, variant, plus the lists `ports[]`, `controls[]`, `displays[]` (LEDs, small screens, numeric displays). Says *what* a module of this type has.
- `RackDefinition`, `PanelLayoutDefinition` and similar describe the schema of containers and visual layouts.
- A `ModuleDefinition` is the **single source of truth** about a module model. The runtime class (layer 3) exposes its own definition via a `static readonly definition: ModuleDefinition` so code and catalog cannot drift.
- Definitions are loaded from JSON catalogs (built-in and user/third-party), keyed by `typeId` (e.g. `tp_mmb_vco`, `brandx_solidstate_vco_mk2`).
- **For external modules**, the definition additionally carries the simulator hint:
  - `simulatedBy: 'tp_mmb_vco'` — which internal type voices it in the simulator (optional; absent = silent in simulation).
  - `simulationControlMap?: Record<string, string>` — overrides for control-id mapping where names diverge (e.g. `{ "freq": "tuning", "reso": "resonance" }`). Default is mapping by identical control id.

### Layer 2 — Instance (patch contents)
*What is in this specific patch.* The serialised, diffable, undo/redo'able state.

- `ModuleInstance` — `{ id, typeId, name, position, controlValues, portState }`. Refers to a `ModuleDefinition` by `typeId`. **Holds the user's knob positions, switch settings and other persisted values.**
- `Connection` — one cable: `{ fromInstanceId, fromPortId, toInstanceId, toPortId }`.
- `Patch` — `{ id, name, voiceCount, rackIds, moduleInstances, connections, … }`. A patch is the combination of module instances and connections, plus per-patch settings.
- `ModularProject` — top-level container: catalog refs + patches + presets.
- Control values are **polymorphic**: `number | boolean | string | number[]` (covers knobs, switches, mode selects, sequencer steps). The shape is documented per control in the layer-1 definition.
- This is the layer that maps to ADR 0005 storage (JSON in editor, CBOR on device) and to the undo/redo snapshot store.

### Layer 3 — Runtime (live OO instances)
*Code that actually does something with a `ModuleInstance`.* Classes, not data. Not serialised.

- **In firmware (Teensy)**: each internal module type is a C++ class that processes audio/CV every frame. `Module` (abstract) → `InternalModule` (abstract) → `Oscillator` → `Vco`, and so on.
- **In the web simulator**: the same class hierarchy in TypeScript, wrapping Tone.js nodes by composition. Used for MIDI input + patch + modules → sound.
- **External modules have no runtime in firmware** — the brain routes signals to them but does not own a class instance that "is" the module. They may have a thin "routing handle" object, but no audio code.
- **External modules in the simulator** are voiced by a **proxy runtime**: the simulator looks up `definition.simulatedBy`, instantiates that internal class, and uses `simulationControlMap` to translate control writes.

Hierarchy (identical names in TS and C++):

```
Module (abstract)               ← inputs[], outputs[], controls[], connect, dispose
 ├─ InternalModule (abstract)    ← owns audio/CV processing
 │   ├─ Source (abstract)         ← start(time), stop(time)
 │   │   ├─ Oscillator → Vco
 │   │   ├─ Lfo
 │   │   └─ Noise
 │   ├─ Filter (abstract)         ← audioIn, audioOut, cutoffCvIn
 │   │   ├─ Vcf
 │   │   └─ Svf
 │   ├─ Amplifier → Vca
 │   ├─ EnvelopeGenerator         ← triggerAttack(time), triggerRelease(time)
 │   │   ├─ Adsr
 │   │   └─ Ahdsr
 │   └─ Sequencer → Seq16
 └─ ExternalModule                ← one class, data-driven variants from definition
```

Conventions:
- Class names describe **what the thing is** (`Vco`, `Ahdsr`). No `Runtime` / `Engine` suffix.
- Each abstract level declares the minimum surface its level guarantees; subclasses add ports/controls. Example: `Oscillator` guarantees `pitchCvIn`, `audioOut`, a `tuning` control. `Vco` adds waveform / PWM / sync.
- Lifecycle and event vocabulary follow Tone.js where applicable: `connect`, `disconnect`, `dispose`, `triggerAttack(time)`, `triggerRelease(time)`.
- Control values that can be modulated are wrapped at runtime in a typed `Param<T>` / `Signal<number>` / `Switch<T>` layer. The runtime value = persisted setpoint (from `ModuleInstance`) ± live modulation. The setpoint stays in layer 2; the effective value lives only here.
- A runtime instance is built by:
  ```ts
  const cls = registry.get(instance.typeId);       // layer 3 class
  const def = catalog.get(instance.typeId);        // layer 1 definition
  const m   = new cls(def, instance);              // layer 3 instance
  ```
- `AudioEngine` becomes a thin dispatcher around the registry. No more `switch(kind)`.
- The runtime class is the **single source of truth for its definition** (`static readonly definition`); the catalog file is generated from / aligned with the class.

### Layer 4 — View (rendering, on web and on device)
*How a module is shown to a human.* Stateless renderers reading from layer 2 (and optionally layer 3 for live meters).

- **In the web editor**: React functional components. A module *may have multiple panels* (compact, full, mobile); only one is shown at a time. Naming: `VcoFullPanel`, `VcoCompactPanel`, etc. Composition over inheritance: `VcoFullPanel` calls `<OscillatorPanel … />` and adds the VCO-specific extras.
- **On the Teensy**: a small C++ view layer renders module status on the on-board display (e.g. OLED). Same role, simpler implementation. Naming: `VcoOledView`, `PatchStatusView`, etc.
- Layout: `editor/src/modular-mb/view/` and `firmware/core/include/mb/view/`. Different implementations, same role.
- The view never reaches into layer 3 to mutate; edits go through the layer-2 store, which the runtime observes.

### Cross-cutting rules
- **Registry per platform**: TS has a runtime-class registry keyed by `typeId`; C++ does the same with a factory table.
- **Persistence stays snapshot-based** on layer 2 (ADR 0005). Save / load / undo / redo / presets are unaffected.
- **TS ↔ C++ symmetry by convention** in the first iteration: same class names, same `typeId`s, same control IDs, same method signatures. If drift becomes a problem we add a shared JSON schema and generate stubs (deferred to a future ADR).

## Migration plan (informative)
1. Rename the current `interface Module` in `editor/src/modular-mb/types.ts` to `ModuleInstance`. Update call sites mechanically.
2. Introduce `editor/src/modular-mb/runtime/` with `Module` (abstract), `InternalModule`, `ExternalModule`, and `Registry`. Add `editor/src/modular-mb/view/` and move existing panel code there.
3. Migrate **one** internal module type end-to-end as proof: `Vcf` (definition → instance → runtime → panel). Verify save/load/undo unchanged.
4. Refactor `AudioEngine` to dispatch via registry.
5. Migrate remaining internal types: `Vco`, `Vca`, `Ahdsr`, `Lfo`, `Seq16`, …
6. Introduce `ExternalModule` + first external-module catalog entry + simulator proxy mapping.
7. Mirror the skeleton in `firmware/core/include/mb/runtime/` (headers first), and add `firmware/core/include/mb/view/`.

## Consequences
- **Pro**: new internal module type = one class file + one registry call + one or more panels. New external module = one catalog entry, no code.
- **Pro**: `EnvelopeGenerator → Ahdsr` and `Oscillator → Vco` are real domain relations, ready for `Ad`, `Adsr`, sub-octave VCOs, etc., without `switch` growth.
- **Pro**: C++ firmware starts with the same vocabulary; the brain treats external Eurorack modules first-class without polluting the internal class tree.
- **Pro**: View is decoupled from model: multiple panels per module on web, OLED views on device, same data underneath.
- **Con**: one-time rename `Module → ModuleInstance` ripples through ~15 files (mechanical).
- **Con**: an extra construction step on load (definition + instance → runtime); negligible cost.
- **Neutral**: save/load/undo/redo/presets unchanged because they operate on layer 2.

## Open questions
- Whether `Lfo` should subclass `Oscillator` (sharing pitch-CV semantics) or be its own branch under `Source`.
- Whether `Param`/`Signal`/`Switch` wrappers belong in a shared TS/C++ control library or are platform-local.
- Whether the runtime class's `static readonly definition` should be the source from which catalog JSON is generated, or whether the JSON is hand-written and the class asserts equality at boot.

## References
- [ADR 0002](0002-editor-stack.md) — editor stack.
- [ADR 0005](0005-patch-storage-format.md) — JSON in editor, CBOR on device. Layer 2 maps to this format.
- Tone.js class hierarchy — inspiration for layer-3 naming and lifecycle (`connect` / `dispose` / `triggerAttack` / `triggerRelease`).
