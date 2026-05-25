# Polyphony — Rack & Patcher UI sketches + data-model additions

Companion to [`global to multiple and back thoughts 01.md`](../global%20to%20multiple%20and%20back%20thoughts%2001.md) and [ADR 0010](../adr/0010-midi-in-and-polyphony.md). Started 2026-05-25.

This file proposes screen layouts for the **rack panel** (where groups are defined) and the **patcher** (where the user actually wires the poly cables), plus the data-structure additions needed to back them. ASCII sketches are intentional — they map cleanly to the existing `RackPanel.tsx` / `PatcherGraphPanel.tsx` and can be ported to real React/SVG once we agree on shape.

> **Vocabulary** (from `thoughts 01.md`, slightly tightened):
> - **dCV / aCV** — digital CV (inside the brain) vs analog CV (across the bus, in the rack).
> - **multi-module** — a single physical module that internally repeats one function N times (dual osc, quad VCA, 8× CV breakout).
> - **cell group** — within a multi-module, the set of ports + controls that belong to ONE instance of the repeated function (the rest are "global to the module").
> - **poly group** — a rack-level set of N cells (each cell = a whole module OR one cell-group instance inside a multi-module) that are flagged as "the N voices".
> - **voice-poly port** — an output (or input) that carries N parallel signals, one per voice.
> - **global port** — an output (or input) that carries one signal, applied to all voices.

---

## 1. RACK layer — group-definition UI

### 1.1 Normal rack view (today)

```
┌─ Rack: Studio Cabinet ──────────────────────────────────── [+ Module] [Mode▾] ─┐
│                                                                                │
│  Row 1  ┌──────┐┌──────┐┌──────────┐┌──────────┐┌──────┐┌──────┐               │
│         │ MIDI ││ DualOsc││ QuadVCO  ││ QuadVCA  ││ ENV ││ LFO  │               │
│         │  IN  ││        ││          ││          ││ AHDSR││      │               │
│         └──────┘└──────┘└──────────┘└──────────┘└──────┘└──────┘               │
│                                                                                │
│  Row 2  ┌──────────────┐┌──────────┐┌────────────┐                              │
│         │ 8× CV-Out 12 ││ 4× CV-16 ││ 8-ch Mixer │                              │
│         │  (breakout)  ││  (pitch) ││            │                              │
│         └──────────────┘└──────────┘└────────────┘                              │
│                                                                                │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Group-definition mode  ("Mode ▾ → Poly grouping")

Switching the rack panel into **grouping mode** dims the canvas and overlays a small toolbar. Every module / cell becomes click-targetable.

```
┌─ Rack: Studio Cabinet ─── [Mode ▾ Poly grouping] ──── [Group: Voice (N=4) ▾] ─┐
│  Click cells to add → master first, then 2..N in order. ESC to leave.         │
│                                                                                │
│  Row 1  ┌──────┐┌──────┐┌──────────┐┌──────────┐┌──────┐┌──────┐               │
│         │ MIDI ││ DualOsc││ QuadVCO ┃│ QuadVCA  ││ ENV  ││ LFO  │               │
│         │  IN  ││ ┃M┃ 2 ││ ┃M┃ 2 3 4││ ┃M┃ 2 3 4││ (G)  ││ (G)  │               │
│         └──────┘└──────┘└──────────┘└──────────┘└──────┘└──────┘               │
│                                                                                │
│  Row 2  ┌──────────────┐┌──────────┐┌────────────┐                              │
│         │ 8× CV-Out 12 ││ 4× CV-16 ││ 8-ch Mixer │                              │
│         │ ┃M┃2 3 4 . . ││ ┃M┃2 3 4 ││ ┃IN-poly┃  │                              │
│         └──────────────┘└──────────┘└────────────┘                              │
└────────────────────────────────────────────────────────────────────────────────┘

Legend:  ┃M┃ = master cell (bold border, voice index 1)
         2..N = follower cells (greyed, numbered)
         (G)  = explicitly global module (will not be replicated)
         ┃IN-poly┃ = a single port flagged as "accepts a poly bundle"
```

Interaction:
1. User picks **N** for the active group (`Voice (N=4)`) — N is a rack-level property of the group, **not** a per-module thing.
2. User clicks a cell. First click ⇒ master. Each subsequent click ⇒ index `2..N`. Re-clicking the master clears the whole group; re-clicking a follower removes just that follower.
3. The cell must be **compatible** with the master — same `ModuleType.id` for whole-module members, same `(typeId, cellGroupId)` for multi-module members. Incompatible cells get a red outline + tooltip "type mismatch".
4. **Multi-module zoom**: hovering a multi-module enlarges it so its internal cells become individually clickable (the QuadVCO shows 4 numbered sub-panels, the 8× CV breakout shows 8 dCV/aCV pairs).
5. Multiple groups in one rack are allowed and colour-coded: `Voice (blue)`, `Drum sub-pool (orange)`, etc.

### 1.3 Multi-module zoom example — `QuadVCO`

```
┌─ QuadVCO ───── (cell groups: 4× "osc") ─── [Click cells: ┃M┃ → 2 → 3 → 4] ─┐
│ Global controls:   ┌─[ SYNC ]─┐  ┌─[ XMOD ]─┐                              │
│                                                                             │
│  ┌── cell 1 (M) ──┐ ┌── cell 2 ──┐ ┌── cell 3 ──┐ ┌── cell 4 ──┐           │
│  │  ┃M┃           │ │     2      │ │     3      │ │     4      │           │
│  │ ◉ FREQ         │ │ ◉ FREQ     │ │ ◉ FREQ     │ │ ◉ FREQ     │           │
│  │ ◉ WAVE         │ │ ◉ WAVE     │ │ ◉ WAVE     │ │ ◉ WAVE     │           │
│  │ ⬢ v/oct in     │ │ ⬢ v/oct in │ │ ⬢ v/oct in │ │ ⬢ v/oct in │           │
│  │ ⬡ audio out    │ │ ⬡ audio out│ │ ⬡ audio out│ │ ⬡ audio out│           │
│  └───────────────┘ └────────────┘ └────────────┘ └────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
```

The same UI works for a `DualVCO` with `count=2`, or an 8-channel CV breakout where each cell is `{dCV-slot, aCV-jack}`.

### 1.4 Mix-back / fan-in side

An 8-channel mixer has 8 inputs. The user marks **one** input as "poly input (N=4)"; the rack records that this single port accepts a 4-voice bundle. The other 4 inputs (5..8) stay as regular mono inputs (e.g. for the external return + a global reverb send).

```
┌─ Mixer 8-ch ─────────────────────────────────────────────┐
│   ┃ poly IN ┃   in 2     in 3     in 4     in 5    in 6  │
│   ⬢⬢⬢⬢ (×4) ⬡        ⬡        ⬡        ⬡       ⬡     │
│   vol1 vol2 vol3 vol4 vol5     vol6     vol7    vol8     │
│   pan1 pan2 pan3 pan4 pan5     pan6     pan7    pan8     │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│   ⬡ L out                              ⬡ R out           │
└──────────────────────────────────────────────────────────┘
```

Note the **asymmetry**: a *poly* input occupies the visual footprint of N jacks (mini-stack of 4 sockets) but counts as a single connection in the patcher. The volume / pan controls behind it are still per-channel (the user wants to control voice 3 a bit louder), but they live on the mixer panel as before.

---

## 2. PATCH layer — patcher with poly cables

The patcher only ever lets the user draw cables to / from **master cells** and explicitly-marked **poly ports**. Followers are hidden in the patcher (they live in the rack-grouping view, not here). This keeps the cable count manageable.

### 2.1 Cable styling

```
   ─── thin solid line ───      global → global cable (today)
   ═══ double / thick line ═══  voice-poly cable (1 cable, N voices under water)
   ─┬─ split tee on global side a global signal duplicated into a voice-poly target
```

Examples:

```
  MIDI-IN            QuadVCO (master)         QuadVCA (master)        Mixer
  ┌──────┐            ┌──────────┐              ┌──────────┐          ┌──────┐
  │      │ pitch ═════╪═> v/oct  │     audio    │          │  audio   │poly  │
  │      │ (×4 voice) │     out ═╪══════════════╪═> in     │  out ════╪═> in │
  │      │            │          │              │          │          │      │
  │      │ mod ──┬────╪──> pwm   │              │          │          │      │
  │      │ (glb) │    └──────────┘              └──────────┘          │L out │
  │      │       └──────────────── (also duplicated to all 4 VCAs)    │R out │
  └──────┘                                                            └──────┘
```

Three cable types visible here:
1. `═══` voice-poly: MIDI-IN voice-pitch → master VCO v/oct, expanded to (`voice_i.pitch` → `vco_i.voct`) for i=1..4.
2. `─┬─` global duplicated: MIDI-IN mod wheel → master VCO pwm, broadcast to all 4 VCOs' pwm.
3. `═══` voice-poly carried through the chain: VCO master audio out → VCA master audio in → mixer poly input. No re-expansion — once a signal is voice-poly it stays voice-indexed end-to-end until it hits a fan-in port (the mixer's poly input).

### 2.2 Inspector pane on a poly cable

Clicking a `═══` cable shows:

```
┌─ Cable: VCO (master) audio out → VCA (master) audio in ────────────┐
│   Carries: 4 voices (group "Voice", N=4)                            │
│   Mapping: 1↔1   (vco_1 → vca_1, vco_2 → vca_2, …)                  │
│   [▢ override mapping]   [▢ sum to mono]   [▢ attenuate per voice] │
│   Source group:  Voice  (master = QuadVCO cell 1)                   │
│   Target group:  Voice  (master = QuadVCA cell 1)                   │
└─────────────────────────────────────────────────────────────────────┘
```

For a `─┬─` (global broadcast) cable:

```
┌─ Cable: MIDI-IN mod_wheel → QuadVCO (master) pwm  ─────────────────┐
│   Carries: 1 signal (global)                                        │
│   Fanout:  → 4 targets (pwm_1, pwm_2, pwm_3, pwm_4)                 │
│   Per-voice trim:  [ same for all ▾ ]   (or per-voice slider grid)  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 Conversion-on-the-connection (BO / BI placement)

The user's idea "the dCV ↔ aCV conversion belongs on the connection" maps very nicely to the cable inspector. When you draw a cable from an *internal* output (dCV) to an *external* input (aCV), the inspector requires you to pick **which breakout cell** carries the conversion:

```
┌─ Cable: ENV out (dCV) → BrandX VCF cutoff (aCV)  ──────────────────┐
│   Conversion needed: dCV → aCV (12-bit, 0..5 V)                     │
│   Via breakout:   [ 8× CV-Out 12  ⌄ ]   cell:  [ 3 ⌄ ]              │
│   Aux trim:       [ ✓ board-side smoothing (CvSegment) ]            │
└─────────────────────────────────────────────────────────────────────┘
```

For a **voice-poly** cable that crosses the boundary, the conversion target must be a **poly cell group on a breakout** (e.g. the 4× pitch breakout grouped as "Voice/pitch"). The inspector pre-selects it if exactly one matches; otherwise the user picks.

---

## 3. Data-model additions

Concrete TypeScript additions to [`editor/src/modular-mb/types.ts`](../../editor/src/modular-mb/types.ts). All additions are **optional** so existing patches keep loading.

### 3.1 Multi-module support on `ModuleType`

```ts
export interface CellGroup {
  /** Stable id, unique within the ModuleType. */
  id: string;
  /** Human label of the repeated function. */
  label: string;          // "Oscillator", "VCA", "CV channel"
  /** How many cells of this kind exist on the panel. */
  count: number;
  /** Port ids that belong to ONE cell. Replicated `count` times.
   *  Convention: cell-port-id format = `<portId>_<index>` (1-based). */
  portIds: string[];
  /** Control ids that belong to ONE cell. */
  controlIds: string[];
}

export interface ModuleType {
  // ...existing fields...
  /** If present: the module is a multi-module. Ports/controls listed in
   *  any cell-group are per-cell; everything else is module-global. */
  cellGroups?: CellGroup[];
}
```

A non-multi module simply has no `cellGroups` and behaves like today.

### 3.2 Port flags for poly semantics

```ts
export interface Port {
  // ...existing fields...
  /** For event-source outputs and mix-back / fan-in inputs: declares
   *  whether the port carries one signal ('global') or N parallel
   *  signals ('voice'). Unset = inferred from group membership at
   *  expansion time (most normal ports). */
  polyKind?: 'voice' | 'global';
  /** If this port belongs to a cell-group, the id of that group. */
  cellGroupId?: string;
}
```

### 3.3 Rack-level `PolyGroup`

```ts
export type PolyGroupMember =
  | { kind: 'module'; moduleId: string }                                  // whole module is one cell
  | { kind: 'cell';   moduleId: string; cellGroupId: string; cellIndex: number };

export interface PolyGroup {
  id: string;                 // 'voice', 'drum_sub', …
  label: string;              // 'Voice'  (shown on the master + cable tooltips)
  voiceCount: number;         // N
  /** Ordered: members[0] is the master, members[i] is voice i+1. */
  members: PolyGroupMember[];
  /** UI tint for cables / cells that belong to this group. */
  color?: string;
}

export interface Rack {
  // ...existing fields...
  /** Poly groups defined for this rack. May be empty (mono rack). */
  polyGroups?: PolyGroup[];
}
```

### 3.4 Patch needs no new fields — only validation

`Patch.voiceCount` stays. New rule: a poly patch requires that every cable it draws to a master cell resolves against a `PolyGroup` whose `voiceCount === patch.voiceCount`. The validator runs on load and on every edit and flags mismatches.

### 3.5 Connection-side conversion

A new optional field on the existing `PatchConnection`:

```ts
export interface PatchConnection {
  // ...existing fields...
  /** When the cable crosses dCV↔aCV: which breakout cell-group carries
   *  the conversion, and (for poly cables) which PolyGroup maps voice
   *  index → breakout cell. */
  conversion?: {
    breakoutModuleId: string;
    cellGroupId: string;        // 'cv_12'  or  'pitch_16'
    /** For poly cables: which PolyGroup defines the per-voice mapping.
     *  When absent, the cable is global and uses a single cell index. */
    polyGroupId?: string;
    /** For global cables only: which cell to drive. */
    cellIndex?: number;
  };
}
```

### 3.6 Helper: expand a patch for the runtime

Compile-time function in TypeScript (mirrored on the firmware later):

```ts
// Produces the flattened graph the brain executes:
//   - all per-voice copies of modules in any PolyGroup
//   - all expanded per-voice cables
//   - all broadcast (global → poly) cables fanned out
//   - all sum (poly → poly-input-marked-as-sum) cables collapsed
//
// Input  : Patch + the Racks it references (containing PolyGroups)
// Output : { instances: ExpandedInstance[], cables: ExpandedCable[] }
//
// The output has NO PolyGroup awareness. It's exactly what
// SynthPatchV1 needs on the brain.
export function expandPatch(patch: Patch, racks: Rack[],
                            types: ModuleType[]): ExpandedGraph;
```

The brain receives either the original patch + groups (and runs `expandPatch` on-device) or the already-expanded graph. Per ADR 0010 we keep the compact form on the wire for round-trip + on-device display, and run expansion lazily.

---

## 4. Diff vs ADR 0010

| Topic | ADR 0010 said | This sketch refines to |
|---|---|---|
| Where polyphony is defined | **Patch-level "voice stamp"** (subgraph of the patch) | **Rack-level `PolyGroup`** (set of physical modules / cells). Patch only declares `voiceCount`; the rack supplies the mapping. |
| Per-port poly semantics | `shareMode: broadcast / sum / voice-indexed` on a `StampPort` | `polyKind: voice / global` on a normal `Port`. Expansion rules derive from `(srcPolyKind, dstPolyKind, dstInGroup)`. |
| Multi-modules | not addressed | First-class `CellGroup` on `ModuleType`. |
| Mix-back | implicit via `shareMode='sum'` | Explicit: a port can be marked `polyKind='voice'` *as input*, meaning "I accept N parallel signals here". Per-channel knobs on the panel stay; only the wiring collapses. |
| dCV↔aCV conversion | not addressed | Lives on the cable (`PatchConnection.conversion`), references a breakout cell-group. |
| Brain expansion | brain only sees flattened graph | both forms supported: brain may receive compact + expand on-device, or receive pre-expanded. |

ADR 0010 is not wrong, but rack-level groups are a better fit for the project: the user thinks about *which physical modules exist N times*, not about *which subgraph repeats*. When ADR 0010 is updated, the "voice stamp" section should be replaced by the `PolyGroup` model from this sketch.

---

## 5. Open questions surfaced by these sketches

1. **Group across racks** — the user's doc explicitly says "must live in one rack". Confirmed. We do not need cross-rack groups in v1.
2. **Multiple groups, same N** — allowed; cables only need to match group membership, not group id.
3. **Voice count mismatch** — what if the user changes `Patch.voiceCount` to a value no rack group can supply? Editor warns + offers to either (a) clamp to the smallest group's N, or (b) create a new auto-group on the largest compatible set.
4. **Per-voice trim on a global broadcast** — the inspector mentions a "per-voice trim slider grid". Worth designing but defer until a real patch needs it.
5. **Cable-routing override** — the user mentions "override mapping" (e.g. swap voices 1↔3). Stored as `PatchConnection.voicePermutation?: number[]`. Defer until needed.
6. **Multi-modules with shared controls** — the user wants the option of "N hardware instances, 1 control set". That's a degenerate `CellGroup` with `controlIds: []` and the controls living module-globally. The model already supports it; the panel renderer needs to draw the controls once and wire them to all cells. Concrete first example is a planned MMB house-brand "Quad-VCO-Shared".
