# Programma's in Elements (voorstel 2026-10-12)

Mark: "Ik zou in Elements wel een program bank willen, zoals op de DX7. Dus
binnen de patch een stapeltje programs. Het botst een beetje met de patches,
maar knoppen verzetten op één module voelt iets minder als een andere patch
maken."

> **Besluiten (Mark, 2026-10-12):** 1 bank **per module**, en ook te kiezen
> via het menu (zoals de DX7); 2 kiezen laat **Coarse, Fine en Level staan**;
> 3 de 19 programma's **eerst samen beluisteren** (9–19 een naam geven);
> 4 de **VCV-importeur: zeker**.

Ter review; niets gebouwd. Eerst de werkwijze, dan de techniek.

## 1. De werkwijze

- Elke Elements in een patch heeft een **bank**: een genummerde lijst van
  **programma's**, elk met een naam en de stand van alle knoppen van de module
  (niet de kabels, niet de andere modules).
- **Kiezen**: op het paneel en op het front een keuze met ◀ ▶ en de naam, zoals
  Bank/Program bij de DX7. Kiezen zet de knoppen; daarna draai je gewoon verder.
- **Bewaren**: knop **Bewaar** overschrijft het gekozen programma; **Bewaar als
  nieuw** zet het achteraan (met een naam). Zolang je na het kiezen niets
  bewaart, toont de naam een `*` (gewijzigd), zoals de Bewaar-knop van een patch.
- **MIDI Program Change** kiest een programma, zoals op de losse 5× Elements.
  CC 102 (≥ 64) = bewaar als nieuw, ook zoals toen.
- **De patch** bewaart de bank en welk programma gekozen is. Een patch blijft
  dus "dit instrument met deze kabels"; de programma's zijn de klanken ervan.
- **Meerdere Elements** in één patch (of een PolyGroup ×5): één bank per
  module; bij een PolyGroup één bank voor alle stemmen (zoals de 5× Elements).

## 2. Waar de programma's vandaan komen

1. **De 19 programma's van de losse 5× Elements** (gered 2026-10-12,
   `sounds/Elements/5x-elements-programs.json`): direct als eerste bank, met
   hun namen ("short", "mandolin", "woody", …). De velden passen één op één op
   onze knoppen; FM en de toenmalige reverb vallen af (die waren 0 en
   onveranderd).
2. **Online**: het origineel heeft geen geheugen, dus er bestaan geen
   fabrieksprogramma's. Wel:
   - **VCV Rack-patches** met *Audible Instruments Modal Synthesizer* (de
     officiële port van Elements) op patchstorage.com. Een `.vcv`-bestand is
     JSON met de knopstanden per module: een importeur kan die als programma
     inlezen (stap 4). Veel patches, wisselende kwaliteit; licentie per patch
     nagaan.
   - Een betaalde pack van 100 presets (Ko-fi, derde partij); alleen met
     toestemming.
   - De handleiding beschrijft per knop wat hij doet, geen kant-en-klare
     klanken.
3. **Zelf**: een paar duidelijke klanken (marimba, fluit, gestreken snaar,
   klok, gong) als **fabrieksbank** in de code, met de handleiding als gids.

## 3. Techniek

- **Opslag**: `patch.moduleData[moduleId].programs = { bank: [{ name, values }],
  current }`, zoals het Page 4-profiel van de CMI. `values` = alle
  knop-ids van `tp_mmb_elements` (ook de attenuverters).
- **Kiezen** schrijft de waarden via `setPatchControl` (het ene schrijfpad):
  poly-uitwaaiering, Teensy en undo komen vanzelf mee. Eén ongedaan-maken-stap
  per keuze.
- **Paneel en front**: een display met de naam (`lookup` op het programma) en
  ◀ ▶; op het front komt hij vanzelf mee (naamdisplay bij zijn knop).
- **Program Change**: de editor vangt PC op van de MIDI-ingang van de patch;
  op de Teensy zonder editor (later) zou de firmware de bank moeten kennen:
  dan gaat de bank mee in de config, zoals de CMI-golfvormen.
- **Generiek**: hetzelfde mechanisme past op elke module met veel knoppen
  (Rings, Plaits, Synthex, MIXTUR). Eerst Elements; de code zo schrijven dat
  een tweede module alleen een regel kost.

## 4. Stappen

1. Bank in `moduleData`, kiezen/bewaren in de editor, display + ◀ ▶ op paneel
   en front, de 19 programma's als eerste bank in de Elements-seeds.
2. MIDI Program Change en CC 102.
3. Fabrieksbank (een handvol eigen klanken).
4. Importeur voor `.vcv`-patches (Modal Synthesizer).
5. (Later) bank op de Teensy, voor spelen zonder editor.

## 5. Vragen voor Mark

1. **Per module of per patch?** Voorstel: per module (zoals de DX7-bank).
2. **Bij kiezen**: alle knoppen, of de stemming (Coarse/Fine) en Level laten
   staan? Voorstel: stemming en Level laten staan.
3. **De 19 programma's**: als ze zijn, of eerst samen naar luisteren en een
   paar hernoemen (9–19 hebben geen naam)?
4. **VCV-import** (stap 4): de moeite waard?
