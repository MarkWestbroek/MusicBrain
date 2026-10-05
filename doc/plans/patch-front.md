# Patch-front: de black-box-kant van een patch

> **Actueel (2026-10-05):** gebouwd en live, inclusief de speelmodus op de telefoon (toetsenbord, volledig scherm, panic, bewaren, stemtoon). Startpunt voor een volgende chat: [patch-front-handover.md](patch-front-handover.md).
>
> **Bijgewerkt 2026-10-05 (later):** displays en LED's kunnen op een front (een control-item met het id van het display; §3 hoefde er niet voor te veranderen). De knoppenkeuze van het automatische front (§5, punt 4) volgt niet meer `playable` uit de receptcatalogus maar een eigen lijst per moduletype, `editor/src/modular-mb/frontControls.ts`, en vult aan tot acht. De jacks zijn beperkt tot modules die nog geen audio krijgen. Zie de overdracht.

Datum: 2026-10-03. Status: **grotendeels gebouwd** (2026-10-03/04): stap 0 t/m 4 en 6 (datamodel, schrijfhelper, virtueel paneel, automatisch front, Front-tab met bewerker, op front zetten, bewaarcyclus, spelermodus, AI-frontrecept, vrij schikken, hoes voor de pool; zie §8). Open: 4b (signaalstroom-lijnen, na [module-signaalstroom.md](module-signaalstroom.md)), 5 (macro's) en 7 (front → bindings en labels op de Teensy). Aanleiding: Mark
laat de editor aan musici zien; de klanken slaan aan, de kabels schrikken af.
Gevraagd: één patch, meerdere "fronts"; een front toont een deelverzameling
van de controls en poorten van de patch. Het rack met kabels blijft de
white-box-kant voor wie ontwerpt; het front is de black-box-kant voor wie
speelt.

## 1. Het idee in één zin

Een **front** is een benoemde, geordende selectie van `(module, control)` en
`(module, poort)` uit een patch, met een eigen label per knop en een eigen
layout. De waarden blijven in `patch.controlState`: een front is een **view** op
de patch, met de bijbehorende beperkte *controller* (in de zin van MVC),
geen kopie van de patch. Draai je op het front aan een knop, dan is de patch
zelf gewijzigd: die sla je op, zet je op A/B/C/D of morpht je zoals altijd.
Alles wat niet op het front staat is een vaste interne instelling van de
black box.

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

- **Een patch is een patch.** Eén control 0,1 anders is een andere patch.
  Twee fronts van één patch tonen dus dezelfde cutoff; wil je twee *klanken*,
  dan maak je twee patches (dupliceer, A/B, morph), wil je twee *views*, dan
  maak je twee fronts. Morph je tussen A en B, dan zie je op het front de
  knoppen bewegen: hetzelfde mechanisme, minder op je scherm.
- **Alleen views, geen transformaties.** Een `range` die maar een stuk van
  de schaal toont (0,231–0,856, omdat daaronder de toon wegloopt en daarboven
  de resonantie losgaat) is een view: virtuele touwtjes en elastiekjes. Eén
  knop die drie controls in dezelfde richting meeneemt is dat nog net; één
  knop die er één omhoog en twee omlaag draait, of een curve toepast, is een
  CV- of audiotransformatie en hoort in een module. Macro's blijven buiten
  v1 (stap 5) en krijgen nooit een eigen opgeslagen waarde: de stand is
  afgeleid van de echte controls.
- **Poorten blijven de echte poorten.** Kabels verwijzen altijd naar
  `(moduleId, portId)`, ook bij cel-poorten (`<portId>_<n>`). Een front-poort
  is een *bordje* op een bestaande jack, geen alias.
- **Poly:** een control op een poly-master staat op het front als één knop;
  schrijven gaat via `polyControlTargets`, net als overal.
- **Morph-patch:** toont het front van patch A (items verwijzen naar
  modules in hetzelfde rack, dus ze kloppen); eigen fronts op een morph-patch
  staan we niet toe.
- **Saved/dirty (`recipe/saved.ts`):** fronts horen **wél** bij
  `SavedFields` (besluit Mark 2026-10-04: "editen van een front is totdat je
  het opslaat"). Daarmee gelden Bewaar, Terug, Bewaar als en Vergelijk ook
  voor een front, en undo/redo werkt al omdat fronts in het project staan.
  Eerder stond hier het omgekeerde (fronts veranderen de klank niet); dat is
  verlaten omdat de bewerkervaring zwaarder weegt.

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

Een front is geen paneel, maar het *heeft* er een. Dat paneel is virtueel in
de browser, en kan ook echt worden: een fysiek paneel (een Roto-Control, de
KNOBS/FADERS-kaart, of een latere FRONT-kaart met potmeters en display) dat
de onderliggende soft- en hardwaremodules bestuurt. De simulator simuleert
dan dat paneel, zoals hij nu een modulepaneel simuleert. De koppeling van
front-items aan fysieke knoppen loopt via de `midiMap`-bindings uit §7; de
labels op het fysieke paneel via [control-labels.md](control-labels.md).

## 5. Automatisch front

Een patch zonder `fronts` krijgt ter plekke een front "Auto" (niet
opgeslagen tot iemand het bewerkt), in deze volgorde:

1. alle controls met een `controlLabels`-tekst;
2. alle controls die in `midiMap.bindings` gebonden zijn;
3. de PADS/FADERS/KNOBS-modules van de patch;
4. aanvullen tot acht knoppen: per module in signaalvolgorde (volgorde
   zoals ED-PT-2, de signaalpad-view, die later ook wil) een kopje en twee
   knoppen. Welke twee (besluit 2026-10-04): eerst de `playable`-controls
   uit de receptcatalogus (`recipe/catalog.ts`), dan controls die van hun
   standaardwaarde afwijken (bewust gezet), dan de paneelvolgorde. Later:
   de unit-soort uit de flow ([module-signaalstroom.md](module-signaalstroom.md))
   en een AI-frontrecept.

Poorten: de onverbonden audio-, CV- en gate-ingangen van de patch en de
uitgangen van een AUDIO IN. Een seed kan zijn front meeleveren; de
Solo ▾/Poly ▾-demo's zijn de eerste kandidaten.

## 6. In de editor

- **Tab "Front"** in `ModularMbApp.tsx`, tussen Patches en Patcher. Boven:
  frontkiezer (één patch, meerdere fronts, "+ Front", "Dupliceer"). Midden:
  het virtuele paneel. Onder: de bediening uit de Simulatie-tab die een
  speler nodig heeft (audio starten, schermtoetsenbord, MIDI-ingang).
- **Spelermodus**: de editor opent op de Front-tab met de white-box-tabs
  achter één knop **Binnenkijken**. Dat is de standaard voor
  `?patch=<slug>`-links (optioneel `&front=<id>`) en voor wie niet is
  ingelogd. Binnenkijken mag altijd; de laatste keuze (open of dicht) wordt
  onthouden, in de browser en later per gebruiker.
- **Ontwerpen** begint automatisch: de ontwerper kiest de grootte van het
  front (kolommen, rijen) en het aantal controls, en de editor verzint het
  front, deterministisch (§5) of met de optionele AI-laag die er voor
  recepten al is ([patch-recept.md](patch-recept.md),
  [recept-tools-en-mcp.md](recept-tools-en-mcp.md)): een "front-recept" dat
  uit de patch en de signaalstroom een logisch en mooi front voorstelt.
  Daarna bijwerken: rechtsklik op een knop of jack in rack of patcher →
  "Op front zetten ▸ <frontnaam>"; in de Front-tab zelf volgorde (slepen),
  label, grootte, groepen en `range`.
- **Signaalstroom op het front.** Het front is geen betekenisloze
  achtergrond zoals een modulepaneel, maar kent de flow: lijntjes tussen de
  knoppen die het signaalpad verkorten, zoals op een ouderwetse of een
  moderne eenvoudige synth. Die lijnen zijn een *afgeleide graaf*: de kabels
  van de patch plus de interne signaalstroom van elke module. Die interne
  kennis is er nu niet; daarvoor is [module-signaalstroom.md](module-signaalstroom.md)
  (een klein blokschema per moduletype in het contract). Zonder die flows
  valt het front terug op knoppen zonder lijnen. Een front blijft een view:
  de graaf tekent, hij rekent niet.
- **Mobiel**: het paneel schaalt mee op een smal scherm, en onder het front
  staat een schermtoetsenbord dat op een telefoon werkt (gebouwd
  2026-10-04): het toetsengebied schuift of zoomt de pagina niet
  (`touch-action: none`), geen tekstselectie of lang-druk-menu, één noot per
  vinger, glijden wisselt de noot, aanslag uit de plek op de toets. Samen
  met Modlink (ADR 0016) is het front de "modulator-tab" die daar nog
  beloofd is.

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
| 0 | editor | `setPatchControl`-helper uit de drie bestaande schrijfpaden trekken, met test | klein, **gebouwd 2026-10-03** |
| 1 | editor | `Patch.fronts` + `FrontItem`-types, `normaliseV2`-snoei, `edits.ts`, contract-stijl test (`fronts.test.ts`) | klein, **gebouwd 2026-10-03** |
| 2 | editor | `FrontPanel.tsx` (virtueel paneel via `ModulePanel`) + automatisch front (§5) | middel, **gebouwd 2026-10-03** (plus een eerste Front-tab met frontkiezer, "Auto bewaren als front" en "Front verwijderen") |
| 3 | editor | "Op front zetten" in rack en patcher, label/grootte/volgorde in de Front-tab, `fronts` in `SavedFields`, spelermodus en URL | middel, **gebouwd 2026-10-04** |
| 3b | editor | **gebouwd 2026-10-04.** AI-frontrecept als terugval (besluit 2026-10-04): deterministisch eerst (`autoFront` met grootte en aantal als invoer), knop "✨ AI" via de bestaande LLM-laag van de recepten (`recipe/llm.ts`, providers en bring-your-own-key) met één nieuwe tool `propose_front` die de patch-samenvatting, de controls met hun `rankKnobs`-rang en de gewenste grootte krijgt en een front in dezelfde JSON-vorm teruggeeft; het voorstel landt als gewone bewerking (undo, bewaarcyclus), de ontwerper schaaft bij tot het goed is | middel |
| 4 | editor | vrije plaatsing (slepen op mm), `range` | klein, **gebouwd 2026-10-04** (`pos` per item, schiklaag in de Front-tab; `range` zat al in stap 2) |
| 4b | editor | signaalstroom-lijnen uit kabels + module-flows (na [module-signaalstroom.md](module-signaalstroom.md) stap 5); front-recept (AI of deterministisch) met grootte en aantal als invoer | middel |
| 5 | editor | macro-knop (mini-morph) | middel, later |
| 6 | editor + Imprint | `front.svg` bij Voorstellen; veld op het contenttype; tonen op `/patches/<slug>` | klein, **gebouwd 2026-10-04** |
| 7 | editor + fw | front → bindings en labels bij patchwissel | middel, na control-labels fw |
| S1 | editor | speelmodus: schermtoetsenbord (aanslag, aftertouch, buigen, wielen, sustain, pedaal), standaardset en voorbeelden in de patchkeuze, Bewaar/Bewaar als | **gebouwd 2026-10-04/05** |
| S2 | editor | telefoon: draaien als een schroefje, grijpbare schuiven, grotere letters, volledig scherm in twee standen, ⊡ uit de zoom, ⏹ panic, `dev:https` | **gebouwd 2026-10-05** |
| S3 | editor + fw | stemtoon A4 (A432): MIDI-IN `a4`, persoonlijke chip in de kop | **gebouwd 2026-10-05**; wasm, EEPROM en flashen open (FW-13) |

Stap 1 en 2 zijn samen al demonstreerbaar: één seed met een front, de
Front-tab, en de kabels uit beeld.

## 9. Besluiten

Opmerkingen van Mark bij het lezen, 2026-10-03, verwerkt in §1, §3, §4 en §6:

1. **Front = view + beperkte controller (MVC).** Een patch is een patch;
   wijzigen via het front wijzigt de patch. Afgehandeld: §1 en §3.
2. **Geen macro's in v1; alleen views.** Deelbereik van een knop is een
   view; één knop die er drie gelijk meeneemt is op het randje; omkeren of
   curven is een module. Afgehandeld: §3.
3. **Een front is geen paneel maar heeft er een**, virtueel of echt; de
   simulator simuleert dat paneel. Afgehandeld: §4.
4. **Ontwerpen automatisch**, met grootte en aantal controls als keuze van de
   ontwerper, deterministisch of met AI; en met de signaalstroom als lijnen
   op het front. Afgehandeld: §6, en het nieuwe voorstel
   [module-signaalstroom.md](module-signaalstroom.md).

Besloten (Mark, 2026-10-03, tweede ronde):

5. **Raster eerst**, vrije plaatsing in stap 4.
6. **Standaard dicht.** Een `?patch=<slug>`-link opent in de spelermodus;
   zonder login ben je per definitie geen expert, dus dicht. Open maken mag
   altijd. Open of dicht wordt onthouden (in de browser; per gebruiker zodra
   er logins zijn): wie opent, blijft open; wie sluit, blijft dicht.
7. **Ontwerpen** zoals in §6: automatisch beginnen, bijwerken vanuit rack en
   patcher, schikken in de Front-tab.

Besloten (Mark, 2026-10-04, bij het spelen):

8. **Spelen is ook tweaken en bewaren.** De spelermodus krijgt daarom
   "● Bewaar" (alleen zichtbaar als er iets gewijzigd is) en "Bewaar als…",
   dezelfde knoppen als in de patcher-kop (`PatchSave.tsx`, één
   implementatie). Terug naar bewaard en de A/B-vergelijking blijven in de
   editor. **Later, niet nu:** de A/B-morph-truc (twee standen, één schuif)
   ook in de spelermodus; dan als hetzelfde `CompareSlots`/`MorphPanel`
   uit de patcher en niet als een eigen variant, zodat de spelermodus niet
   opnieuw ingewikkeld wordt. Vuistregel voor de werkbalk: patchkeuze,
   bewaren, Binnenkijken; de rest zit achter Binnenkijken.
9. **Een item komt bij zijn module.** "Op het front zetten" plaatst een
   knop na de laatste knop van dezelfde module (of met een eigen kopje vóór
   de jacks), niet achteraan in de laatste tegel.
