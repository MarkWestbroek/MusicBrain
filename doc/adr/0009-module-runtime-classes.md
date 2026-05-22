# ADR 0009 – Modular domain: four-layer architecture (Definition / Instance / Runtime / View)

## Status
Accepted (2026-05-22)

## Context
The MusicBrain modular editor (`editor/src/modular-mb/`) and the (still empty) `firmware/app-modular-brain/` share a domain — oscillators, filters, envelopes, amplifiers, sequencers, wired together — but currently the editor models it data-first: TypeScript interfaces as POJOs plus a god-class `AudioEngine` with `switch(node.kind)` for every operation. Adding a new module touches 5+ places; module-specific knowledge is scattered; the C++ side will reinvent the same dispatch problem.

We also need to model two kinds of modules from day one:
- **Internal** modules that the brain actually synthesises (project-3 internal voices, plus everything in the web simulator).
- **External** Eurorack-style modules that the brain only routes signals to/from. The brain does not synthesise them; it remembers their patch settings so the user can recreate them on the real hardware. In the simulator, an external module is voiced by a **proxy** internal module (e.g. our generic `Vco` stands in for a "BrandX SolidStateVCO").

Tone.js (the simulator's audio backend) demonstrates a clean OO hierarchy worth borrowing from: `ToneAudioNode` → `Source` / `Effect` / `Instrument` / `Envelope`, with uniform `input`/`output`, `connect`/`dispose`. We also studied two embedded references:

- **Mutable Instruments / Yarns** (`voice.h`): `Voice` contains `Oscillator` by composition. `Refresh()` runs at a low-rate control tick (~1 kHz); `RenderAudio()` runs at audio rate. `NoteOn(note, velocity, portamento, trigger)` is called from a MIDI ISR or main loop.
- **Teensy Audio library** (`AudioStream.h`): every node is a `AudioStream` subclass that implements `virtual void update()`. A software ISR fires at 44100/128 ≈ 344 Hz, iterates a linked list of all nodes, and calls each `update()` in turn. Nodes exchange fixed-size sample blocks (128 × int16_t). Cross-boundary writes (main loop → ISR) are guarded by `__disable_irq()` / `__enable_irq()`.

Key insight from comparing them: **CV and audio are different worlds.** Envelopes, LFOs, sequencers, and CV-routers only need ~1–2 kHz update rates. Digital audio synthesis needs 44 kHz sample-accurate processing and its own DMA/I2S pipeline. Mixing both on the same update path adds complexity for no benefit.

This ADR replaces an earlier draft of 0009 that conflated *type schema* and *per-instance values* into a single "Definition" layer, and did not distinguish CV from audio modules; both distinctions are now explicit.

**System diagrams:**
See [SysML Overview](../SysML/sysML-overview.png) for the high-level hardware/signal-flow architecture and user-facing control inputs.
See [SysML Details](../SysML/SysML-more-details.png) for firmware-level routing, module composition, and the internal vs. external rack split.

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

**Internal modules** split into two update families:

| Family | Class | Update mechanism | Rate | Examples |
|---|---|---|---|---|
| **CvModule** | `CvModule (abstract)` | Timer ISR → `tick()` | 1–2 kHz | Envelope, Lfo, Sequencer, CvMapper |
| **AudioModule** | `AudioModule (abstract)` | DMA/I2S ISR → `update()` | 44100/128 ≈ 344 Hz | Vco, Vcf, Vca (digital audio) |

`CvModule.tick()` follows the Mutable Instruments pattern (`Voice::Refresh`): runs in a timer ISR, computes the next CV/gate values, and writes them to DAC channels via the breakout bus. This is the primary update path on the main brain Teensy.

`AudioModule.update()` follows the Teensy Audio pattern (`AudioStream::update`): fires at block rate, processes 128 samples per call, passes buffers between nodes via connections. This path only exists on a **dedicated audio Teensy** (see architecture note below).

Hierarchy (identical names in TS and C++):

```
Module (abstract)                ← ports[], controls[], setControl(id, val), dispose()
 ├─ CvModule (abstract)          ← tick(); runs at 1–2 kHz on main-brain Teensy
 │   ├─ EnvelopeGenerator (abs)  ← gateIn port; setGate(bool)
 │   │   ├─ Adsr
 │   │   └─ Ahdsr
 │   ├─ Lfo
 │   ├─ Sequencer → Seq16
 │   ├─ CvMapper
 │   ├─ CvBreakout               ← writes CV/gate to bus → external rack
 │   │   ├─ CvOut12              ← 12-bit CV output (0–5 V, 0–10 V, ±5 V, etc.; range in def)
 │   │   ├─ CvOut16              ← 16-bit pitch CV output (1 V/oct)
 │   │   └─ GateOut              ← digital gate/trigger output
 │   ├─ CvBreakIn                ← reads CV/gate from bus ← external rack
 │   │   ├─ CvIn12               ← 12-bit CV input from external rack
 │   │   ├─ CvIn16               ← 16-bit CV input from external rack
 │   │   └─ GateIn               ← gate/trigger input from external rack
 │   └─ ControllerBreakIn        ← human-interface bridge; maps physical controls → CV values
 ├─ AudioModule (abstract)       ← update(); runs at ~344 Hz on audio Teensy / simulator
 │   ├─ Oscillator (abs)         ← pitchCvIn, audioOut, tuning; setNote(semitones)
 │   │   └─ Vco
 │   ├─ Filter (abs)             ← audioIn, audioOut, cutoffCvIn
 │   │   ├─ Vcf
 │   │   └─ Svf
 │   └─ Amplifier → Vca         ← audioIn, audioOut, gainCvIn (CV 0–100 % / 0–4095)
 └─ ExternalModule               ← one class, data-driven; routing handle only, no audio/CV code
```

See [module hierarchy diagram](../uml/module-hierarchy-v1.png) for a visual representation of this structure.

**Breakout modules bridge brain and external rack.** Three symmetrical breakout classes complete the boundary:

- `CvBreakout` — an internal module that writes CV/gate values to the SPI/CAN-FD bus. An `EnvelopeGenerator` or `Sequencer` connects its output port to a `CvBreakout`; the breakout owns the bus write. The physical board appears twice in a patch: as a `CvBreakout` node in the *internal rack* (brain side) and as a panel connector in the *external rack* (Eurorack side). This dual appearance is intentional and reflects the actual signal path. Display breakouts (boards that show values on a small screen or LED bar rather than driving a DAC) follow the same pattern.
- `CvBreakIn` — the reverse path: reads CV/gate values arriving from the external rack over the bus and makes them available as input ports to internal `CvModule` instances (e.g. an incoming pitch CV from an external sequencer). Same dual-appearance principle: one node in each rack.
- `ControllerBreakIn` — a special break-in whose source is not the bus but physical human-interface hardware on the brain's own panel or a connected controller board: potentiometers, encoders, buttons, touchscreen zones. In the original SysML diagrams this was labelled "pots control panel". From the perspective of an `EnvelopeGenerator` or `Vco`, its output looks identical to any other CV input — only the source differs. `ControllerBreakIn` is also the primary mechanism for feeding real-time control inputs to the audio Teensy: the brain forwards the values over the bus at the normal CV tick rate.

**Internal bus: music-time signals and management messages.** The SPI/CAN-FD bus carries two distinct traffic classes, analogous to the split between real-time MIDI and SysEx:

1. **Music-time signals** — the primary traffic: CV values (12-bit, 16-bit), gate signals (1-bit), trigger pulses. Produced and consumed at the CvModule tick rate (~1–2 kHz). Time-sensitive; must not be delayed.
2. **Management messages** — non-time-sensitive configuration, firmware, and status traffic that runs alongside music-time traffic:
   - *Configuration* — e.g. setting the voltage range on a `CvOut12` breakout, or writing calibration data. Sent once at boot or when the user changes a setting in the web UI.
   - *Firmware updates* — breakout boards that contain their own microcontroller (MCU) can receive firmware updates over the bus, eliminating the need to physically connect each board to a programmer. The brain acts as the flashing host.
   - *Status / telemetry* — a breakout can report its firmware version, hardware revision, or fault state back to the brain for display in the web UI.

This management layer is "bus overhead" by design and does not interfere with music-time traffic. The exact framing protocol (dedicated message-type bits, time-slot reservation, or a separate management register) is deferred to ADR 0006 or a follow-up.

**Signal vocabulary — gate and CV, not MIDI:**
The brain speaks in signals, not MIDI messages. When a note starts:
- `env.setGate(true)` — the envelope receives a high gate; it decides what to do with it (start attack).
- `vco.setNote(semitones)` — the oscillator receives a pitch value.
- `vca.setCV(value)` — the amplifier receives a continuous CV amplitude (0–100 % in simulator; 0–4095 for a 12-bit breakout). A VCA has no gate; it is always active and simply passes audio scaled by the CV level. Zero CV = silence.

The MIDI layer (voice allocator) maps `noteOn(note, velocity)` to these calls. Module classes themselves have no knowledge of MIDI.

The `setGate(bool)` convention replaces the earlier `triggerAttack` / `triggerRelease` names, which leaked internal envelope knowledge to the caller. A gate is what the outside world sends; what the module does with it (attack, decay, …) is the module's own concern.

**CV value representation differs by context:**
- *Simulator (TS):* float in a normalised range (e.g. 0.0–1.0 for gain, –1.0–+1.0 for bipolar CV). Easy to feed directly to Tone.js params.
- *Firmware / breakout:* integer matching DAC resolution (12-bit: 0–4095; 16-bit: 0–65535). Voltage range (0–5 V, ±5 V, 0–10 V, 0–12 V, …) is a parameter of the `CvBreakout` definition, not of the module sending the signal. The breakout scales the integer to the correct voltage.

**In firmware (Teensy — main brain):**
- Only `CvModule` subclasses run here. Timer ISR calls `tick()` on each registered module in order.
- `ExternalModule` has no `tick()` — it is represented only as routing metadata and DAC-write targets.
- Cross-boundary writes (MIDI ISR / main loop → timer ISR state) guarded by `__disable_irq()` / `__enable_irq()` (same pattern as Teensy Audio `noteOn`).

**In firmware (audio Teensy — optional, possibly panel-less):**
- Only `AudioModule` subclasses run here. DMA/I2S ISR drives `update()`.
- Receives CV/gate values from the main brain over the internal bus (same mechanism as any external Eurorack breakout receiving CV).
- Does not require a physical panel slot; it can be a bare board inside the case with no HP allocation. Configuration and patch recall happen entirely through the web UI.
- Control inputs (filter cutoff, gain, oscillator pitch, …) arrive as CV values from `ControllerBreakIn` modules, forwarded over the bus at the standard tick rate.
- Audio output goes via a dedicated **audio breakout module** (a small companion board in the rack that holds the DAC/codec and audio jack sockets).
- If digital audio is not needed in a build, this module simply does not exist.

**In the web simulator:**
- `CvModule` subclasses run in a `setInterval`-driven tick.
- `AudioModule` subclasses wrap Tone.js nodes by composition. `Vco` holds a `Tone.Oscillator`; `Vcf` holds a `Tone.Filter`; etc. `setNote()` maps to `this.osc.frequency.value`; `setGate(true)` maps to envelope/source start.
- External modules are voiced by a proxy: simulator looks up `definition.simulatedBy`, creates that `AudioModule`, applies `simulationControlMap`.

**Construction:**
```ts
const cls = registry.get(instance.typeId);   // layer-3 class
const def  = catalog.get(instance.typeId);   // layer-1 definition
const m    = new cls(def, instance);          // layer-3 instance
```
`AudioEngine` becomes a thin dispatcher around the registry. No more `switch(kind)`.

The runtime class is the **single source of truth for its own definition** (`static readonly definition`); the catalog is generated from or validated against it.

### Layer 4 — View (rendering, on web and on device)
*How a module is shown to a human.* Stateless renderers reading from layer 2 (and optionally layer 3 for live meters).

- **In the web editor**: React functional components. A module *may have multiple panels* (compact, full, mobile); only one is shown at a time. Naming: `VcoFullPanel`, `VcoCompactPanel`, etc. Composition over inheritance: `VcoFullPanel` calls `<OscillatorPanel … />` and adds the VCO-specific extras.
- **On the Teensy**: a small C++ view layer renders module status on the on-board display (e.g. OLED). Same role, simpler implementation. Naming: `VcoOledView`, `PatchStatusView`, etc.
- Layout: `editor/src/modular-mb/view/` and `firmware/core/include/mb/view/`. Different implementations, same role.
- The view never reaches into layer 3 to mutate; edits go through the layer-2 store, which the runtime observes.

### Cross-cutting rules
- **Registry per platform**: TS has a runtime-class registry keyed by `typeId`; C++ does the same with a factory table. Virtual dispatch (C++ vtable / TS dynamic method lookup) eliminates `switch(kind)` at call sites.
- **Persistence stays snapshot-based** on layer 2 (ADR 0005). Save / load / undo / redo / presets are unaffected.
- **TS ↔ C++ symmetry by convention** in the first iteration: same class names, same `typeId`s, same control IDs, same method signatures. If drift becomes a problem we add a shared JSON schema and generate stubs (deferred to a future ADR).
- **CV bus ≠ audio bus**: the internal SPI/CAN-FD breakout bus carries CV/gate values (12-bit, 16-bit, 1-bit) at 1–2 kHz. Audio (if present) is on a separate I2S path on the audio Teensy. Module code never mixes these paths.

### Architecture note — audio Teensy
Digital audio synthesis is architecturally separate from CV processing. If the project needs internal audio voices, the preferred approach is a **dedicated audio Teensy** (Teensy 4.x) that:
- is **not necessarily panel-mounted** — it can live as a bare board inside the enclosure with no HP allocation in the rack;
- is configured entirely through the web UI, exactly like the rest of the system — no physical controls required on the board itself;
- subscribes to CV/gate values from the main brain over the internal SPI/CAN-FD bus (identical to how an external Eurorack VCO receives CV from a `CvBreakout`);
- receives real-time control inputs (filter cutoff, oscillator pitch, gain, …) as CV values forwarded from `ControllerBreakIn` modules over the bus;
- runs `AudioModule` classes locally using the Teensy Audio ISR model;
- outputs audio via I2S to an **audio breakout module** — a small companion board (probably 4–6 HP) in the rack that holds the DAC/codec and audio jack sockets.

The main brain Teensy has no audio code. This keeps both processors within their performance envelope and maintains clean firmware responsibility boundaries. Whether to implement the audio engine is deferred; the class hierarchy already supports it via the `AudioModule` branch.

## Migration plan (informative)
1. ✅ Rename the current `interface Module` in `editor/src/modular-mb/types.ts` to `ModuleInstance`. Update call sites mechanically. *(done — 33 edits, 7 files)*
2. ✅ Introduce `editor/src/modular-mb/runtime/` with `Module` (abstract), `CvModule` (abstract), `AudioModule` (abstract), `ExternalModule` (concrete) and a `Registry`. Add `editor/src/modular-mb/view/` and move existing panel code there. *(done — runtime scaffold; view/ move deferred until after step 5)*
3. ✅ Migrate **one** internal module type end-to-end as proof: `Vcf` (definition → instance → runtime → panel). Verify save/load/undo unchanged. *(done — `runtime/audio/Vcf.ts` wraps `Tone.Filter` via composition, self-registers)*
4. ✅ Refactor `AudioEngine` to dispatch via registry. *(done — Vco/Vcf/Vca/Ahdsr/Lfo all constructed via `registry.create()`; runtime owns Tone-node lifecycle + setControl. Sequencer/MIDI-In/Noise/Echo/Phaser/Out remain in the legacy `switch` because they have no Tone-primitive ownership to extract — their logic is engine-orchestration.)*
5. **Partially done** — internal types migrated to runtime classes:
   - ✅ `Vcf` → `runtime/audio/Vcf.ts` (extends `AudioModule`)
   - ✅ `Vco` → `runtime/audio/Vco.ts` (extends `AudioModule`)
   - ✅ `Vca` → `runtime/audio/Vca.ts` (extends `AudioModule`)
   - ✅ `Ahdsr` → `runtime/cv/Ahdsr.ts` (extends `CvModule`, `tick()` no-op in simulator — Tone.Envelope self-schedules)
   - ✅ `Lfo` → `runtime/cv/Lfo.ts` (extends `CvModule`, same pattern)
   - ⏳ `Seq16` deferred — has no Tone primitive to own; its entire behaviour is engine-orchestrated (intervalId, run/voct meters, MIDI overrides). Needs a richer abstract `Sequencer` interface before migration is meaningful.
6. ✅ Introduce `ExternalModule` + first external-module catalog entry + simulator proxy mapping. *(done — `ModuleType` carries optional `simulatedBy` + `simulationControlMap`; `AudioEngine` resolves the proxy type before constructing a node and remaps controls; `registry.create()` now keys on `type.id`. First catalog entry wired: Analogue Systems RS-110 MkII (`tp_as_rs110`) simulates as `tp_mmb_vcf` with `freq → cutoff`, `res → q`. Port-id mapping for richer externals — e.g. picking `lp`/`bp`/`hp`/`notch` outputs — is deferred until a real external module needs it.)*
7. ✅ Mirror the skeleton in `firmware/core/include/mb/runtime/` (headers first), and add `firmware/core/include/mb/view/`. *(done — `Module.h`, `CvModule.h`, `AudioModule.h`, `ExternalModule.h`, `Registry.h` under `mb::runtime`; `IView.h` under `mb::view`. Headers only; concrete subclasses will land per-module as the firmware grows. C++17 (matches existing `cxx_std_17`); no CMakeLists changes needed because the additions are header-only.)*

## Consequences
- **Pro**: new CV module type = one class file + one `tick()` implementation + one registry call. New audio module = same but with `update()`. New external module = one catalog entry, no code.
- **Pro**: `EnvelopeGenerator → Ahdsr` and `Oscillator → Vco` are real domain relations, ready for `Ad`, `Adsr`, sub-octave VCOs, etc., without `switch` growth.
- **Pro**: `setGate(bool)` / `setNote(int)` at the module boundary; MIDI knowledge stays in the voice allocator. Modules are signal-domain citizens, not MIDI citizens.
- **Pro**: CvModule / AudioModule split means the main brain Teensy never runs audio code; the audio Teensy never runs CV-routing code. Clean responsibility boundary.
- **Pro**: C++ and TS share vocabulary; same class names and method signatures across languages.
- **Pro**: View decoupled from model: multiple panels per module on web, OLED views on device.
- **Con**: one-time rename `Module → ModuleInstance` ripples through ~15 files (mechanical, type-safe).
- **Con**: extra construction step on load (definition + instance → runtime); negligible cost.
- **Neutral**: save/load/undo/redo/presets unchanged; they operate on layer 2.

## Open questions

**✅ Resolved:**
- **LFO placement** — `Lfo` is a direct sibling of `EnvelopeGenerator` under `CvModule`, confirmed. It produces CV, not audio; no audio-rate processing required.
- **Audio Teensy bus channel** — the existing SPI/CAN-FD bus is sufficient; CV traffic at 1–2 kHz is low bandwidth. The audio Teensy may not even be rack-mounted (see architecture note).

**Still open:**

- **`Param`/`Signal`/`Switch` control-value wrappers** — The layer-2 `controlValues` record currently uses the untyped union `number | boolean | string | number[]`. A typed-wrapper approach would introduce `Param` (continuous numeric with unit + range), `Switch` (discrete/enum), and `Signal` (CV port reference) as first-class value types, making mismatches a compile-time error rather than a runtime surprise.
  - *Option A — platform-local:* TypeScript defines its own wrapper types; C++ defines parallel structs independently. No build step; simpler to start. Risk: the two sides can drift silently as both codebases evolve independently.
  - *Option B — shared schema (IDL / JSON Schema):* a single schema defines the types; stubs are generated for both TS and C++. Build-time guarantee of no drift. Requires a code-generation pipeline and additional tooling overhead.
  - Defer until the first firmware round-trip test reveals whether drift is a practical problem.

- **Catalog source of truth** — The layer-1 `ModuleDefinition` must be consistent between the JSON catalog loaded at runtime and the `static readonly definition` on each runtime class.
  - *Option A — class is source:* a build step iterates all registered runtime classes, reads their `static readonly definition`, and writes the JSON catalog. Catalog always matches the code; adding a module means only adding a class file. Requires a code-generation step.
  - *Option B — JSON is source, class asserts:* humans write the catalog JSON; at boot each runtime class reads the catalog entry and asserts that its declared ports and controls match. Mismatch = loud startup error, never silently wrong. No build step needed.
  - *Option C — JSON only, no assertion:* simplest; most fragile.
  - Leaning towards **Option B** as the pragmatic middle ground: human-authored JSON keeps the catalog readable without tooling; the boot-time assertion prevents silent drift.

## References
- [ADR 0002](0002-editor-stack.md) — editor stack.
- [ADR 0005](0005-patch-storage-format.md) — JSON in editor, CBOR on device. Layer 2 maps to this format.
- [ADR 0006](0006-multi-case-transport.md) — SPI/CAN-FD internal bus that carries CV/gate between brain and breakouts.
- [ADR 0008](0008-latency-and-interpolation.md) — latency budget and breakout-side interpolation; relevant for CV update rate choice.
- [SysML Overview](../SysML/sysML-overview.png) — system-level block diagram showing user-facing controls, internal brain, external modules, and signal types.
- [SysML Details](../SysML/SysML-more-details.png) — firmware-level detail view with internal vs. external racks, module hierarchies, and bus routing.
- Mutable Instruments / Yarns `voice.h` — inspiration for `CvModule` composition pattern and two-rate update (control tick + audio ISR).
- Teensy Audio library `AudioStream.h` / `effect_envelope.cpp` — inspiration for `AudioModule.update()` block-processing pattern, ISR scheduling, and IRQ-guard pattern for cross-boundary writes.
