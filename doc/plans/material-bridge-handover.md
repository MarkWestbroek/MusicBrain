# Material Bridge: overdracht en vervolg

**Datum:** 2026-10-01

**Status:** werkend onderzoeksinstrument; browser- en Teensy-code gebouwd, nog niet op hardware geflasht.
**Hoofddocument:** [State-Graph Synthesis](state-graph-synthesis.md)

Dit document is het startpunt voor een volgende chat. Het beschrijft wat Material Bridge is, waar de code staat, wat aantoonbaar werkt, wat nog niet is aangetoond en welke vervolgstappen het meeste informatie opleveren.

## Korte conclusie

De huidige bouwfase is **compleet genoeg om te beoordelen**. Er is een gedeelde DSP-kern voor browser en Teensy, een bespeelbare module, een zelfspelende demo, een reproduceerbare A/B-renderer, CV-besturing en automatische verificatie.

Het onderzoek zelf is nog niet compleet. We weten dat Memory het signaal meetbaar verandert, maar nog niet of een muzikant het materiaalgeheugen blind herkent, leert voorspellen en doelbewust gebruikt. Ook zijn stemming, CPU-belasting en triggertiming nog niet op een echte Teensy gemeten.

Voeg daarom niet meteen meer resonatoren, polyfonie of een vrije graafeditor toe. De eerstvolgende winst zit in luisteren, meten en pas daarna gericht uitbreiden.

## Wat is Material Bridge?

Material Bridge is een compact state-graph-instrument met vier gekoppelde resonatoren. `Hit A` en `Hit B` slaan de twee uiteinden aan. Energie beweegt via drie passieve koppelingen door het model en twee pickups leveren stereo-uitvoer.

Bij hard of herhaald spelen loopt `Stress` op. Met `Memory` ingeschakeld verzwakt de middelste brug tijdelijk en neemt de demping toe. Onder een lage stressdrempel herstelt het contact. Dit levert hysterese: dezelfde actuele aanslag kan anders klinken door wat er vlak daarvoor gebeurde.

Belangrijke grenzen:

- De energie-uitwisseling is passief en begrensd; Couple-CV maakt geen energie uit het niets.
- Pickup kiest alleen een luisterpositie en belast het model niet.
- V/Oct stemt de losse resonatoren; koppeling kan de gehoorde modi verschuiven.
- Reset wist resonatorenergie en stress onmiddellijk en kan daardoor klikken.
- De browser leest CV samplegewijs. Teensy neemt CV en gates eenmaal per audioblok van 128 samples over. Gebruik op hardware gates van minstens 5 ms.

## Zo is het te horen

### Live demonstratie

1. Open de editor op `http://127.0.0.1:5175/`.
2. Kies **Solo > Material Bridge demo (2:3)**.
3. Start **Sim**.
4. Wissel bij Patches tussen `Material Bridge demo - Memory aan` en `Material Bridge demo - Memory uit`.

De live varianten zijn handig om controls en kabels te proberen, maar vormen geen eerlijke A/B: patchwisselen reset de toestand niet gegarandeerd en de uitgangsniveaus zijn niet gematcht.

De editor bewaart het project in `localStorage`. Een commit voegt daarom geen demo toe aan een reeds opgeslagen project. Het menu-item verschijnt na hot reload of herladen; pas de keuze **Material Bridge demo (2:3)** maakt het rack en de twee patches. **Internals** voert `seedInternals()` uit en werkt bestaande interne moduledefinities en panelen bij zonder patches te wissen.

### Gecontroleerde A/B

De gecontroleerde takes staan in:

- `editor/public/material-bridge-ab/memory-on.wav`
- `editor/public/material-bridge-ab/memory-off.wav`
- `editor/public/material-bridge-ab/report.json`

Via de editorserver zijn de WAV's bereikbaar onder `/material-bridge-ab/memory-on.wav` en `/material-bridge-ab/memory-off.wav`. Opnieuw genereren vanuit de repositoryroot:

```powershell
node tools/mmb-wasm/render-material-bridge.mjs editor/public/material-bridge-ab
```

De renderer gebruikt de echte SEQ-16-wasm en Material Bridge-wasm. Beide takes krijgen exact dezelfde gates en velocitysamples, beginnen met nieuwe module-instanties en worden met een constante gain per hele take op dezelfde stereo-RMS gebracht. Er is geen normalisatie per aanslag, limiter of compressor.

## Demonstratie-instellingen

| Onderdeel | Instelling |
|---|---|
| Ritme A | 2 Hz, gate 0,1, lengte 8, naar Hit A |
| Ritme B | 3 Hz, gate 0,1, lengte 8, naar Hit B |
| Velocity | SEQ A CV; patroon 0,25 / 1 / 0,417 / 1 / 0,25 / 0,75 / 1 / 0,333 |
| Toonhoogte | vaste C3; Pitch -12 en geen V/Oct-kabel |
| Materiaal | Spread 0,12; Couple 0,65; Decay 4 s; Recover 2 s |
| Pickups/uitvoer | Pickup 0,25; Level 0,8 |
| A/B-verschil | uitsluitend Memory 0,85 tegenover Memory 0 |

De opname duurt 20 seconden. De eerste 12 seconden bevatten aanslagen; daarna kan het materiaal acht seconden herstellen. Er zijn 24 aanslagen op A en 37 op B. Alle gates zijn langer dan 5 ms.

## Gemeten resultaten

| Meting | Memory 0,85 | Memory 0 |
|---|---:|---:|
| Ruwe stereo-RMS | 0,0407194 | 0,0977310 |
| Vaste gain voor hele take | 2,362670 | 0,984401 |
| Gematchte stereo-RMS | 0,0962065 | 0,0962065 |
| Gematchte piek | 0,900000 | 0,503576 |
| Maximale Stress | 0,978874 | 0,999967 |
| Stress na 20 s | 0,013427 | 0,018319 |

De renderer controleert dat de Memory-aan-uitvoering sample voor sample reproduceerbaar is, de audio eindig en begrensd blijft, gates lang genoeg zijn, Stress oploopt en weer herstelt en RMS-matching na PCM16-kwantisatie minder dan 0,01 dB afwijkt.

Dit is **geen** perceptuele LUFS-matching en geen blinde luistertest. Het grote verschil in benodigde gain toont dat Memory de totale energie en uitklank sterk verandert. Nog onbeantwoord is of de resterende klank- en aanslagverschillen na matching muzikaal herkenbaar en bruikbaar zijn.

## Bediening en contract

Controls: `pitch`, `spread`, `coupling`, `decay`, `memory`, `recovery`, `pickup`, `level`.

Ingangen: `in`, `voct`, `gate`, `gate_b`, `vel`, `reset`, `coupling_cv`, `pickup_cv`. Uitgangen: `out_l`, `out_r`, `stress`.

Voor Couple en Pickup geldt:

```text
effectieve doelwaarde = clamp(knop + CV, 0, 1)
```

Negatieve CV moduleert omlaag. Een ontbrekende kabel, NaN of Infinity betekent nul modulatie. Loskoppelen keert vloeiend terug naar de knopstand. De gedeelde DSP-kern gebruikt een eerste-ordefilter met een tijdconstante van 10 ms. De eerste sample van een nieuwe instantie neemt de ingestelde waarde direct over. Gates, reset en pitch krijgen geen smoothing of impliciet portamento.

## Implementatiekaart

| Onderdeel | Bestand |
|---|---|
| Gedeelde DSP-kern | `firmware/lib/mmb-dsp/mmb_dsp/material_bridge.h` |
| Teensy AudioStream-wrapper | `firmware/app-modular-brain/src/MaterialBridgeModule.h` |
| Gegenereerd firmwarecontract | `firmware/app-modular-brain/contract/module-types.json` |
| Browser-wasm-wrapper | `tools/mmb-wasm/materialbridge_wasm.cc` |
| Gebouwde wasm | `editor/public/wasm/tp_mmb_material_bridge.wasm` |
| C++-invariantentest | `tools/mmb-wasm/bitcheck/materialbridge_check.cc` |
| Paneel, solo- en demoseed | `editor/src/modular-mb/seedModules.ts` |
| Menu-ingang | `editor/src/modular-mb/ModularMbApp.tsx` |
| Contract-/seedtests | `editor/src/modular-mb/contract.test.ts` |
| Wasm-gedragstests | `editor/src/modular-mb/sim/wasmPorts.test.ts` |
| A/B-renderer | `tools/mmb-wasm/render-material-bridge.mjs` |
| Model en ontwerpbesluiten | `doc/plans/state-graph-synthesis.md` |

De kernel bevat 156 bytes toestand, gebruikt geen heap en bewaart geen samplebuffers. De wasm is 66.007 bytes. `MaterialBridgeStream` past controls alleen aan het begin van een Teensy-audioblok toe. AudioStream-objecten mogen tijdens live gebruik niet worden vernietigd; `onRetire` zet de stream stil en `onReuse` activeert hem opnieuw.

## Reproduceren en valideren

```powershell
& 'C:\Program Files\Git\bin\bash.exe' tools/mmb-wasm/build.sh materialbridge
& 'C:\Program Files\Git\bin\bash.exe' tools/mmb-wasm/bitcheck/check.sh materialbridge
python tools/contract_dump.py
editor/node_modules/.bin/vitest.cmd run --root editor src/modular-mb/contract.test.ts src/modular-mb/sim/wasmPorts.test.ts
npm --prefix editor run typecheck
npm --prefix editor run build
.\.venv\Scripts\pio.exe run -d firmware\app-modular-brain
node tools/mmb-wasm/render-material-bridge.mjs editor/public/material-bridge-ab
```

Laatst vastgelegde uitkomst:

- 300 contract- en wasm-tests geslaagd.
- C++-invarianten geslaagd op 32/44,1/48/96 kHz en bij blokken van 32/128.
- Passiviteit tijdens CV-sprongen, 10-ms-smoothingcurve, hysterese, herstel, energielimiet, directe gate/reset en ongeldige waarden zijn getoetst.
- TypeScript-check, editorbuild en PlatformIO Teensy 4.1-build geslaagd.
- Headless Chromium: demo via echte klikken gestart, AudioContext draaide, uitgangspiek circa 0,055 en geen JavaScript-fouten.
- Paneellabels en CV-kabels gecontroleerd bij 1440x1000 en 390x844.
- Niet geflasht; geen echte hardware-CPU-, latency- of duurmeting.

Let op: de werkboom bevat gelijktijdig wijzigingen van andere chats. Revert of stage geen onbekende bestanden. De Material Bridge-vervolgwijzigingen zijn op het moment van deze overdracht nog niet als aparte commit vastgelegd.

## Aanbevolen vervolgstappen

### 1. Blinde luisterproef en decay-controle

Dit is de belangrijkste volgende stap en vereist weinig nieuwe DSP-code. Maak naast Memory 0 en 0,85 een derde take met Memory 0 en een kortere Decay, zodanig dat de totale energie of uitsterftijd ongeveer overeenkomt met Memory 0,85. Randomiseer de bestandsnamen of afspeelvolgorde en laat meerdere rondes beoordelen zonder te tonen welke versie speelt.

Vragen:

- Is Memory beter te herkennen dan toeval?
- Horen luisteraars meer dan alleen een kortere of zachtere uitklank?
- Kunnen spelers voorspellen hoe een harde aanslag de volgende aanslag kleurt?
- Is het verschil muzikaal bruikbaar of alleen technisch aantoonbaar?

**Go-criterium:** Memory wordt herhaaldelijk onderscheiden van zowel Memory 0 als de decay-gematchte referentie, en minstens een speler kan het gedrag doelbewust inzetten.

**Stop/bijstuurcriterium:** het verschil verdwijnt tegenover kortere Decay of wordt alleen als niveauverschil beschreven. Vereenvoudig of herstem dan eerst het geheugenmodel; voeg nog geen grotere graaf toe.

Een kleine ingebouwde A/B-speler met verborgen labels, vaste randomisatie en antwoordregistratie is hier een nuttige editoruitbreiding. Bewaar ruwe antwoorden en instellingen, niet alleen een samenvatting.

### 2. Stemming en moduskaart

Render of meet een raster van Pitch, Spread en Couple. Bepaal per instelling de dominante frequenties, waargenomen grondtoon en afwijking in cents. Gebruik lange, zachte enkelvoudige aanslagen zodat Stress en Memory de meting zo min mogelijk vervormen.

**Resultaat:** een kaart van muzikaal stabiele gebieden en bekende afwijkingen. Voeg alleen daarna eventueel een optionele `Tonal`-modus of koppelingscompensatie toe. Behoud de huidige vrije materiaalmodus als referentie; maak pitch-smoothing een afzonderlijke expliciete control als die muzikaal gewenst blijkt.

### 3. Meten op echte Teensy

Flash alleen na expliciete toestemming. Meet daarna:

- CPU- en audiomemorygebruik alleen en naast zware modules;
- gemiste gates bij 1, 2, 3 en 5 ms;
- snelle Couple/Pickup-CV en verschil met browser-timing;
- resetklik, clipping en drop-outs;
- minstens 30 minuten duurgedrag met herhaalde harde aanslagen;
- de Memory-demo via de echte audio-uitgang, vergeleken met de browser.

Leg firmwarecommit, samplerate, blokgrootte, patch, meetmethode en marges vast. Een geslaagde build is geen bewijs van realtime marge.

## Mogelijke uitbreidingen daarna

Alleen als de luister- en hardwareproeven positief zijn:

1. **Stress als speelbare terugkoppeling:** voorbeeldpatches waarin Stress subtiel Couple, Pickup of een externe VCA moduleert. Beperk de feedback en toets dat dit meer is dan een gewone envelope.
2. **Twee velocity-ingangen:** `vel_a` en `vel_b` als spelers onafhankelijke articulatie per aanslagpunt nodig blijken te hebben. Behoud `vel` voor compatibiliteit of definieer een migratie.
3. **Materiaalpresets:** een klein aantal meetbaar verschillende presets zoals snaar, plaat en balk. Voeg geen preset toe die alleen luider of korter klinkt.
4. **Een extra knoop of alternatieve topologie:** pas nadat CPU-marge en een muzikale behoefte zijn aangetoond. Iedere variant krijgt dezelfde passiviteits- en hersteltests.
5. **Polyfonie of vrije graafeditor:** later productonderzoek. Eerst moet een enkele Material Bridge als instrument overtuigen.

## Wat nu bewust niet doen

- Geen FPGA-port zonder gemeten CPU-probleem.
- Geen willekeurige extra CV-ingangen zonder concreet speeldoel.
- Geen automatische loudness-normalisatie in de DSP; dat maskeert het model.
- Geen stilzwijgende pitch-smoothing of gewijzigde gateflanken.
- Geen claim dat browser en Teensy externe CV samplegelijk verwerken.
- Geen claim dat de muzikale hypothese bewezen is op basis van technische tests of de positieve eerste luisterindruk.
