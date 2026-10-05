# Patch-front en speelmodus: overdracht

**Datum:** 2026-10-05
**Status:** gebouwd en live op editor.musicbrain.nl (`main` = `0b74898`, deploy-run 110). Firmware-deel (stemtoon `a4`) gebouwd en hostgetest, niet geflasht.
**Ontwerp en besluiten:** [patch-front.md](patch-front.md) (§9 is de besluitenlijst). Dit document is het startpunt voor een volgende chat: wat er staat, waar het zit, waarom het zo is, en wat er nog open ligt.

## Korte conclusie

Een patch heeft nu een **front**: een virtueel paneel met een deel van zijn knoppen en jacks, voor wie wil spelen zonder kabels te zien. Daar omheen is een **speelmodus** gegroeid die op een telefoon werkt: een schermtoetsenbord met wielen, sustain en pedaal, volledig scherm, panic, bewaren, en een persoonlijke stemtoon (A432). Nieuwe gebruikers beginnen met een standaardset van negen patches.

Open zijn: signaalstroom-lijnen op het front (wacht op module-flows), macro's, front naar de Teensy, A/B-morph in de speelmodus, en twee firmwarestappen voor de stemtoon. Zie [Open werk](#open-werk).

## Begrippen

- **Front** (`PatchFront` in `types.ts`): een benoemde, geordende lijst items op een patch. Een item is een control, een jack of een kopje. Waarden staan níét in het front maar in `patch.controlState`: het front is een *view met een beperkte controller* (MVC). Draaien op het front wijzigt de patch.
- **Auto-front**: wat een patch zonder bewaard front laat zien. Wordt elke keer afgeleid (`autoFront`), niet opgeslagen. "Auto bewaren als front" maakt er een bewerkbaar front van.
- **Speelmodus** ("dicht"): alleen front, toetsenbord en een smalle werkbalk. Standaard voor wie de editor opent; "Binnenkijken ▸" opent rack, patcher en de rest, "◂ Speelmodus" gaat terug. Wordt onthouden (`mb.front.open`).
- **Stereopaar**: twee gelijke mono-modules op L en R (zie `findTwin` in `recipe/edits.ts`). Op een front één knop die naar beide schrijft.

## Waar het zit

Alles onder `editor/src/modular-mb/` tenzij anders vermeld.

| Bestand | Wat |
|---|---|
| `types.ts` | `FrontItem`, `PatchFront`, `Patch.fronts`, `pruneFronts` (verwijzingen naar verdwenen modules vallen weg bij laden en bewerken). |
| `setPatchControl.ts` | **Het enige schrijfpad voor een controlwijziging**: poly-fan-out (`polyControlTargets`), live naar de Teensy (`sendControlPoke`), en `controlState`. Patcher, eigenschappenpaneel, control-surface en front gebruiken het allemaal. `{ twins: true }` schrijft ook naar het stereopaar. |
| `fronts.ts` | Pure bewerkingen: toevoegen (bij de eigen module, met kopje als nodig), verwijderen, verplaatsen, bijwerken, `frontIssues`. |
| `frontLayout.ts` | `buildFrontModule` maakt van een front een virtueel `ModuleType` + `ModuleInstance` (raster, tegels per kopje, vrije `pos` in mm). `autoFront` en `rankKnobs` bepalen het automatische front. Heette eerst `frontPanel.ts`; zie [Valkuilen](#valkuilen). |
| `FrontPanel.tsx` | Tekent het front via `ModulePanel`; schikmodus (slepen naar mm); letters ×1,5 op een smal scherm (`textScale`). |
| `FrontTab.tsx` | De Front-tab: frontkeuze, bewerker (naam, uitleg, kolommen, kopjes, label, klein/groot, volgorde), ✨ AI-front, lege start met voorbeelden, het podium voor volledig scherm. |
| `FrontMenu.tsx`, `FrontFields.tsx` | Rechtsklik "Op front zetten" in rack en patcher, en het blok "Front (deze patch)" in de eigenschappen. |
| `frontRecipe.ts` + `recipe/tools.ts` | AI-frontrecept: tools `get_front_candidates` en `propose_front` (ook in de MCP-server), commando `front`. |
| `frontSvg.ts` | Het front als los SVG-bestand, als hoes bij ⤴ Voorstellen naar de pool. |
| `FrontKeys.tsx` | Het toetsenbord onder het front: speelt direct op de engine, start die bij de eerste aanslag. Onthoudt octaaf, schuifstand, bendbereik, lange toetsen. Volledig scherm in twee standen. |
| `sim/ScreenKeys.tsx`, `sim/screenKeysLayout.ts` | Het schermtoetsenbord zelf (ook in de Simulatie-tab): pointer capture per vinger, aanslag uit de plek op de toets, omhoog = aftertouch, opzij = noot wisselen of buigen, wielen, sustain, pedaal, panic. Layout en hit-test zijn puur en getest. |
| `sim/midiInCc.ts` | Welke CC's de MIDI-IN van de patch verwacht (pedaalschuif op `cc1Num`, sustain op 64). |
| `sim/tuning.ts`, `sim/TuningChip.tsx` | Persoonlijke stemtoon: chip "A = …" in de kop, onthouden (`mb.tuning.a4`), naar engine en Teensy. |
| `PatchSelect.tsx` | Patchkeuze met onderaan "Voorbeeld toevoegen" (de standaardset). Speelmodus, Front-tab en volledig scherm gebruiken dezelfde. |
| `PatchSave.tsx` | "● Bewaar" en "Bewaar als…", gedeeld door patcher-kop en speelmodus. |
| `demoSeeds.ts` | De negen voorbeelden en `standardProject()` voor de eerste start (`store.freshStart`). |
| `secureContext.ts` | De oranje melding als de pagina via http op een netwerkadres open staat. |
| `ModularMbApp.tsx` | Speelmodus versus binnenkijken, werkbalk, `ZoomEscape` (⊡-knop als de telefoon ingezoomd is). |
| `ModulePanel.tsx` | Knop: met een vinger draaien als een schroefje (boog om het midden); schuif: grijpvlak en absoluut volgen; niet-passieve `touchstart` tegen meescrollen; `textScale`. |
| `sim/AudioEngine.ts` | `allNotesOff()` (panic), stemtoon-offset op pitch-kabels uit MIDI-IN. |
| `firmware/core/.../MidiIn.{h,cpp}` | Control `a4` (stemtoon), hosttest in `firmware/core/tests/test_midiin.cpp`. |
| `editor/src/filenames.test.ts` | Bewaakt dat geen twee modulenamen in één map alleen in hoofdletters verschillen. |
| `editor/vite.config.https.ts` | `npm run dev:https` (zelfondertekend certificaat). |

In het Imprint-repo (`imprint-engine`, ook op `main`): `plugin-patches` heeft een veld `front` (SVG) en toont het op de patchpagina; `runtime-admin/src/media/cors.ts` laat publieke pools en bestanden zonder token vanaf elk adres lezen.

## Hoe het werkt, in vier regels

1. Een front is data op de patch; het zit in de bewaarcyclus (`recipe/saved.ts`: `fronts` in `SavedFields`), dus "gewijzigd", Bewaar, Terug en undo werken er gewoon op.
2. `buildFrontModule` vertaalt het front naar een gewoon paneel met virtuele id's (`c0`, `p0`, …) en een `map` terug naar `(module, control)`. `ModulePanel` tekent het zonder te weten dat het een front is.
3. Elke draai gaat via `setPatchControl` met `twins: true`. Er is geen tweede schrijfpad.
4. `autoFront` kiest: gelabelde controls, gebonden controls, PADS/FADERS/KNOBS, dan per module in signaalvolgorde (audiopad eerst, dan envelopes, dan LFO's) de best gerangschikte knoppen (`rankKnobs`: catalogus-`playable`, dan afwijkend van standaard, dan karakterschakelaar, dan paneelvolgorde). Bron krijgt drie knoppen, de rest twee; maximaal acht; MIDI-IN overgeslagen; stereoparen één keer.

## Besluiten die je niet opnieuw hoeft te nemen

Uit [patch-front.md §9](patch-front.md#9-besluiten) en de gesprekken met Mark:

- Een patch is een patch: het front is een view, geen kopie, geen eigen waarden.
- Geen macro's in v1. Deelbereik (`range`) mag; één knop die er drie meeneemt is "op het randje" en komt later.
- Raster eerst, vrije plaatsing als optie.
- Speelmodus standaard dicht, keuze onthouden.
- Spelen is ook tweaken en bewaren: Bewaar en Bewaar als in de speelmodus. Terug en A/B blijven achter Binnenkijken. A/B-morph komt later in de speelmodus, als hetzelfde onderdeel uit de patcher (geen eigen variant): "UI-technisch zo doen dat het niet weer ingewikkeld wordt".
- Vuistregel werkbalk speelmodus: patchkeuze, bewaren, Binnenkijken. De rest erachter.
- Stemtoon is persoonlijk (niet van de patch) en wordt uitgevoerd door MIDI-IN.
- Publieke pools zijn publiek: lezen zonder token mag vanaf elk adres; schrijven alleen vanaf de lijst in Imprint.

## Werken op een telefoon

- Geluid en Web MIDI vragen een *secure context*. Op de pc is `http://localhost:5173` goed; een telefoon via `http://192.168.x.x` niet. Gebruik `npm run dev:https` (zie `editor/README.md`, "Telefoon"). Http en https kunnen naast elkaar: `npm run dev:https -- --port 5174`.
- De pool op musicbrain.nl leest vanaf elk adres. Voorstellen en Privé (met token) alleen vanaf de origins in `MUSICBRAIN_MEDIA_CORS_ORIGINS` op de VPS; daar staan Marks dev-adressen (2026-10-05).
- Touch: elk element dat met een vinger bediend wordt heeft `touch-action: none` én een niet-passieve `touchstart` met `preventDefault`. Alleen `touch-action` op een SVG-groep was op Samsung/Chrome niet genoeg. Tik-oplichting staat uit (`-webkit-tap-highlight-color`); dat gaf het "flikkeren".
- Getest in Playwright met Pixel 7 (staand en liggend) en door Mark op een Galaxy S22 Ultra. Scrollgedrag van Chrome is in de emulator niet na te bootsen: touch-wijzigingen moeten op het toestel bevestigd worden.

## Valkuilen

- **Hoofdletters in bestandsnamen.** `frontPanel.ts` naast `FrontPanel.tsx` gaf op Windows en macOS een wit scherm (Vite probeert `.ts` vóór `.tsx`, het bestandssysteem ziet geen verschil). `tsc` vangt dat niet; `filenames.test.ts` wel.
- **Hooks vóór een vroege return** in `FrontTab` (React: "Rendered more hooks"). Nieuwe `useState`/`useRef` boven `if (!patch) return`.
- **De seeds gebruiken `uid` uit de store.** Daarom zet de app de standaardset neer bij de eerste start, niet de store zelf (anders een cirkelimport).
- **Stemtoon in de simulator gaat niet via de wasm.** De engine telt een constant signaal op bij elke pitch-kabel uit MIDI-IN en bij het klavier-gemak; `a4` wordt bewust niet naar de MIDI-IN-wasm gestuurd. Bouw je de wasm opnieuw, laat dat zo, anders telt het dubbel.
- **Niet rebasen op een gedeelde branch.** Bij het eerste mergen naar `main` is deze branch gerebased en geforcepusht; Marks lokale checkout liep daardoor vast in GitHub Desktop. Voortaan fast-forward of een merge-commit.
- **Parallelle shell-aanroepen delen de werkmap.** Gebruik absolute paden, `git -C` en `npm --prefix` als je twee repo's tegelijk aanraakt.

## Testen en controleren

```bash
cd editor && npm test          # ~1115 tests, o.a. fronts, frontLayout, frontRecipe, frontSvg, screenKeysLayout, tuning, contract
npx tsc -b --noEmit && npm run build
python tools/contract_dump.py  # na een firmwarewijziging aan poorten of controls
cd editor && npm run catalog   # doc/module-catalogus.md
python tools/check_md_links.py
# firmware-hosttests (o.a. midiin_a4_…)
cmake -S firmware -B build && cmake --build build --target core_tests && build/core/tests/core_tests
```

Live: een push naar `main` met iets onder `editor/` deployt via de Action "Deploy editor" (zie [editor-deploy.md](../editor-deploy.md)).

## Open werk

| # | Wat | Waar |
|---|---|---|
| 4b | Signaalstroom-lijnen op het front, uit kabels en module-flows | wacht op [module-signaalstroom.md](module-signaalstroom.md) (ED-FL-1) |
| 5 | Macro-knop (mini-morph) | later, besluit §9.2 |
| 7 | Front → bindings en labels op de Teensy bij patchwissel | na control-labels in de firmware |
| §9.8 | A/B-morph in de speelmodus, als hetzelfde onderdeel uit de patcher | later |
| FW-13 | Stemtoon: MIDI-IN-wasm opnieuw bouwen (`tools/mmb-wasm/build.sh midiin`, vraagt wasi-sdk), apparaatinstelling in EEPROM, flashen en stemmen op hardware | [BACKLOG](../BACKLOG.md) |
| — | Hangende noten: de oorzaak is niet gevonden (klavier dat een vinger niet afmeldt, of stemverdeling bij sustain). ⏹ Panic is de pleister. Let bij een volgende melding op of sustain aan stond. | speelmodus |
| — | Werkbalk staand op de telefoon blijft twee regels | speelmodus |
| ED-RX-1 | Reflex: pedaalsimulatie in de effect-switcher, door Mark uitgesteld | [pedaalsimulatie-effect-switcher.md](pedaalsimulatie-effect-switcher.md) |
