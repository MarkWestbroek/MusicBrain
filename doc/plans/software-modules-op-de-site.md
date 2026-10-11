# Software-modules op de site (voorstel, 2026-10-11)

Mark: "We hebben de (geplande) hardware vrij uitgebreid op de website
beschreven en getoond. We zouden de software achter de modules ook kunnen
beschrijven. Modules zijn componenten: we hebben hardware-modules en
software-modules."

Ter review. Geen code gebouwd.

> **Besluiten (Mark, 2026-10-11):** 1 ja, eerst de 42 uit de standaardset;
> 2 per module, met een overzicht per familie; 3 Engels (Imprint heeft nog
> geen meertaligheid; "moet snel"): de Nederlandse teksten bewaren we ernaast
> om mee te sturen zodra dat er is. 4 **geen zelf gerenderd geluid**
> ("automatische muziekjes zijn tot nu toe te technisch van aard; elke module
> inspireert tot andere timing, noten, sfeer"): wel zoeken naar een take van
> Mark waarin de module zit (§3a). 5 **ja, rekentijd tonen** (§3b).

## 1. Wat er al is

- **De pijplijn** ([site-publicatie-werkwijze.md](../site-publicatie-werkwijze.md)):
  een **component** met versies, een **spec** per versie (tekstsecties en
  afbeeldingen, via `POST /api/ingest/board-spec`), een **product** dat
  componenten bundelt, en **releases** die versies pinnen.
- **Software-componenten** bestaan al: `editor-reflex` en `editor-cortex`, met
  `kind: software` ([imprint-fr-component-kind.md](../imprint-fr-component-kind.md)),
  gepubliceerd met `hardware/kicad-generators/publish_software.py`. De
  componentpagina zegt dan "Software v…" in plaats van "Board v…".
- **De gegevens per module** liggen al machinaal klaar:
  - poorten en knoppen uit het firmwarecontract
    (`firmware/app-modular-brain/contract/module-types.json`);
  - de uitleg (`notes`) en de familie uit `seedModules.ts`;
  - een korte uitleg en een regel per knop, Nederlands én Engels
    (`moduleHelp.ts`, 42 modules);
  - de voorbeeldpatches waarin een module voorkomt;
  - of hij in de browser draait (`simSupport.ts`);
  - alles samen al als [module-catalogus.md](../module-catalogus.md).
- **Afbeeldingen**: het paneel van een module is als SVG te renderen
  (`ModulePanel`, zoals `frontSvg.ts` dat voor fronts doet).
- **Rekentijd op de Teensy**: het commando `bench` (fw 0.5.107) geeft klokcycli
  per sample.

## 2. Het model

- **Eén component per software-module**, `kind: software`, slug naar het
  type: `tp_mmb_ladder` → `sw-ladder` (leesbaar, zonder `tp_mmb_`).
- **Versie = de firmwareversie** waarin de module het laatst veranderde
  (uit de release-log of `git log` op de kern), bijvoorbeeld `v0.5.107`. Bij
  een nieuwe firmware alleen opnieuw publiceren wat echt veranderde.
- **De relatie met de hardware**: een component `musicbrain-firmware`
  (software) met de modules als `children`; het Brain-bord (hardware) draait
  die firmware. Waar een hardware-module een software-tegenhanger heeft (de
  analoge vcf8-kern en een VCF in software), kan de pagina naar elkaar
  verwijzen.
- **Producten**: Cortex bundelt het bord, de firmware en de editor; de
  modules komen via de firmware mee.

## 3. Wat er op een modulepagina staat

Gegenereerd, niet met de hand geschreven:

| Sectie | Bron |
|---|---|
| Afbeelding (renderTop) | het paneel als PNG/SVG |
| Tweede afbeelding (overview) | een front uit een voorbeeldpatch, of een spectrum/klankbeeld |
| **Overview** | de korte uitleg (`moduleHelp` EN), daarna de lange (`notes`, vertaald) |
| **Controls** | tabel: knop, bereik, standaard, uitlegregel (EN) |
| **Ports** | tabel: in/uit, soort (audio/cv/gate), betekenis |
| **How it works** | het algoritme in een paar zinnen (bv. "Huovilainen ladder, 4× oversampled, soft limiter") |
| **Sources & licences** | bronnen en licenties (MI-ports MIT, Teensy Audio Library MIT, eigen werk; de artikelen, zoals bij ADAA en de Ladder) |
| **Runs on** | Teensy (met cpu per exemplaar uit `bench`) en de browser (wasm) |
| **Try it** | link naar de editor met een voorbeeldpatch (`editor.musicbrain.nl/?patch=…`) |
| **Versions** | wat er per firmwareversie veranderde (uit de release-log) |

### Familie

Elk moduletype heeft een `categoryId`: `effect` (37), `vco` (35), `utility`
(17), `vcf` (7), `sequencer` (7), `envelope` (5), `drum` (5), `lfo` (4), `vca`
(3), `noise` (1), plus `mixer`, `midiRouter` en `custom`. De catalogus deelt
er al op in, met een uitleg per familie (`FAMILIE_UITLEG` in
`editor/scripts/moduleCatalog.ts`, Nederlands; komt in het Engels bij).
`vco` en `effect` zijn breed (onder `vco` staan ook e-piano, orgel en CMI).
Eerst `categoryId` zoals het is; een fijnere indeling (oscillators /
instruments / samplers / physical models; delay / reverb / modulation /
dynamics / distortion) kan later als tweede veld, zonder iets aan patches te
veranderen.

### 3a. Geluid: Marks eigen takes

Geen gerenderde demo's. Een take is wav + mid + patch.json (⏺ Opname in de
editor; op de site in de media-library, zie [patch-pool.md](patch-pool.md)); de patch.json zegt welke modules
erin zitten. De generator zoekt per module de takes waarin hij voorkomt
(lokaal: de takes-map en Downloads; op de site: de media-library van Imprint,
`group` = take-id) en zet de beste als luisterfragment op de pagina, of geeft
een lijst waaruit Mark kiest. Geen take = geen geluid op die pagina. Wat "de
beste" is, beslist Mark (een kleine keuzelijst `site-takes.json`: module →
take).

### 3b. Rekentijd op de Teensy

Per module de cpu per exemplaar op de Teensy 4.1, gemeten, niet geschat.
Generiek, zonder per kern code te schrijven: per moduletype een minimale
config (een VCO in de module, de module naar OUT) naar de Teensy sturen,
`getStatus` uitlezen en de basis (zonder de module) aftrekken; zoals op
2026-10-11 met een los meetscript gedaan (komt als `tools/teensy-live/module_cpu.py`). Het getal krijgt de
firmwareversie erbij ("~8 % per voice, fw 0.5.107"), zodat duidelijk is dat
het per versie kan veranderen. Opnieuw meten bij elke firmware die een kern
raakt.

## 4. De pijplijn

- Een generator (`editor/scripts/moduleSite.ts`, naast `moduleCatalog.ts`)
  schrijft per module een map met `module.md` (de secties hierboven),
  `beschrijving.txt` en de afbeeldingen. De editorcode zit daar, dus de
  generator ook.
- `publish_software.py` (of een variant `publish_modules.py` die een hele map
  in één keer doet) post ze, eerst naar de lokale Imprint
  (`IMPRINT_BASE=http://localhost:3000`), dan live.
- Draait na `npm run catalog`, dus na elke modulewijziging in de vaste
  volgorde van CLAUDE.md.

## 5. Wat we waarschijnlijk van Imprint nodig hebben

Als feature request, pas na jouw akkoord op dit plan:

1. **Een overzicht van software-modules per familie** (VCO, filters,
   effecten, …): een lijst- of rasterpagina, gefilterd op `kind: software`
   en een familieveld.
2. **Een geluidsfragment als asset**, of een verwijzing naar een take in de
   media-library (§3a), zodat een modulepagina kan laten horen wat hij doet.
3. Eventueel **een eigen soort `module`** naast `software`, als een module
   anders getoond moet worden dan een editor. Waarschijnlijk niet nodig.

## 6. Besluiten voor Mark

1. **Welke modules?** Alle 118 typen, of eerst een selectie: de modules uit
   de standaardset (42, die hebben al Engelse uitleg) en de klassiekers?
   **Voorstel:** eerst die 42; interne en diagnosemodules nooit.
2. **Eén pagina per module, of per familie** (één pagina "Filters" met de
   Ladder, MS-20, SEM, …)? **Voorstel:** per module, met een familieoverzicht
   via Imprint (5.1).
3. **Taal:** Engels, zoals de rest van de site. De lange uitleg (`notes`) is
   nu Nederlands en moet vertaald worden. Wie doet dat: ik, eenmalig per
   module, en bewaard naast de Nederlandse tekst?
4. ~~Geluid op de pagina~~: besloten, Marks eigen takes (§3a).
5. ~~Rekentijd tonen~~: besloten, ja (§3b).
