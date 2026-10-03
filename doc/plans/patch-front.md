# Patch-front: de black-box-kant van een patch

Datum: 2026-10-03. Status: **voorstel, nog niets gebouwd.** Aanleiding: Mark
laat de editor aan musici zien; de klanken slaan aan, de kabels schrikken af.
Gevraagd: één patch, meerdere "fronts"; een front toont een deelverzameling
van de controls en poorten van de patch. Het rack met kabels blijft de
white-box-kant voor wie ontwerpt; het front is de black-box-kant voor wie
speelt.

## 1. Het idee in één zin

Een **front** is een benoemde, geordende selectie van `(module, control)` en
`(module, poort)` uit een patch, met een eigen label per knop en een eigen
layout. De waarden blijven in `patch.controlState`: een front is een
*gezichtspunt* op de patch, geen kopie van de patch. Alles wat niet op het
front staat is een vaste interne instelling van de black box.

Een patch zonder front krijgt een automatisch front (§5), zodat elke patch,
ook die uit de pool, "dicht" te tonen is.

## 2. Wat er al ligt

Verkend in `editor/src/modular-mb/` (2026-10-03). Niets heet nu front,
macro of performance view; vier bouwstenen komen in de buurt.

| Al gebouwd | Rol voor het front |
|---|---|
| `Patch.controlLabels` (`controlLabels.tsx`, [control-labels.md](control-labels.md)) | vrije tekst per `(module, control)` per patch; dezelfde adressering, dezelfde plek in het schema. Het front-label vult dit aan, of valt erop terug. |
| `midiMap.bindings` (`surfaceBridge.ts`, [control-surface.md](control-surface.md)) | de projectbrede koppeling van CC's aan controls. Een front is daar de per-patch tegenhanger van: uit een front zijn bindings en een Roto-pagina af te leiden. |
| `ModulePanel.tsx` | tekent elk paneel als SVG uit `visual.controlPlacements`. Een front laat zich als *virtueel paneel* door dezelfde component tekenen (§4), zonder de glyphs los te trekken. |
| `polyControlTargets` + `sendControlPoke` + `updateProject` | het schrijfpad voor een controlwijziging (patcher, properties, surface). Het front gebruikt precies dat pad. |
| PADS / FADERS / KNOBS (`tp_mmb_pads`, …) | bedieningsmodules in de patch zelf. Die horen vaak op een front, maar een front vervangt ze niet: een front kan ook de cutoff van het filter zelf tonen. |
| `patchSnapshot` / `addPatchSnapshot` (pool, takes, SysEx) | het `.patch.json`-bestand neemt elk patchveld mee; id's worden bij laden hernoemd via tekstvervanging, dus front-verwijzingen gaan vanzelf mee. |

Geen van deze is een front; samen maken ze het front klein.

## 3. Datamodel

Een optioneel, additief veld op `Patch` (`types.ts`); geen versiesprong,
zoals eerder bij `controlLabels`, `morph` en `folder`.

```json
"fronts": [
  {
    "id": "front_spelen",
    "name": "Spelen",
    "description": "Vier knoppen en de pads; de rest staat vast.",
    "columns": 4,
    "items": [
      { "kind": "group",   "text": "Klank" },
      { "kind": "control", "moduleId": "vcf1",  "controlId": "cutoff",  "label": "Helderheid", "size": "large" },
      { "kind": "control", "moduleId": "env1",  "controlId": "release", "label": "Uitsterven" },
      { "kind": "control", "moduleId": "pads1", "controlId": "b1" },
      { "kind": "group",   "text": "Aansluitingen" },
      { "kind": "port",    "moduleId": "audioin1", "portId": "out_l", "label": "Gitaar" },
      { "kind": "port",    "moduleId": "vcf1",     "portId": "cutoff_cv", "label": "Expressiepedaal" }
    ]
  }
]
```

| Veld | Betekenis |
|---|---|
| `id`, `name`, `description` | naam zoals in de Front-tab; de beschrijving is de uitleg voor de speler ("druk na de aanslag door") |
| `columns` | breedte van het automatische raster (standaard 4); vrije plaatsing is stap 4 |
| `items[]` | geordend; de volgorde is de layout |
| `kind: control` | één `(moduleId, controlId)`; `label` optioneel (valt terug op `controlLabels`, dan op de gedrukte naam); `size` `small`/`large`; optioneel `range: {min, max}` als deelbereik van de knop (de "sweet spot" voor een beginner) |
| `kind: port` | één `(moduleId, portId)`: een jack van de black box, met label en de signaalkleur van de poort |
| `kind: group` | kopje in het raster |

Afgesproken grenzen:

- **Waarden staan niet in het front.** Twee fronts van één patch tonen
  dezelfde cutoff. Wil je twee *klanken*, dan maak je twee patches (dupliceer,
  of A/B); wil je twee *gezichtspunten*, dan maak je twee fronts.
- **Geen macro's in v1.** Eén knop die drie controls draait is een
  mini-morph (`recipe/morph.ts`, `ruleFor`) en vraagt een eigen waarde buiten
  `controlState`. Dat is een logische stap 5, niet de eerste.
- **Poorten blijven de echte poorten.** Kabels verwijzen altijd naar
  `(moduleId, portId)`, ook bij cel-poorten (`<portId>_<n>`). Een front-poort
  is een *bordje* op een bestaande jack, geen alias.
- **Poly:** een control op een poly-master staat op het front als één knop;
  schrijven gaat via `polyControlTargets`, net als overal.
- **Morph-patch:** toont het front van patch A (items verwijzen naar
  modules in hetzelfde rack, dus ze kloppen); eigen fronts op een morph-patch
  staan we niet toe.
- **Saved/dirty (`recipe/saved.ts`):** fronts horen niet bij `SavedFields`,
  net als `controlLabels`: ze veranderen de klank niet.

Onderhoud in het model:

- `normaliseV2` (`types.ts`): items naar verdwenen modules of controls
  wegsnoeien, zoals `pruneOrphanGroups` voor poly-groepen.
- `recipe/edits.ts`: `removeModule` snoeit, `replaceModule` hertargett
  items met gelijke control-id.
- `contract.test.ts`-stijl toets: elk item verwijst naar een bestaande
  `(module, control|poort)` in de seeds.
- Naam: "front", niet "panel"; `panelIO.ts` gebruikt "panel" al voor de
  visual van een moduletype.

## 4. Weergave: het front als virtueel paneel

De kleinste bouwwijze die er precies zo uitziet als de panelen waar mensen
op aanslaan: een `FrontPanel.tsx` dat uit het front een tijdelijke
`ModuleType` + `ModuleInstance` bouwt en die aan het bestaande `ModulePanel`
geeft.

- Elke control krijgt het id `${moduleId}.${controlId}` met de control-
  definitie van de echte module (`resolveControls`), zodat taper, bereik,
  schakelstanden en knoptype kloppen. `range` versmalt `min`/`max`.
- `visual.controlPlacements` komt uit het raster: `columns` kolommen,
  `large` = 20 mm, `small` = 12 mm, groepskopjes als `texts`.
- Poorten komen onderaan als `portPlacements`, met de signaalkleur.
- `controlState` voor het virtuele paneel is een afgeleide view van
  `patch.controlState` plus `liveControls` van de Teensy (zoals
  `PatcherGraphPanel` dat al samenvoegt).
- `onControlChange` splitst het id en loopt het gewone schrijfpad
  (poly-fan-out, `sendControlPoke`, `updateProject`). Dat pad staat nu drie
  keer in de code (`ModuleNode.setControl`, `PropertiesPanel.setControl`,
  `surfaceBridge.applyIncomingCc`); één helper `setPatchControl` eerst, dan
  gebruikt het front hem als vierde.

De simulator hoeft niets te weten: `SimulationPanel` is altijd gemount en
hoort elke wijziging van `controlState`. Ook de Teensy hoeft niets te weten
(§7).

## 5. Automatisch front

Een patch zonder `fronts` krijgt ter plekke een front "Auto" (niet
opgeslagen tot iemand het bewerkt), in deze volgorde:

1. alle controls met een `controlLabels`-tekst;
2. alle controls die in `midiMap.bindings` gebonden zijn;
3. de PADS/FADERS/KNOBS-modules van de patch;
4. aanvullen tot acht knoppen met de eerste knoppen van de modules in
   signaalvolgorde (volgorde zoals ED-PT-2, de signaalpad-view, die later
   ook wil).

Poorten: de onverbonden audio-, CV- en gate-ingangen van de patch en de
uitgangen van een AUDIO IN. Een seed kan zijn front meeleveren; de
Solo ▾/Poly ▾-demo's zijn de eerste kandidaten.

## 6. In de editor

- **Tab "Front"** in `ModularMbApp.tsx`, tussen Patches en Patcher. Boven:
  frontkiezer (één patch, meerdere fronts, "+ Front", "Dupliceer"). Midden:
  het virtuele paneel. Onder: de bediening uit de Simulatie-tab die een
  speler nodig heeft (audio starten, schermtoetsenbord, MIDI-ingang).
- **Spelermodus**: een schakelaar (en `?player=1` in de URL) die de editor
  opent op de Front-tab en de white-box-tabs achter één knop **Binnenkijken**
  zet. `?patch=<slug>&front=<id>` opent een pool-patch meteen dicht.
- **Ontwerpen** gebeurt in het rack en de patcher: rechtsklik op een knop of
  jack → "Op front zetten ▸ <frontnaam>"; in de Front-tab zelf alleen
  volgorde (slepen), label, grootte, groepen en `range`. Zo blijft er één
  plek waar je controls kiest en één plek waar je ze schikt.
- **Mobiel**: het raster met `columns: 2` is al bruikbaar op een telefoon;
  samen met Modlink (ADR 0016) is het front de "modulator-tab" die daar
  nog beloofd is.

## 7. Buiten de editor

- **Patch-pool / musicbrain.nl.** Het `.patch.json` neemt `fronts` mee;
  Imprint hoeft niets aan het schema te doen. Wél nuttig: bij ⤴ Voorstellen
  een `front.svg` (het virtuele paneel als statisch SVG) als asset
  meesturen en op `/patches/<slug>` tonen. Dat is de "hoes" van een patch
  en de eerste indruk voor wie de kabels niet wil zien. Imprint: optioneel
  veld `front` (asset, image) op het contenttype `patch`; klein.
- **Teensy, nu.** Niets: fronts gaan niet mee in `buildConfigPayload`.
- **Teensy, later.** Een front compileert tot `midiMap.bindings` voor de
  actieve patch (de editor stuurt ze bij patchwissel opnieuw in fase 1 van
  het control-surface-plan, zonder firmwarewijziging) en tot het
  `labels`-blok uit [control-labels.md](control-labels.md). Per-patch
  bindings in de firmware zelf zijn een aparte stap (de `MidiMap` is nu
  globaal per config).
- **Reflex.** Een front met audio-poorten is precies wat de
  effect-switcher nodig heeft om een Cortex-patch als "pedaal in een loop"
  te zien; zie [pedaalsimulatie-effect-switcher.md](pedaalsimulatie-effect-switcher.md) §5.

## 8. Stappen

| Stap | Waar | Wat | Grootte |
|---|---|---|---|
| 0 | editor | `setPatchControl`-helper uit de drie bestaande schrijfpaden trekken, met test | klein |
| 1 | editor | `Patch.fronts` + `FrontItem`-types, `normaliseV2`-snoei, `edits.ts`, contract-stijl test, `migrate.test.ts` | klein |
| 2 | editor | `FrontPanel.tsx` (virtueel paneel via `ModulePanel`) + automatisch front (§5) | middel |
| 3 | editor | Tab Front, "Op front zetten" in rack en patcher, label/grootte/volgorde, spelermodus en URL | middel |
| 4 | editor | vrije plaatsing (slepen op mm), `range` | klein |
| 5 | editor | macro-knop (mini-morph) | middel, later |
| 6 | editor + Imprint | `front.svg` bij Voorstellen; veld op het contenttype; tonen op `/patches/<slug>` | klein |
| 7 | editor + fw | front → bindings en labels bij patchwissel | middel, na control-labels fw |

Stap 1 en 2 zijn samen al demonstreerbaar: één seed met een front, de
Front-tab, en de kabels uit beeld.

## 9. Besluiten gevraagd

1. **Waarden in de patch, niet in het front** (§3). Als met "inclusief
   instellingen" bedoeld is dat elk front zijn eigen knopstanden heeft, dan
   is dat een patch-variant, en die hebben we al (dupliceren, A/B, morph).
   Voorstel: front = gezichtspunt.
2. **Raster eerst, vrije plaatsing later** (stap 4). Het raster geeft in
   één keer een bruikbaar front en werkt op een telefoon.
3. **Ontwerpen vanuit rack/patcher, schikken in de Front-tab** (§6), of
   alles in de Front-tab met een zoekveld over alle controls van de patch?
4. **Spelermodus als standaard** voor `?patch=<slug>`-links van de site?
   Dan opent een gedeelde patch altijd dicht, met "Binnenkijken" ernaast.
