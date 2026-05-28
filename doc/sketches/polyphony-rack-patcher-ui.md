# Polyphony — Rack & Patcher UI sketches + data-model additions

Companion to [`global to multiple and back thoughts 01.md`](../global%20to%20multiple%20and%20back%20thoughts%2001.md) and [ADR 0010](../adr/0010-midi-in-and-polyphony.md). Started 2026-05-25.

This file proposes screen layouts for the **rack panel** (where groups are defined) and the **patcher** (where the user actually wires the poly cables), plus the data-structure additions needed to back them. ASCII sketches are intentional — they map cleanly to the existing `RackPanel.tsx` / `PatcherGraphPanel.tsx` and can be ported to real React/SVG once we agree on shape.

> **Vocabulary** (from `thoughts 01.md`, after the 25-may feedback round):
> - **internal / external module** — "internal" lives in the brain (its CV is digital, dCV); "external" lives in the physical rack (its CV is analog, aCV). The dCV ↔ aCV distinction is really *where the module sits*, not a separate signal kind.
> - **BI / BO board** — the only modules that straddle the boundary. Conceptually each BI/BO cell has an *external half* (analog jack, lives in the external rack view) and a *digital half* (dCV slot, lives in the internal rack view, free).
> - **multi-module** — a single physical module that internally repeats one function N times (dual osc, quad VCA, 8× CV breakout).
> - **cell-group** (template) — within a multi-module, the spec of ports + controls + displays that make up ONE repeated function and how many times it appears. Ports/controls outside any cell-group are *module-global*.
> - **cell** — one realisation of a cell-group, addressed by `(moduleId, cellGroupId, cellIndex)`. *A cell behaves like a sub-module*: it can be selected, grouped, patched to.
> - **poly-group** — a rack-level set of N cells (whole modules, or cells inside a multi-module) marked as "the N voices". `N ≥ 2`. Several poly-groups (different N values) may coexist in one rack.
> - **single port** — a normal port carrying one signal. Default for everything.
> - **poly-port (N=2..8)** — what a port becomes when its owning module/cell is part of a poly-group: it logically carries N parallel signals, one per cell in the group.
> - **global port** — only meaningful on **event sources**: an output that is not derived from a voice event (e.g. mod-wheel, breath, master pitch-bend). Still a single signal; the word "global" only emphasises its origin.
>
> **Hard signal-flow rules** (used everywhere below):
> - `single-out → single-in`  ✓ trivial.
> - `single-out → poly-in (N)` ✓ the signal is **duplicated** across N voices.
> - `poly-out (N) → poly-in (N)` ✓ **voice-indexed** 1↔1 (unless overridden).
> - `poly-out (N) → single-in` ✗ **forbidden** — would require collapsing N voices to 1 without rules. Use an explicit mix/sum/collapse module instead.
> - `poly-out (N) → poly-in (M)` with `N ≠ M` ✗ unless an explicit re-mapping module sits in between.

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

### 1.4 Mix-back / fan-in side — group at max flexibility, ungroup in the patch

An 8-channel mixer has 8 inputs. The **rack** marks them as one N=8 cell-group (= maximum flexibility). A specific **patch** may then *ungroup* this default partially: e.g. "4 voices in inputs 1..4, single inputs on 5..8", or "2× N=4 in 1..4 + 5..8".

Ungrouping is a patch-local override; the rack definition stays untouched. Other patches on the same rack are free to use the full N=8 grouping or any other partition.

A poly-port is still drawn as a single jack-stack in the patcher (one cable = one connection), but the rack panel shows the underlying cells too:

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
  │      │ mod ───────╪──> pwm   │              │          │          │      │
  │      │ (glb)      └──────────┘              └──────────┘          │L out │
  │      │                                                            │R out │
  └──────┘                                                            └──────┘
```

Three cable types visible here:
1. `═══` poly-poly: MIDI-IN poly pitch-out → master VCO v/oct, expanded to (`pitch_i` → `vco_i.voct`) for i=1..4.
2. `─┬─` single-to-poly: MIDI-IN mod-wheel (global single) → master VCO pwm, **duplicated** to all 4 VCOs' pwm.
3. `═══` poly-poly chained: VCO master audio out → VCA master audio in → mixer poly input. No re-expansion — once a signal is poly it stays voice-indexed end-to-end, until it lands on a port that the rack/patch has marked as a fan-in (the mixer's poly input).

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

A *cell-group* is the **template** of a repeating sub-part; a *cell* is one realisation `(moduleId, cellGroupId, cellIndex)` that the rest of the system treats as if it were its own little module.

```ts
export interface CellGroup {
  /** Stable id, unique within the ModuleType. */
  id: string;
  /** Human label of one cell. */
  label: string;          // "Oscillator", "VCA", "CV channel"
  /** How many cells of this kind exist on the panel. */
  count: number;
  /** Port ids that belong to ONE cell. Replicated `count` times.
   *  Convention: cell-port-id format = `<portId>_<index>` (1-based). */
  portIds: string[];
  /** Control ids that belong to ONE cell. */
  controlIds: string[];
  /** Display ids that belong to ONE cell. */
  displayIds?: string[];
}

export interface ModuleType {
  // ...existing fields...
  /** If present: the module is a multi-module. Ports / controls / displays
   *  listed in any cell-group are per-cell; anything else is module-global. */
  cellGroups?: CellGroup[];
}
```

A non-multi module simply has no `cellGroups` and behaves like today. A *shared-controls multi-module* (the user's "Quad-VCO-Shared" idea) is just `cellGroups: [{ ..., portIds: [...], controlIds: [] }]` with all controls living module-globally.

### 3.2 Port flags — only event-sources need extra metadata

A normal module's port has no poly/global flag of its own. Whether it is "poly" or "single" follows from cell/group membership at expansion time:

- Port on a module that is NOT in any poly-group ⇒ single.
- Port on a cell that IS in a poly-group ⇒ poly-port of cardinality `group.voiceCount`.

Only **event-source** outputs need an explicit flag, because they declare their nature *before* any grouping is involved:

```ts
export interface Port {
  // ...existing fields...
  /** Only on event-source outputs (and on the matching inputs of explicit
   *  fan-in modules, if any). 'voice' = output is produced per voice;
   *  'global' = output is not voice-derived (mod wheel, breath, master bend).
   *  Unset on every normal module port. */
  eventKind?: 'voice' | 'global';
  /** If this port belongs to a cell-group on a multi-module, the id of
   *  that group. Unset for module-global ports. */
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

### 3.4 Patch may locally repartition rack groups

`Patch.voiceCount` stays. New: a patch may **locally override** the rack's grouping for its own connections — split an N=8 rack group into 2× N=4, ungroup it entirely to 8× single, etc. The rack definition is untouched and other patches keep using the rack's defaults.

```ts
export interface PatchPolyOverride {
  /** Which rack-level PolyGroup we're modifying. */
  rackPolyGroupId: string;
  /** Replacement partitioning. Empty array = ungroup completely (every
   *  cell becomes single). Each entry produces one patch-local poly-group. */
  partition: { label: string; voiceCount: number; memberIndices: number[] }[];
  /** Marks this override as a unison view (all sub-groups share the same
   *  driving signal but keep independent controls). Defer to v1.5. */
  unison?: boolean;
}

export interface Patch {
  // ...existing fields...
  polyOverrides?: PatchPolyOverride[];
}
```

Validation rule: every cable's endpoint must be reachable through the *effective* group set (rack defaults + this patch's overrides). The effective set is what `expandPatch()` (3.6) consumes.

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
| Where polyphony is defined | **Patch-level "voice stamp"** (subgraph of the patch) | **Rack-level `PolyGroup`** (set of physical modules / cells), optionally **repartitioned by the patch**. Patch declares `voiceCount` + `polyOverrides`. |
| Per-port poly semantics | `shareMode: broadcast / sum / voice-indexed` on a `StampPort` | No flag on normal ports. Polyness follows from cell/group membership. Only event-source ports carry an explicit `eventKind: 'voice' \| 'global'`. |
| Multi-modules | not addressed | First-class `CellGroup` on `ModuleType`, and a *cell* is treated as a sub-module everywhere. |
| Mix-back | implicit via `shareMode='sum'` | Rack stores the *maximum* poly cell-group; patches may *ungroup* partially. The mixer is just a normal module whose inputs happen to be a cell-group. |
| dCV↔aCV conversion | not addressed | Lives on the cable (`PatchConnection.conversion`), references a breakout cell-group. The BI/BO panel itself shows the analog half in the external rack and the digital half (free) in the internal rack. |
| Brain expansion | brain only sees flattened graph | Both forms supported: brain may receive compact + expand on-device (needed for the touchscreen view), or receive pre-expanded. |
| Forbidden connections | not addressed | `poly-out → single-in` is rejected by the patcher; user must insert an explicit collapse module. |

ADR 0010 is not wrong, but rack-level groups are a better fit for the project: the user thinks about *which physical modules exist N times*, not about *which subgraph repeats*. When ADR 0010 is updated, the "voice stamp" section should be replaced by the `PolyGroup` model from this sketch.

---

## 5. Clarifications & deferred features

### 5.1 Several poly-groups in one rack — example

Think: rack has `Voice` (N=4, 4 VCOs masters at cell 1, sub at cell 5 of an 8-VCO) **and** `Drum` (N=3, 3 percussive oscillators). A cable from `MIDI-IN.pitch` to `Voice.master.voct` expands to 4 voices; a cable from `Drum-Trig-Seq.gate` to `Drum.master.gate` expands to 3 voices. The two groups never interact unless you patch between them; the only thing they share is the rack they live in.

The earlier note "cables only need to match group membership, not group id" was sloppy — strike it. A cable's two endpoints land on whatever groups they belong to; the *expansion* maps them by cell-index ordering within each group. If the cardinalities differ you fall under the forbidden-connection rule and the patcher refuses the cable.

### 5.2 Voice-count mismatch — what to offer the user

Scenario: rack only has an N=4 group; user sets `Patch.voiceCount = 6`. Editor warning. Offered fixes:
 - **(a) clamp** — lower `voiceCount` to 4 to match the largest available group.
 - **(b) regroup** — auto-build a patch-local override that takes 6 cells from the largest matching cell-pool (only works if the rack has ≥ 6 ungrouped compatible cells).
 - **(c) split** — opposite case: rack has N=8 group, patch wants N=4. Auto-add `polyOverrides` that partition the N=8 into 2× N=4 (two masters), as you described.

### 5.3 Per-voice trim on a single→poly broadcast — example

Default for a `single-out → poly-in (N=4)` cable: all 4 voices receive the same value of the source (the duplication rule). The inspector can optionally show a *trim grid* — N small sliders, default 100% each — so the user attenuates the broadcast per voice (voice 3 gets 50% mod, voice 4 gets 25%). Useful for layered patches; safe to defer to v1.5.

### 5.4 Cable routing override / voicePermutation — example

Default for a `poly-out (N) → poly-in (N)` cable: voice-indexed 1↔1. Sometimes the user wants `[3, 1, 2, 4]` — voice 3 from the source drives cell 1 of the target, voice 1 drives cell 2, etc. Stored as `PatchConnection.voicePermutation?: number[]`. Defer to v1.5; rare in practice.

### 5.5 Unison mode

User request: "N=8 rack group used in N=1 patch with all 8 cells driven by the same voice". That's a special case of `polyOverrides` where the partition is one group of 8 driven by 1 voice, but each cell keeps independent controls so the user can detune masters individually. Mark as a UI mode on the override; defer the wiring detail to when we actually need it.

### 5.6 Confirmed scope

- Groups live in one rack only.
- A rack may hold any mix of N=2, N=3, N=4, N=8 etc. poly-groups simultaneously.
- BI/BO panels straddle internal + external rack view (digital half is free).
- Multi-modules with shared controls = `CellGroup { controlIds: [] }` + controls at module level. Concrete first example: a planned MMB house-brand `Quad-VCO-Shared` (hardware not built yet — first tests will be simulator-only).

---

## 6. Future phases — A4 (full) + A5 plan

The "min" version of A4 that shipped only decorates each grouped rack-slot with a color ribbon + `i/N ★` voice badge. The **full** A4 + A5 below are still to do.

### 6.1 Phase A4 (full) — patcher expand/collapse with ghost-voices

Goal: the patcher stays readable when a rack has N voices, by **only ever showing the master cell** of each poly-group as a real node. Voices 2..N are visually folded behind the master and only revealed when the user explicitly expands the group.

Concrete behaviour (target file: `editor/src/modular-mb/PatcherGraphPanel.tsx`):

1. **Default render = collapsed.** A rack with a `PolyGroup g` of N=4 produces 1 patcher node per master cell (4× collapsed → 4 nodes today; 4× expanded would be 4×4 = 16). The node gets a small "× N" badge and is tinted with `g.color`.
2. **Cables between masters represent the whole bundle.** A cable drawn `master.audio_out → master.vca_in` *is* the poly cable; the inspector shows "carries N voices, voice-indexed 1↔1" (matches §2.2). The user never draws per-voice cables by hand.
3. **Per-group expand toggle.** A small `▶` / `▼` in the group's chip (or on the master node header) toggles `expandedGroups: Set<string>` in patcher-local UI state. When expanded:
   - Voices 2..N are drawn as **ghost nodes** next to the master (semi-transparent, dashed border, voice-index label).
   - Each implicit per-voice cable is drawn as a thin ghost line between the corresponding ghost ports.
   - Ghost nodes are read-only: no drag, no port-click, no inspector. They exist purely to make the expansion visible.
4. **Global → poly broadcasts** (`single-out → poly-in`) render in collapsed mode as a single `─┬─` tee on the source side; expanding shows the N fan-out lines as ghosts.
5. **Forbidden cables** (`poly-out → single-in` without an explicit collapse module) get the same red treatment as today's invalid cables, with a tooltip "voeg een Mix/Sum module in".
6. **Performance**: ghost nodes are layout-only, no event handlers; the per-voice expansion is computed on the fly from `expandPatch()` output (§3.6) and memoised per-group.

Out of scope for A4: actually running the expanded graph (that's brain-side); editing per-voice attenuations on a broadcast cable (deferred to v1.5 per §5.3); per-cable voice permutations (§5.4).

### 6.2 Phase A5 — `PatchPolyOverride` panel

Goal: surface the data-model item from §3.4 in the UI, so a patch can split or ungroup the rack's default `PolyGroup`s without touching the rack definition.

Concrete behaviour (likely a new section in the patch-properties panel):

1. **List**: one row per active `PatchPolyOverride`. Empty list = "patch uses rack defaults".
2. **Add override**: dropdown of rack-level `PolyGroup`s that don't yet have an override. Pick one → row appears with a default partition equal to `[ { label: g.label, voiceCount: g.voiceCount, memberIndices: 0..N-1 } ]` (= no-op).
3. **Edit partition**: drag-to-split UI on the member indices. Concretely a horizontal strip of N small numbered cells; the user clicks "split here" between two cells to break a sub-group, or drags a divider. Each sub-group has its own editable label + auto-derived `voiceCount`.
4. **Special modes**: checkbox `unison` (§5.5) on the override as a whole. When ticked, all sub-groups are visually merged with a chain-icon and the runtime will drive them from the same voice.
5. **Delete override**: → reverts to rack default.
6. **Validation**: every `memberIndices` must form a partition of `0..N-1` (no overlap, no gaps); the editor refuses to save an invalid override and shows a red banner. The validator already exists conceptually in §3.4's "validation rule".
7. **Side-effect**: when an override changes, `expandPatch()` re-runs; patcher cables that no longer match the effective grouping are flagged invalid (orange outline + "voice mismatch, fix the override or redraw the cable").

Out of scope for A5: visualising overrides on the rack panel (rack panel stays rack-pure); per-patch poly-group renaming beyond the override label.

### 6.3 Phase B — Teensy runtime (full plan)

Recap of the agreed approach (B-scaffold = MidiInModule + VoiceAllocator are already in firmware). Remaining work, in order:

1. **Audio library wrapping.** Embed the Teensy `Audio` library's `AudioSynthWaveform` (VCO), `AudioFilterStateVariable` / `AudioFilterBiquad` (VCF) and `AudioEffectMultiply` (VCA) inside our internal module subclasses. The MMB module owns the `Audio*` object, exposes our `tick()` / control-set / port-read API, and forwards parameters into the wrapped object each tick.
2. **USB only — no soldering.** Wiring stays Teensy-only:
   - **MIDI-in** via USB-MIDI (`usbMIDI.read()` polled in the main loop, dispatched into the existing `MidiInModule::onNoteOn/Off`). The PC routes a DAW or external keyboard into the Teensy.
   - **Audio-out** via USB audio (`AudioOutputUSB`), so the PC plays back what the Teensy synthesises. No DAC, no breadboard.
3. **Polyphony switch + routing.** Build the first end-to-end poly patch in the brain runtime:
   - `MidiInModule` with `voiceCount = 4` produces 4× `(pitch, gate, vel)`.
   - 4× wrapped `VCO` (one per voice) reads `voicePitchV(i)`.
   - 4× wrapped `VCF` reads VCO out + a shared cutoff/env.
   - 4× wrapped `VCA` reads gate-driven envelope.
   - Sum into a mono mix → `AudioOutputUSB`.
4. **CV vs audio stream.** Make the distinction explicit at the wiring level: CV ports tick at the slow rate (control-rate, e.g. 1 kHz from main loop), audio ports tick at the Audio library's 44.1 kHz block rate. The wrapper modules bridge: their CV inputs are sampled at audio-block boundaries.
5. **Test.** Round-trip from a PC MIDI source → Teensy synth → PC audio input, listened to in any DAW. Success = 4-voice polyphony audibly working, no crackle, voice stealing on a 5th note matches the editor sim.

Deferred to a later B-phase: external CV via the BO board (needs hardware), DIN-MIDI merge with USB stream behind a `MidiSource` abstraction, CC + pitch-bend handling, per-voice modulation matrices.

#### Status (2026-05-28)

- **Step 0 — toolchain & pipeline.** ✅ done. PlatformIO 6.1.19 in `.venv`; project at [firmware/app-modular-brain](../../firmware/app-modular-brain/); USB Type `USB_MIDI_AUDIO_SERIAL`; upload via `teensy-gui`; MIDI-roundtrip script [scripts/pipeline_test.py](../../firmware/app-modular-brain/scripts/pipeline_test.py) (pure ctypes/winmm — no rtmidi/pygame wheels yet on Python 3.14).
- **Step 1 — first audible voice.** ✅ done. 1× `AudioSynthWaveform` (saw) → `AudioEffectMultiply` (gated by ramped `AudioSynthWaveformDc`) → stereo `AudioOutputUSB`. Plays from any USB-MIDI source into "Teensy MIDI/Audio".
- **Step 2 — 4-voice polyphony via shared `MidiInModule`.** ✅ done. PIO now compiles `firmware/core` as a Teensy library (`lib_extra_dirs`/`lib_deps`); the sketch instantiates `mb::runtime::MidiInModule{"midi1"}` with `voiceCount=4` and mirrors `voicePitchV/voiceGate/voiceVelocity` into 4 audio voices (saw → multiply ← DC envelope, summed in `AudioMixer4` → `AudioOutputUSB`). Same allocator code path as editor + host tests. `pipeline_test.py` extended with single-note, 4-note chord and 5-note voice-stealing sub-tests — all PASS. Required portability fix: explicit `std::clamp<std::int32_t>(...)` in `MidiIn.cpp/Lfo.cpp/CvBreakout.cpp/Ahdsr.cpp` (on ARM `int32_t == long int`).
- **Step 3-5 — CV-rate vs audio-rate split, VCF, BO board / DIN-merge.** open.

See [firmware/app-modular-brain/README.md](../../firmware/app-modular-brain/README.md) §DEVLOG for the full per-step log.

### 6.5 Editor ↔ Teensy link (mmb-config.v1, USB Serial)

The editor pushes its full `ModularProject` to the Teensy over USB-Serial.
This same JSON-on-the-wire protocol will later flow via the planned
ESP32 WiFi sidecar — same payload, different transport.

**Transport.** USB CDC-Serial at 115200 8N1, newline-terminated UTF-8
JSON lines. Browser side uses the Web Serial API
([editor/src/modular-mb/teensyLink.ts](../../editor/src/modular-mb/teensyLink.ts)),
device side uses `ArduinoJson v7`
([firmware/app-modular-brain/src/TeensyLink.h](../../firmware/app-modular-brain/src/TeensyLink.h)).

**Messages.**

| From → To           | Type            | Payload                                              |
|---------------------|-----------------|------------------------------------------------------|
| Teensy → editor     | `hello`         | `{fw, step}`                                         |
| editor → Teensy     | `hello`         | (request) — Teensy replies with its own `hello`      |
| editor → Teensy     | `config`        | `{project: ModularProject}` — full snapshot          |
| editor → Teensy     | `selectPatch`   | `{patchId}`                                          |
| Teensy → editor     | `ack`           | `{ok, applied, modules?, patches?, racks?, err?}`    |
| Teensy → editor     | `log`           | `{msg}`                                              |

**Status (2026-05-28).** ✅ Link-skelet operationeel. Verbinden / connecten /
`hello`-handshake / volledige config-push / `selectPatch` / log-stream
werken in beide richtingen. De Teensy logt aantal modules/patches/racks
maar bouwt de audiograaf nog niet om — dat is B-step 3.

**Open (B-step 3+).** Module-registry op de Teensy, zodat een binnenkomend
`config`-bericht de huidige hardgecodeerde 4-voice graph vervangt door
de modules + connections uit het project. Mappings: editor-`MIDI-IN` →
`mb::runtime::MidiInModule`, editor-`VCO` → `AudioSynthWaveform`-wrap,
editor-`ADSR` → ramped `AudioSynthWaveformDc`-wrap, editor-`VCA` →
`AudioEffectMultiply`-wrap, editor-`AUDIO-OUT` → `AudioOutputUSB`.

### 6.4 Backlog — UX rework (post-A5)

Captured from a user review during the A5 implementation; not yet
implemented. These are the items that determine whether the
PatchPolyOverride feature is actually understandable.

1. **One-click split presets.** Buttons "Split in 2", "Split in 4", "Ungroup" instead of cell-by-cell dropdowns. Manual partitioning stays available as power-user mode.
2. **Patcher reflects the override live.** `voiceMap` must merge the rack's `polyGroups` with the active patch's `polyOverrides`. The chip-bar then shows the patch-local groups (e.g. 2× N=4 instead of 1× N=8). Currently the chip-bar reads only the rack — so overrides are invisible in the patcher.
3. **Unison = expand-as-individual-modules-but-shared-input.**
   - Visually: all N voices rendered as separate slots, surrounded by a dashed outline in the group colour (so the user sees they share one MIDI source).
   - Per partition: a port-picker dropdown (multi-select) listing the master type's input ports, marking which receive the shared mono signal and which stay per-voice. Stored on the partition as `unisonSharedPorts?: string[]`.
4. **Nesting (later).** A partition's `unisonChildren?` could itself be a `PatchPolyOverride['partition']` array → 4 sub-groups of 2 unison VCOs = "4-voice dual osc". Recursive renderer + recursive voice-allocator semantics.
5. **MidiIn panel additions.** Channel + note-priority mode (last/lowest/highest/round-robin) + legato vs retrigger. Voice-count stays on the rack/voice-group, not on MidiIn.
6. **Patcher "Compact view" toggle.** Because poly racks visually thin out (lots of empty HP between masters), a toggle that virtually packs all slots flush-left per row — view-only, doesn't mutate slot positions in the rack. Followers in expanded groups get a virtual slot next to their master.

---


## 7. Implementation status

### Phase A1 + A2 — done

`editor/src/modular-mb/types.ts` — additions (all optional, no migration needed):

- `Port.eventKind?: 'voice' | 'global'`
- `Port.cellGroupId?: string`
- `type ModuleRole = 'event-source' | 'normal' | 'multi' | 'poly-to-mono' | 'mono-to-poly' | 'break-in' | 'break-out'`
- `interface CellGroup { id; label; count; portIds[]; controlIds[]; displayIds?[] }`
- `ModuleType.role?` and `ModuleType.cellGroups?`
- `type PolyGroupMember = { kind:'module'; moduleId } | { kind:'cell'; moduleId; cellGroupId; cellIndex }`
- `interface PolyGroup { id; label; voiceCount; members[]; color? }`
- `Rack.polyGroups?: PolyGroup[]`
- `interface PatchPolyOverride { rackPolyGroupId; partition[]; unison? }`
- `Patch.polyOverrides?: PatchPolyOverride[]`
- `PatchConnection.conversion?: { breakoutModuleId; cellGroupId; polyGroupId?; cellIndex? }`

`editor/src/modular-mb/seedModules.ts` — additions:

- `assemble()` spec extended with optional `role` and `cellGroups` (spread into the resulting `ModuleType`).
- `inPort()` / `outPort()` helpers got an optional `opts` argument: `outPort` carries `eventKind`, both carry `cellGroupId`.
- `mmbMidiIn()` now declares `role: 'event-source'` and its `pitch` + `gate` outputs are tagged `eventKind: 'voice'`.
- New module `mmbQuadVcoShared()` (typeId `tp_mmb_quad_vco_shared`, 16 HP, internal): `role: 'multi'`, single cell-group `{ id:'osc', count:4, portIds:['voct','out'], controlIds:[] }`. Demonstrates the shared-controls multi-module pattern. Registered in `seedInternals`.

Build verify: `npm run build` in `editor/` → green (tsc + vite, no errors).

Out of scope for this phase (next up): rack-grouping UI (A3), expand/collapse logic (A4), patch-level override panel (A5).

### Phase A3 + A4-min — done

`editor/src/modular-mb/RackPanel.tsx` — additions:

- `POLY_COLORS` palette (8 colors) for visual distinction between groups.
- `buildVoiceMap(rack)` helper: maps each grouped `moduleId` → `{ group, voiceIndex }` for O(1) slot lookup.
- New `VoiceGroupsPanel` component (full CRUD): add/delete groups, rename, recolor, add/remove/reorder members. Auto-syncs `voiceCount` with `members.length`. Type-anchor enforcement: first member sets the typeId; the "+ Add voice" dropdown filters to rack modules of the same `typeId` that aren't yet in any group, so a group can never mix module types and no module can sit in two groups.
- `RackGrid` slot decoration: every slot whose module belongs to a `PolyGroup` gets (1) a 4 px color ribbon along the bottom edge in the group color, (2) a small `V{n}/{N}` badge top-left (★ marks the first/master voice).

`moveMember` swap uses explicit null-checked locals (not array destructuring) to satisfy strict `noUncheckedIndexedAccess` typing.

Build verify: `npm run build` in `editor/` → green (`✓ built in 1.66s`).

Out of scope, still pending: full A4 (patcher expand/collapse with ghost-voice rendering in `PatcherGraphPanel.tsx`), A5 (`PatchPolyOverride` panel).

### Phase B-scaffold — done

`firmware/core/include/mb/runtime/MidiIn.h` + `firmware/core/src/runtime/MidiIn.cpp` — new module `MidiInModule` (`kTypeId = "tp_mmb_midiin"`, mirrors editor `mmbMidiIn`).

- Subclass of `CvModule`; owns an internal `VoiceAllocator` (last-note priority with round-robin stealing — reuses `mb::VoiceAllocator` from `firmware/core/include/mb/VoiceAllocator.h`).
- Event-driven: `tick()` is a no-op; state changes happen inside `onNoteOn(channel, note, vel)` / `onNoteOff(channel, note)` / `allNotesOff()`. The Teensy USB-MIDI ISR will eventually call those methods directly; tests call them in the same way (no `MidiSource` abstraction needed yet).
- Per-voice readout: `voicePitchV(idx)` (V/Oct, MIDI 60 → 0.0 V, 1 V/octave), `voiceGate(idx)`, `voiceVelocity(idx)` (0..1, sticks across NoteOff so release-phase envelopes can still read it).
- Controls: `channel` (0 = omni, 1..16), `voiceCount` (1..16, reconfigures the allocator and clears all gates).
- Velocity-0 NoteOn treated as NoteOff (MIDI convention). Channel filter applied symmetrically to NoteOn and NoteOff.
- Standard self-registration pattern: `registerFactory()` + static-init block at EOF (mirror of `Ahdsr`/`Lfo`).

`firmware/core/tests/test_midiin.cpp` — 9 new tests covering: registry round-trip, mono pitch/gate/velocity, vel-0 = NoteOff, channel filter (omni + single), 4-voice polyphony with distinct slots, voice stealing on the 5th note, `allNotesOff`, `voiceCount` reconfigure clears gates.

`firmware/core/CMakeLists.txt` + `firmware/core/tests/CMakeLists.txt` updated with the new source files.

Build + test verify: `cmake --build` clean, `core_tests.exe` → **76 test(s), 0 failed** (was 67; +9 MidiIn).

Out of scope, still pending: wiring the Teensy `usbMIDI` polling loop into a `MidiInModule` instance (needs the main-loop dispatcher to exist first); CC + pitch-bend handling; merging USB + DIN streams behind a `MidiSource` abstraction.

### Phase A4-min refinements — done

Rack-editor UX overhaul on top of A3+A4-min. All in `editor/src/modular-mb/RackPanel.tsx`.

**Internal-rack auto-grow, overal.** Eerder rekte een internal rack alleen op bij het plaatsen van een nieuwe module. Nu groeit `hpPerRow` (en zo nodig `rows`) ook bij `duplicateSlot`, `moveSlot` (toetsenbord + 1HP-context-menu), `moveRow` en de drag/drop-handler `setSlotPosition`. Physical racks blijven hard begrensd door hun fysieke HP/rij-config.

**Multiselect-engine.** Selectie is een `Set<string>` in `RackPanel`, gedeeld met `RackGrid` en de nieuwe `RackInspector`.
- Klik: single-select. Shift-klik: range binnen dezelfde rij (op `hpOffset`-volgorde, anker = laatste single-klik). Ctrl/Cmd-klik: toggle.
- Pijltjestoetsen op een geselecteerd slot bewegen de hele selectie atomair (één botsing of out-of-bounds tegen niet-geselecteerde modules → hele move wordt geweigerd; internal racks groeien in plaats van te weigeren). Delete verwijdert alle geselecteerde slots.
- Drag-and-drop: als het ankermodule onderdeel van de selectie is, beweegt de hele selectie met dezelfde delta; anders valt het terug op single-move (en wordt het sleepdoel ook automatisch het nieuwe single-select).
- Focus-retentie: na een rij-wissel is het DOM-element opnieuw aangemaakt, dus een `pendingFocusRef` + `useEffect` zet de focus terug op `[data-slot-id="…"]`. Pijltjestoetsen blijven daardoor werken na meerdere achtereenvolgende moves.
- Achtergrond-klik (lege rij-strip of grid-root) leegt de selectie; slot-klik stopt propagation zodat dat niet per ongeluk gebeurt.

**RackInspector (zij-panel).** Vervangt de oude per-rij "Selected slot"-blokjes door één 260px-breed aside naast het rack-grid.
- 0 selectie: placeholder-tekst.
- 1 selectie: bewerkbare module-naam, plus key/value-regels voor type, HP, rij, HP-offset, module-id, en een "Verwijder uit rack"-knop.
- N > 1: bulk-delete + sneltoetsen-hint. De selectie-set en setter zijn props.

**Selection-aware context menu.** Rechter-muis op een ongeselecteerd slot promoveert het tot single-select; op een geselecteerd slot blijft de hele selectie staan.
- Multi-branch: header "<N> modules geselecteerd"; `⇤ Aansluiten naar links` / `⇥ Aansluiten naar rechts` (`packSelection` — per rij sorteren op `hpOffset`, butten vanaf de linker- of rechterrand van de huidige spreiding; valideert botsingen tegen niet-geselecteerde modules en rij-grenzen); `⛓ Maak voice-group van selectie` (alleen als alle leden hetzelfde `typeId` hebben en nog niet gegroepeerd zijn — leftmost wordt master, kleur uit `POLY_COLORS`); `— Verwijder selectie`.
- Single-branch: dupliceer / rij omhoog/omlaag / 1HP links/rechts / `⛓ Voice-group van alle modules met dit type` (zelfde regel: gegroepeerd raakt overgeslagen, geklikt slot wordt master); verwijder.

**Voice-groups chip-bar.** Het volle `VoiceGroupsPanel` is ingeklapt naar een ~30px chip-bar (`● Label · N`-buttons + `+ Group`). Klik op een chip opent de **`GroupEditor` in het rechter properties-paneel** (de eerdere popover is geschrapt; alles wat aan een rack-element hangt — module-props of voice-group — woont nu op één plek). Een tweede klik op de chip sluit. Klikken op een module wisselt de inspector automatisch terug naar module-props (en sluit de open group); een chip openen wist de slot-selectie.
- Wanneer een groep open staat krijgen al haar member-slots in het grid een gekleurde outline + glow in de groep-kleur (extra `openGroupId` prop op `RackGrid`).

**Inspector auto-hide.** Het rechter properties-paneel rendert alleen als er iets te tonen is: 1+ slot geselecteerd óf een voice-group open. Anders verdwijnt het hele aside-element en krijgt het rack-grid de volle breedte. Klik op de grid-achtergrond leegt beide en verbergt het paneel weer.

**Badge zonder V-prefix.** Voice-badges op rack-slots tonen nu `1/3 ★` (master) of `2/3` in plaats van `V1/3 ★`. Compacter en de ster maakt de master onmiskenbaar.

Editor build groen na alle wijzigingen (`npm run build` → vite 1.6s).

### Phase A4 (full) + A5 — done

Patcher-side polyphony visualisation en patch-lokale voice-overrides
gebouwd in `editor/src/modular-mb/PatcherGraphPanel.tsx`. Verfijning van
de chip-bevindingen ook meegenomen.

**A4-full — patcher voice-decoratie.**
- `ModuleNodeData` heeft optionele `voice: { group, voiceIndex }` + `ghost`
  flags. `ModuleNode` tekent:
  - **Master** (voiceIndex 0 of niet-ghost): gekleurde 2px outline +
    glow-shadow in de groep-kleur en een badge `× N · Label` linksboven.
  - **Ghost-follower** (voiceIndex ≥ 1, alleen zichtbaar als groep
    uitgeklapt): zelfde slot met `opacity 0.42` + grayscale, vierkante
    handles, `pointerEvents: none`, badge `i/N`.
- `PatcherGraphInner` bouwt één `voiceMap` over alle racks van de patch
  en houdt `expandedGroups: Set<string>` als view-state. `nodes` filtert
  followers eruit zolang hun groep collapsed is; uitgeklapt verschijnen
  ze alsnog op hun rack-positie als ghost-nodes.
- `edges` verbergt cables die aan een verborgen follower hangen en
  herkent **poly-cables** (een endpoint = master van een groep): die
  worden dikker, met glow in de groep-kleur, plus een `×N` label-chip
  in de groep-kleur op het midden van de kabel — visuele bevestiging
  dat er meerdere voices door één symbolische cable lopen.
- Een **chip-bar** boven het ReactFlow-canvas (absolute positie) toont
  per groep `▶/▼ ● Label × N`. Klik wisselt expand/collapse. Bij
  meerdere racks in één patch staan alle groepen naast elkaar.
- Bewust uitgesteld: per-voice trim-knoppen, automatische ghost-cables
  (volger-kabels van groepslid naar groepslid), `voicePermutation` /
  routing-overrides op connection-niveau.

**A5 — `PatchPolyOverride` panel.** Nieuw component `PolyOverridesPanel`
in het rechter sidebar, rendert alleen als de patch ≥1 voice-group ziet.
- Per rack-groep zonder override is er een select `+ Override toevoegen…`.
  Default-override = één partition die alle cells beslaat (no-op).
- Per override toont `OverrideEditor`:
  - Header met groep-kleur, label, `N=<voiceCount>`, `unison`-checkbox
    (zet `override.unison`), en `× Reset` (verwijdert de override
    volledig).
  - Een hernoembare label-rij per partition + knop `+ sub-group`.
  - Een rij met N dropdowns (één per member-cell) waarmee elke cell aan
    een partition wordt gehangen (of `—` = ungrouped). Partities worden
    automatisch herbouwd uit de cell→partition mapping zodat
    `memberIndices` en `voiceCount` consistent blijven.
  - Waarschuwing als de partities samen leeg zijn (override doet niets).
- State-mutaties lopen via `updateProject` met `polyOverrides: PatchPolyOverride[]`
  op de huidige patch. Geen runtime-gebruik nog — de overrides worden
  later door de voice-allocator/uploader gelezen.

**Bevindingen-fixes (vóór A4/A5).**
- *Delete-knop overflow in 260px inspector*: `GroupEditor` header
  gesplitst in 2 rijen — rij 1 `[colordot][naam input flex:1][× Delete]`,
  rij 2 grijze sub-text `{N} voices · {type.variant}`. Input krijgt
  `flex:1 minWidth:0` zodat de delete-knop nooit wordt weggedrukt.
- *Context-menu negeert bestaande groep*: het slot/multi-context-menu
  berekent nu een `sharedGroupId` (multi: gedeeld iff álle selectie naar
  dezelfde groep wijst; single: directe lookup). Als gevonden →
  menu-item `⛓ Toon voice-group eigenschappen` dat de inspector
  rechtstreeks omschakelt naar `GroupEditor` voor die groep (en
  slot-selectie wist). Anders blijft het oorspronkelijke `Maak
  voice-group …`-item staan.
- *Empty-state inspector*: `RackInspector` rendert nu een korte
  placeholder "Geen module geselecteerd." zonder Ctrl/Shift-hint, en
  het hele `<aside>` blijft auto-hidden zolang er niets te tonen is.

Build: `cd editor; npm run build` → vite 1.6s, 0 errors.

