# Polyphony â€” Rack & Patcher UI sketches + data-model additions

Companion to [`global to multiple and back thoughts 01.md`](../global%20to%20multiple%20and%20back%20thoughts%2001.md) and [ADR 0010](../adr/0010-midi-in-and-polyphony.md). Started 2026-05-25.

This file proposes screen layouts for the **rack panel** (where groups are defined) and the **patcher** (where the user actually wires the poly cables), plus the data-structure additions needed to back them. ASCII sketches are intentional â€” they map cleanly to the existing `RackPanel.tsx` / `PatcherGraphPanel.tsx` and can be ported to real React/SVG once we agree on shape.

> **Vocabulary** (from `thoughts 01.md`, after the 25-may feedback round):
> - **internal / external module** â€” "internal" lives in the brain (its CV is digital, dCV); "external" lives in the physical rack (its CV is analog, aCV). The dCV â†” aCV distinction is really *where the module sits*, not a separate signal kind.
> - **BI / BO board** â€” the only modules that straddle the boundary. Conceptually each BI/BO cell has an *external half* (analog jack, lives in the external rack view) and a *digital half* (dCV slot, lives in the internal rack view, free).
> - **multi-module** â€” a single physical module that internally repeats one function N times (dual osc, quad VCA, 8Ã— CV breakout).
> - **cell-group** (template) â€” within a multi-module, the spec of ports + controls + displays that make up ONE repeated function and how many times it appears. Ports/controls outside any cell-group are *module-global*.
> - **cell** â€” one realisation of a cell-group, addressed by `(moduleId, cellGroupId, cellIndex)`. *A cell behaves like a sub-module*: it can be selected, grouped, patched to.
> - **poly-group** â€” a rack-level set of N cells (whole modules, or cells inside a multi-module) marked as "the N voices". `N â‰¥ 2`. Several poly-groups (different N values) may coexist in one rack.
> - **single port** â€” a normal port carrying one signal. Default for everything.
> - **poly-port (N=2..8)** â€” what a port becomes when its owning module/cell is part of a poly-group: it logically carries N parallel signals, one per cell in the group.
> - **global port** â€” only meaningful on **event sources**: an output that is not derived from a voice event (e.g. mod-wheel, breath, master pitch-bend). Still a single signal; the word "global" only emphasises its origin.
>
> **Hard signal-flow rules** (used everywhere below):
> - `single-out â†’ single-in`  âœ“ trivial.
> - `single-out â†’ poly-in (N)` âœ“ the signal is **duplicated** across N voices.
> - `poly-out (N) â†’ poly-in (N)` âœ“ **voice-indexed** 1â†”1 (unless overridden).
> - `poly-out (N) â†’ single-in` âœ— **forbidden** â€” would require collapsing N voices to 1 without rules. Use an explicit mix/sum/collapse module instead.
> - `poly-out (N) â†’ poly-in (M)` with `N â‰  M` âœ— unless an explicit re-mapping module sits in between.

---

## 1. RACK layer â€” group-definition UI

### 1.1 Normal rack view (today)

```
â”Œâ”€ Rack: Studio Cabinet â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ [+ Module] [Modeâ–¾] â”€â”
â”‚                                                                                â”‚
â”‚  Row 1  â”Œâ”€â”€â”€â”€â”€â”€â”â”Œâ”€â”€â”€â”€â”€â”€â”â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”Œâ”€â”€â”€â”€â”€â”€â”â”Œâ”€â”€â”€â”€â”€â”€â”               â”‚
â”‚         â”‚ MIDI â”‚â”‚ DualOscâ”‚â”‚ QuadVCO  â”‚â”‚ QuadVCA  â”‚â”‚ ENV â”‚â”‚ LFO  â”‚               â”‚
â”‚         â”‚  IN  â”‚â”‚        â”‚â”‚          â”‚â”‚          â”‚â”‚ AHDSRâ”‚â”‚      â”‚               â”‚
â”‚         â””â”€â”€â”€â”€â”€â”€â”˜â””â”€â”€â”€â”€â”€â”€â”˜â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜â””â”€â”€â”€â”€â”€â”€â”˜â””â”€â”€â”€â”€â”€â”€â”˜               â”‚
â”‚                                                                                â”‚
â”‚  Row 2  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                              â”‚
â”‚         â”‚ 8Ã— CV-Out 12 â”‚â”‚ 4Ã— CV-16 â”‚â”‚ 8-ch Mixer â”‚                              â”‚
â”‚         â”‚  (breakout)  â”‚â”‚  (pitch) â”‚â”‚            â”‚                              â”‚
â”‚         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                              â”‚
â”‚                                                                                â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 1.2 Group-definition mode  ("Mode â–¾ â†’ Poly grouping")

Switching the rack panel into **grouping mode** dims the canvas and overlays a small toolbar. Every module / cell becomes click-targetable.

```
â”Œâ”€ Rack: Studio Cabinet â”€â”€â”€ [Mode â–¾ Poly grouping] â”€â”€â”€â”€ [Group: Voice (N=4) â–¾] â”€â”
â”‚  Click cells to add â†’ master first, then 2..N in order. ESC to leave.         â”‚
â”‚                                                                                â”‚
â”‚  Row 1  â”Œâ”€â”€â”€â”€â”€â”€â”â”Œâ”€â”€â”€â”€â”€â”€â”â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”Œâ”€â”€â”€â”€â”€â”€â”â”Œâ”€â”€â”€â”€â”€â”€â”               â”‚
â”‚         â”‚ MIDI â”‚â”‚ DualOscâ”‚â”‚ QuadVCO â”ƒâ”‚ QuadVCA  â”‚â”‚ ENV  â”‚â”‚ LFO  â”‚               â”‚
â”‚         â”‚  IN  â”‚â”‚ â”ƒMâ”ƒ 2 â”‚â”‚ â”ƒMâ”ƒ 2 3 4â”‚â”‚ â”ƒMâ”ƒ 2 3 4â”‚â”‚ (G)  â”‚â”‚ (G)  â”‚               â”‚
â”‚         â””â”€â”€â”€â”€â”€â”€â”˜â””â”€â”€â”€â”€â”€â”€â”˜â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜â””â”€â”€â”€â”€â”€â”€â”˜â””â”€â”€â”€â”€â”€â”€â”˜               â”‚
â”‚                                                                                â”‚
â”‚  Row 2  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                              â”‚
â”‚         â”‚ 8Ã— CV-Out 12 â”‚â”‚ 4Ã— CV-16 â”‚â”‚ 8-ch Mixer â”‚                              â”‚
â”‚         â”‚ â”ƒMâ”ƒ2 3 4 . . â”‚â”‚ â”ƒMâ”ƒ2 3 4 â”‚â”‚ â”ƒIN-polyâ”ƒ  â”‚                              â”‚
â”‚         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                              â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

Legend:  â”ƒMâ”ƒ = master cell (bold border, voice index 1)
         2..N = follower cells (greyed, numbered)
         (G)  = explicitly global module (will not be replicated)
         â”ƒIN-polyâ”ƒ = a single port flagged as "accepts a poly bundle"
```

Interaction:
1. User picks **N** for the active group (`Voice (N=4)`) â€” N is a rack-level property of the group, **not** a per-module thing.
2. User clicks a cell. First click â‡’ master. Each subsequent click â‡’ index `2..N`. Re-clicking the master clears the whole group; re-clicking a follower removes just that follower.
3. The cell must be **compatible** with the master â€” same `ModuleType.id` for whole-module members, same `(typeId, cellGroupId)` for multi-module members. Incompatible cells get a red outline + tooltip "type mismatch".
4. **Multi-module zoom**: hovering a multi-module enlarges it so its internal cells become individually clickable (the QuadVCO shows 4 numbered sub-panels, the 8Ã— CV breakout shows 8 dCV/aCV pairs).
5. Multiple groups in one rack are allowed and colour-coded: `Voice (blue)`, `Drum sub-pool (orange)`, etc.

### 1.3 Multi-module zoom example â€” `QuadVCO`

```
â”Œâ”€ QuadVCO â”€â”€â”€â”€â”€ (cell groups: 4Ã— "osc") â”€â”€â”€ [Click cells: â”ƒMâ”ƒ â†’ 2 â†’ 3 â†’ 4] â”€â”
â”‚ Global controls:   â”Œâ”€[ SYNC ]â”€â”  â”Œâ”€[ XMOD ]â”€â”                              â”‚
â”‚                                                                             â”‚
â”‚  â”Œâ”€â”€ cell 1 (M) â”€â”€â” â”Œâ”€â”€ cell 2 â”€â”€â” â”Œâ”€â”€ cell 3 â”€â”€â” â”Œâ”€â”€ cell 4 â”€â”€â”           â”‚
â”‚  â”‚  â”ƒMâ”ƒ           â”‚ â”‚     2      â”‚ â”‚     3      â”‚ â”‚     4      â”‚           â”‚
â”‚  â”‚ â—‰ FREQ         â”‚ â”‚ â—‰ FREQ     â”‚ â”‚ â—‰ FREQ     â”‚ â”‚ â—‰ FREQ     â”‚           â”‚
â”‚  â”‚ â—‰ WAVE         â”‚ â”‚ â—‰ WAVE     â”‚ â”‚ â—‰ WAVE     â”‚ â”‚ â—‰ WAVE     â”‚           â”‚
â”‚  â”‚ â¬¢ v/oct in     â”‚ â”‚ â¬¢ v/oct in â”‚ â”‚ â¬¢ v/oct in â”‚ â”‚ â¬¢ v/oct in â”‚           â”‚
â”‚  â”‚ â¬¡ audio out    â”‚ â”‚ â¬¡ audio outâ”‚ â”‚ â¬¡ audio outâ”‚ â”‚ â¬¡ audio outâ”‚           â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜           â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

The same UI works for a `DualVCO` with `count=2`, or an 8-channel CV breakout where each cell is `{dCV-slot, aCV-jack}`.

### 1.4 Mix-back / fan-in side â€” group at max flexibility, ungroup in the patch

An 8-channel mixer has 8 inputs. The **rack** marks them as one N=8 cell-group (= maximum flexibility). A specific **patch** may then *ungroup* this default partially: e.g. "4 voices in inputs 1..4, single inputs on 5..8", or "2Ã— N=4 in 1..4 + 5..8".

Ungrouping is a patch-local override; the rack definition stays untouched. Other patches on the same rack are free to use the full N=8 grouping or any other partition.

A poly-port is still drawn as a single jack-stack in the patcher (one cable = one connection), but the rack panel shows the underlying cells too:

```
â”Œâ”€ Mixer 8-ch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚   â”ƒ poly IN â”ƒ   in 2     in 3     in 4     in 5    in 6  â”‚
â”‚   â¬¢â¬¢â¬¢â¬¢ (Ã—4) â¬¡        â¬¡        â¬¡        â¬¡       â¬¡     â”‚
â”‚   vol1 vol2 vol3 vol4 vol5     vol6     vol7    vol8     â”‚
â”‚   pan1 pan2 pan3 pan4 pan5     pan6     pan7    pan8     â”‚
â”‚   â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â” â”‚
â”‚   â¬¡ L out                              â¬¡ R out           â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

Note the **asymmetry**: a *poly* input occupies the visual footprint of N jacks (mini-stack of 4 sockets) but counts as a single connection in the patcher. The volume / pan controls behind it are still per-channel (the user wants to control voice 3 a bit louder), but they live on the mixer panel as before.

---

## 2. PATCH layer â€” patcher with poly cables

The patcher only ever lets the user draw cables to / from **master cells** and explicitly-marked **poly ports**. Followers are hidden in the patcher (they live in the rack-grouping view, not here). This keeps the cable count manageable.

### 2.1 Cable styling

```
   â”€â”€â”€ thin solid line â”€â”€â”€      global â†’ global cable (today)
   â•â•â• double / thick line â•â•â•  voice-poly cable (1 cable, N voices under water)
   â”€â”¬â”€ split tee on global side a global signal duplicated into a voice-poly target
```

Examples:

```
  MIDI-IN            QuadVCO (master)         QuadVCA (master)        Mixer
  â”Œâ”€â”€â”€â”€â”€â”€â”            â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”              â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”          â”Œâ”€â”€â”€â”€â”€â”€â”
  â”‚      â”‚ pitch â•â•â•â•â•â•ªâ•> v/oct  â”‚     audio    â”‚          â”‚  audio   â”‚poly  â”‚
  â”‚      â”‚ (Ã—4 voice) â”‚     out â•â•ªâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•ªâ•> in     â”‚  out â•â•â•â•â•ªâ•> in â”‚
  â”‚      â”‚            â”‚          â”‚              â”‚          â”‚          â”‚      â”‚
  â”‚      â”‚ mod â”€â”€â”€â”€â”€â”€â”€â•ªâ”€â”€> pwm   â”‚              â”‚          â”‚          â”‚      â”‚
  â”‚      â”‚ (glb)      â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜              â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜          â”‚L out â”‚
  â”‚      â”‚                                                            â”‚R out â”‚
  â””â”€â”€â”€â”€â”€â”€â”˜                                                            â””â”€â”€â”€â”€â”€â”€â”˜
```

Three cable types visible here:
1. `â•â•â•` poly-poly: MIDI-IN poly pitch-out â†’ master VCO v/oct, expanded to (`pitch_i` â†’ `vco_i.voct`) for i=1..4.
2. `â”€â”¬â”€` single-to-poly: MIDI-IN mod-wheel (global single) â†’ master VCO pwm, **duplicated** to all 4 VCOs' pwm.
3. `â•â•â•` poly-poly chained: VCO master audio out â†’ VCA master audio in â†’ mixer poly input. No re-expansion â€” once a signal is poly it stays voice-indexed end-to-end, until it lands on a port that the rack/patch has marked as a fan-in (the mixer's poly input).

### 2.2 Inspector pane on a poly cable

Clicking a `â•â•â•` cable shows:

```
â”Œâ”€ Cable: VCO (master) audio out â†’ VCA (master) audio in â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚   Carries: 4 voices (group "Voice", N=4)                            â”‚
â”‚   Mapping: 1â†”1   (vco_1 â†’ vca_1, vco_2 â†’ vca_2, â€¦)                  â”‚
â”‚   [â–¢ override mapping]   [â–¢ sum to mono]   [â–¢ attenuate per voice] â”‚
â”‚   Source group:  Voice  (master = QuadVCO cell 1)                   â”‚
â”‚   Target group:  Voice  (master = QuadVCA cell 1)                   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

For a `â”€â”¬â”€` (global broadcast) cable:

```
â”Œâ”€ Cable: MIDI-IN mod_wheel â†’ QuadVCO (master) pwm  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚   Carries: 1 signal (global)                                        â”‚
â”‚   Fanout:  â†’ 4 targets (pwm_1, pwm_2, pwm_3, pwm_4)                 â”‚
â”‚   Per-voice trim:  [ same for all â–¾ ]   (or per-voice slider grid)  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 2.3 Conversion-on-the-connection (BO / BI placement)

The user's idea "the dCV â†” aCV conversion belongs on the connection" maps very nicely to the cable inspector. When you draw a cable from an *internal* output (dCV) to an *external* input (aCV), the inspector requires you to pick **which breakout cell** carries the conversion:

```
â”Œâ”€ Cable: ENV out (dCV) â†’ BrandX VCF cutoff (aCV)  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚   Conversion needed: dCV â†’ aCV (12-bit, 0..5 V)                     â”‚
â”‚   Via breakout:   [ 8Ã— CV-Out 12  âŒ„ ]   cell:  [ 3 âŒ„ ]              â”‚
â”‚   Aux trim:       [ âœ“ board-side smoothing (CvSegment) ]            â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

For a **voice-poly** cable that crosses the boundary, the conversion target must be a **poly cell group on a breakout** (e.g. the 4Ã— pitch breakout grouped as "Voice/pitch"). The inspector pre-selects it if exactly one matches; otherwise the user picks.

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

### 3.2 Port flags â€” only event-sources need extra metadata

A normal module's port has no poly/global flag of its own. Whether it is "poly" or "single" follows from cell/group membership at expansion time:

- Port on a module that is NOT in any poly-group â‡’ single.
- Port on a cell that IS in a poly-group â‡’ poly-port of cardinality `group.voiceCount`.

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
  id: string;                 // 'voice', 'drum_sub', â€¦
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

`Patch.voiceCount` stays. New: a patch may **locally override** the rack's grouping for its own connections â€” split an N=8 rack group into 2Ã— N=4, ungroup it entirely to 8Ã— single, etc. The rack definition is untouched and other patches keep using the rack's defaults.

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
  /** When the cable crosses dCVâ†”aCV: which breakout cell-group carries
   *  the conversion, and (for poly cables) which PolyGroup maps voice
   *  index â†’ breakout cell. */
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
//   - all broadcast (global â†’ poly) cables fanned out
//   - all sum (poly â†’ poly-input-marked-as-sum) cables collapsed
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
| dCVâ†”aCV conversion | not addressed | Lives on the cable (`PatchConnection.conversion`), references a breakout cell-group. The BI/BO panel itself shows the analog half in the external rack and the digital half (free) in the internal rack. |
| Brain expansion | brain only sees flattened graph | Both forms supported: brain may receive compact + expand on-device (needed for the touchscreen view), or receive pre-expanded. |
| Forbidden connections | not addressed | `poly-out â†’ single-in` is rejected by the patcher; user must insert an explicit collapse module. |

ADR 0010 is not wrong, but rack-level groups are a better fit for the project: the user thinks about *which physical modules exist N times*, not about *which subgraph repeats*. When ADR 0010 is updated, the "voice stamp" section should be replaced by the `PolyGroup` model from this sketch.

---

## 5. Clarifications & deferred features

### 5.1 Several poly-groups in one rack â€” example

Think: rack has `Voice` (N=4, 4 VCOs masters at cell 1, sub at cell 5 of an 8-VCO) **and** `Drum` (N=3, 3 percussive oscillators). A cable from `MIDI-IN.pitch` to `Voice.master.voct` expands to 4 voices; a cable from `Drum-Trig-Seq.gate` to `Drum.master.gate` expands to 3 voices. The two groups never interact unless you patch between them; the only thing they share is the rack they live in.

The earlier note "cables only need to match group membership, not group id" was sloppy â€” strike it. A cable's two endpoints land on whatever groups they belong to; the *expansion* maps them by cell-index ordering within each group. If the cardinalities differ you fall under the forbidden-connection rule and the patcher refuses the cable.

### 5.2 Voice-count mismatch â€” what to offer the user

Scenario: rack only has an N=4 group; user sets `Patch.voiceCount = 6`. Editor warning. Offered fixes:
 - **(a) clamp** â€” lower `voiceCount` to 4 to match the largest available group.
 - **(b) regroup** â€” auto-build a patch-local override that takes 6 cells from the largest matching cell-pool (only works if the rack has â‰¥ 6 ungrouped compatible cells).
 - **(c) split** â€” opposite case: rack has N=8 group, patch wants N=4. Auto-add `polyOverrides` that partition the N=8 into 2Ã— N=4 (two masters), as you described.

### 5.3 Per-voice trim on a singleâ†’poly broadcast â€” example

Default for a `single-out â†’ poly-in (N=4)` cable: all 4 voices receive the same value of the source (the duplication rule). The inspector can optionally show a *trim grid* â€” N small sliders, default 100% each â€” so the user attenuates the broadcast per voice (voice 3 gets 50% mod, voice 4 gets 25%). Useful for layered patches; safe to defer to v1.5.

### 5.4 Cable routing override / voicePermutation â€” example

Default for a `poly-out (N) â†’ poly-in (N)` cable: voice-indexed 1â†”1. Sometimes the user wants `[3, 1, 2, 4]` â€” voice 3 from the source drives cell 1 of the target, voice 1 drives cell 2, etc. Stored as `PatchConnection.voicePermutation?: number[]`. Defer to v1.5; rare in practice.

### 5.5 Unison mode

User request: "N=8 rack group used in N=1 patch with all 8 cells driven by the same voice". That's a special case of `polyOverrides` where the partition is one group of 8 driven by 1 voice, but each cell keeps independent controls so the user can detune masters individually. Mark as a UI mode on the override; defer the wiring detail to when we actually need it.

### 5.6 Confirmed scope

- Groups live in one rack only.
- A rack may hold any mix of N=2, N=3, N=4, N=8 etc. poly-groups simultaneously.
- BI/BO panels straddle internal + external rack view (digital half is free).
- Multi-modules with shared controls = `CellGroup { controlIds: [] }` + controls at module level. Concrete first example: a planned MMB house-brand `Quad-VCO-Shared` (hardware not built yet â€” first tests will be simulator-only).

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
