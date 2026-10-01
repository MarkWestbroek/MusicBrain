# Material Bridge: overdracht en vervolg

**Datum:** 2026-10-01 (bijgewerkt na review en herstel van stemming en demo, zie [Wijzigingen 2026-10-01](#wijzigingen-2026-10-01))

**Status:** werkend onderzoeksinstrument; browser- en Teensy-code gebouwd, nog niet op hardware geflasht.
**Hoofddocument:** [State-Graph Synthesis](state-graph-synthesis.md)

Dit document is het startpunt voor een volgende chat. Het beschrijft wat Material Bridge is, waar de code staat, wat aantoonbaar werkt, wat nog niet is aangetoond en welke vervolgstappen het meeste informatie opleveren.

## Korte conclusie

De huidige bouwfase is **compleet genoeg om te beoordelen**. Er is een gedeelde DSP-kern voor browser en Teensy, een bespeelbare module, een zelfspelende demo, een reproduceerbare A/B-renderer, CV-besturing en automatische verificatie.

Het onderzoek zelf is nog niet compleet. We weten dat het brugcontact (Memory) de pickupbalans van identieke zachte noten na een harde aanslag meetbaar verandert zonder de totale energie te veranderen, en dat Fatigue de uitklank verkort. Nog niet bekend is of een muzikant het materiaalgeheugen blind herkent, leert voorspellen en doelbewust gebruikt. CPU-belasting en triggertiming zijn nog niet op een echte Teensy gemeten.

Voeg daarom niet meteen meer resonatoren, polyfonie of een vrije graafeditor toe. De eerstvolgende winst zit in luisteren, meten en pas daarna gericht uitbreiden.

## Wat is Material Bridge?

Material Bridge is een compact state-graph-instrument met vier gekoppelde resonatoren. `Hit A` en `Hit B` slaan de twee uiteinden aan. Energie beweegt via drie passieve koppelingen door het model en twee pickups leveren stereo-uitvoer.

Bij hard spelen loopt `Stress` op. Boven 0,60 breekt het contact van de middelste brug; pas onder 0,25 sluit het weer (hysterese). Een enkele aanslag met velocity boven ongeveer 0,85 is genoeg om te breken; zachte aanslagen (velocity 0,33) houden Stress onder de hersteldrempel. Twee controls bepalen wat een gebroken contact doet:

- `Memory` verzwakt de middelste brug. Energie blijft dan aan de aangeslagen kant, de pickupbalans verandert, maar er wordt niets extra gedissipeerd.
- `Fatigue` voegt stressafhankelijke demping toe: een kortere uitklank onder belasting.

Dit levert hysterese: dezelfde actuele aanslag kan anders klinken door wat er vlak daarvoor gebeurde. Memory en Fatigue zijn bewust gescheiden zodat de luisterproef het brugcontact los van "gewoon kortere decay" kan beoordelen.

Belangrijke grenzen:

- De energie-uitwisseling is passief en begrensd; Couple-CV maakt geen energie uit het niets.
- Pickup kiest alleen een luisterpositie en belast het model niet.
- De koppelingshoek schaalt met de grondtoon. V/Oct transponeert daardoor het hele spectrum; de modusverhoudingen liggen vast en hangen alleen van Couple en Spread af (zie de moduskaart hieronder).
- Reset wist resonatorenergie en stress onmiddellijk en kan daardoor klikken.
- De browser leest CV samplegewijs. Teensy neemt CV en gates eenmaal per audioblok van 128 samples over. Gebruik op hardware gates van minstens 5 ms.

## Zo is het te horen

### Live demonstratie

1. Open de editor op `http://127.0.0.1:5175/`.
2. Kies **Solo > Material Bridge demo (2:3)**.
3. Start **Sim**.
4. Wissel bij Patches tussen `Material Bridge demo - Memory uit`, `Material Bridge demo - Alleen brug` en `Material Bridge demo - Brug + vermoeiing`.

De live varianten zijn handig om controls en kabels te proberen, maar vormen geen eerlijke A/B: patchwisselen reset de toestand niet gegarandeerd en de uitgangsniveaus zijn niet gematcht.

De editor bewaart het project in `localStorage`. Een commit voegt daarom geen demo toe aan een reeds opgeslagen project. Het menu-item verschijnt na hot reload of herladen; pas de keuze **Material Bridge demo (2:3)** maakt het rack en de twee patches. **Internals** voert `seedInternals()` uit en werkt bestaande interne moduledefinities en panelen bij zonder patches te wissen.

### Gecontroleerde A/B

De gecontroleerde takes staan in:

- `editor/public/material-bridge-ab/memory-off.wav` (Memory 0, Fatigue 0)
- `editor/public/material-bridge-ab/bridge-only.wav` (Memory 0,85, Fatigue 0)
- `editor/public/material-bridge-ab/bridge-fatigue.wav` (Memory 0,85, Fatigue 0,85)
- `editor/public/material-bridge-ab/report.json`

Via de editorserver zijn de WAV's bereikbaar onder `/material-bridge-ab/`. Opnieuw genereren vanuit de repositoryroot:

```powershell
node tools/mmb-wasm/render-material-bridge.mjs editor/public/material-bridge-ab
```

De renderer gebruikt de echte SEQ-16-wasm en Material Bridge-wasm. Alle drie de takes krijgen exact dezelfde gates en velocitysamples, beginnen met nieuwe module-instanties en worden met een constante gain per hele take op dezelfde stereo-RMS gebracht. Er is geen normalisatie per aanslag, limiter of compressor.

## Demonstratie-instellingen

| Onderdeel | Instelling |
|---|---|
| Ritme A | 2 Hz, gate 0,1, lengte 16, naar Hit A |
| Ritme B | 0,5 Hz, gate 0,1, lengte 8, naar Hit B |
| Velocity | SEQ A CV; frase 6 x 0,33 / 1 / 7 x 0,33 / 2 x 0 (rust) |
| Toonhoogte | vaste C3; Pitch -12 en geen V/Oct-kabel |
| Materiaal | Spread 0,12; Couple 0,65; Decay 4 s; Recover 2 s |
| Pickups/uitvoer | Pickup 0,25; Level 0,8 |
| A/B-verschil | Memory 0 / 0,85 / 0,85 en Fatigue 0 / 0 / 0,85 |

De frase is zo ontworpen dat dezelfde zachte noot voor en na een harde aanslag klinkt. Zachte aanslagen houden Stress onder de hersteldrempel; de harde breekt de brug; de zachte noten daarna klinken ongeveer 2,5 s "gebroken" en daarna hersteld. De opname duurt 22 seconden: twee frasecycli van 8 s en zes seconden herstel. Er zijn 32 gates op A (waarvan 4 rustgates met velocity 0) en 8 op B. Alle gates zijn langer dan 5 ms.

## Gemeten resultaten

| Meting | Memory uit | Alleen brug | Brug + vermoeiing |
|---|---:|---:|---:|
| Ruwe stereo-RMS | 0,02834 | 0,02611 | 0,01882 |
| Vaste gain voor hele take | 1,8591 | 2,0184 | 2,7995 |
| Gematchte stereo-RMS | 0,05269 | 0,05269 | 0,05269 |
| Gematchte piek | 0,588 | 0,639 | 0,900 |
| Maximale Stress | 0,977 | 0,977 | 0,821 |
| Aandeel speeltijd met Stress > 0,60 (brug gebroken) | 18,1 % | 18,3 % | 9,3 % |
| Aandeel speeltijd met Stress > 0,25 (nog niet hersteld) | 48,8 % | 48,3 % | 35,6 % |
| Stress na 22 s | 0,0072 | 0,0071 | 0,0054 |

Alleen-brug ligt slechts 0,7 dB onder Memory-uit: het brugcontact verandert de verdeling en de klank, niet de luidheid. Vermoeiing kost 3,6 dB. In de vorige demo (2:3-ritme) was de brug 94 % van de speeltijd gebroken, waardoor de A/B een statisch verschil vergeleek; nu breekt en herstelt de brug binnen iedere frase.

Per stap gemeten (via de wasm, frase van 16 stappen): de zes zachte noten vóór de harde aanslag zijn in Memory-uit en Alleen-brug identiek. Na de harde aanslag verschilt de R/L-balans van dezelfde zachte noten tot 6 dB, bij vrijwel gelijke L+R-energie. Vanaf ongeveer 2,5 s na de harde aanslag zijn de takes weer gelijk.

De renderer controleert dat de eerste take sample voor sample reproduceerbaar is, de audio eindig en begrensd blijft, gates lang genoeg zijn, Stress oploopt en weer herstelt, de brug tijdens het spelen herstelt (Stress minder dan 60 % van de speeltijd boven 0,25) en RMS-matching na PCM16-kwantisatie minder dan 0,01 dB afwijkt.

Dit is **geen** perceptuele LUFS-matching en geen blinde luistertest. Nog onbeantwoord is of het balans- en klankverschil van Alleen-brug muzikaal herkenbaar en bruikbaar is.

### Moduskaart

Gemeten met `node tools/mmb-wasm/measure-material-bridge-modes.mjs` (één aanslag, Memory en Fatigue 0, Decay 8 s, pieken van L+R ten opzichte van de sterkste):

| Pitch | Couple | Spread | Modi (afwijking t.o.v. grondtoon van de knop) |
|---|---|---|---|
| 0 | 0 | 0,12 | +1 c |
| 0 | 0,25 | 0,12 | -53 c (0 dB), +100 c (-5 dB), +228 c (-21 dB) |
| 0 | 0,5 | 0,12 | -170 c (-5 dB), +64 c (0 dB), +272 c, +458 c |
| 0 | 0,65 | 0,12 | -253 c (-7 dB), +36 c (0 dB), +301 c (-19 dB), +510 c (-10 dB) |
| 0 | 1 | 0,12 | -475 c, -33 c (0 dB), +361 c, +638 c |
| -12, +12, -24 | 0,65 | 0,12 | exact dezelfde centafwijkingen als Pitch 0 |
| 0 | 0,65 | 0,35 | -140 c (0 dB), +270 c (-5 dB), +567 c |

V/Oct en Pitch transponeren dus zuiver. De sterkste modus verschuift wel met Couple (van -53 c bij 0,25 via +36 c bij 0,65 naar -33 c bij 1). Dat is een bekende, vaste afwijking per instelling; een optionele compensatie is pas zinvol als de luisterproef daarom vraagt.

## Bediening en contract

Controls: `pitch`, `spread`, `coupling`, `decay`, `memory`, `recovery`, `pickup`, `level`, `fatigue` (0..1, default 0,5; stressafhankelijke demping, voorheen onderdeel van `memory`).

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
| Moduskaart | `tools/mmb-wasm/measure-material-bridge-modes.mjs` |
| Model en ontwerpbesluiten | `doc/plans/state-graph-synthesis.md` |

De kernel bevat 160 bytes toestand, gebruikt geen heap en bewaart geen samplebuffers. De wasm is 66.219 bytes. `MaterialBridgeStream` past controls alleen aan het begin van een Teensy-audioblok toe. AudioStream-objecten mogen tijdens live gebruik niet worden vernietigd; `onRetire` zet de stream stil en `onReuse` activeert hem opnieuw.

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
node tools/mmb-wasm/measure-material-bridge-modes.mjs
```

Laatst vastgelegde uitkomst (2026-10-01, na de wijzigingen hieronder):

- 304 contract- en wasm-tests geslaagd.
- C++-invarianten geslaagd op 32/44,1/48/96 kHz en bij blokken van 32/128, inclusief de nieuwe toets dat Memory de totale energie binnen 1 % gelijk laat en Fatigue dissipeert.
- Passiviteit tijdens CV-sprongen, 10-ms-smoothingcurve, hysterese, herstel, energielimiet, directe gate/reset en ongeldige waarden zijn getoetst.
- TypeScript-check, editorbuild en PlatformIO Teensy 4.1-build geslaagd.
- Drie takes gerenderd en de moduskaart gemeten.
- Het paneel met de vierde knop op de tweede rij (vier kleine knoppen) is niet opnieuw in een browser op overlap gecontroleerd.
- Niet geflasht; geen echte hardware-CPU-, latency- of duurmeting.

Let op: de werkboom bevat gelijktijdig wijzigingen van andere chats. Revert of stage geen onbekende bestanden. De Material Bridge-vervolgwijzigingen zijn op het moment van deze overdracht nog niet als aparte commit vastgelegd.

## Aanbevolen vervolgstappen

### 1. Blinde luisterproef

Dit is de belangrijkste volgende stap; de DSP-voorbereiding is gedaan. De drie takes (Memory uit, Alleen brug, Brug + vermoeiing) staan klaar. Randomiseer de bestandsnamen of afspeelvolgorde en laat meerdere rondes beoordelen zonder te tonen welke versie speelt. Vergelijk vooral Memory uit met Alleen brug: dat paar verschilt niet in luidheid of uitklanklengte, alleen in hoe de zachte noten na de harde aanslag over de twee pickups verdeeld zijn.

Vragen:

- Is Memory beter te herkennen dan toeval?
- Horen luisteraars meer dan alleen een kortere of zachtere uitklank?
- Kunnen spelers voorspellen hoe een harde aanslag de volgende aanslag kleurt?
- Is het verschil muzikaal bruikbaar of alleen technisch aantoonbaar?

**Go-criterium:** Alleen brug wordt herhaaldelijk onderscheiden van Memory uit, en minstens een speler kan het gedrag doelbewust inzetten.

**Stop/bijstuurcriterium:** alleen Brug + vermoeiing is te onderscheiden, of het verschil wordt alleen als niveauverschil beschreven. Dan is de hysterese zelf nog niet muzikaal; vereenvoudig of herstem het brugmodel (bijvoorbeeld een sterkere verzwakking dan contact 0,08, of de pickups dichter bij de brug) en voeg nog geen grotere graaf toe.

Een kleine ingebouwde A/B-speler met verborgen labels, vaste randomisatie en antwoordregistratie is hier een nuttige editoruitbreiding. Bewaar ruwe antwoorden en instellingen, niet alleen een samenvatting.

### 2. Stemming: compensatie alleen op verzoek

De moduskaart is gemeten (zie boven) en transpositie is zuiver. Open is alleen dat de sterkste modus per Couple-stand een vaste offset heeft (tot ongeveer 50 cent). Voeg pas een compensatie of `Tonal`-modus toe als spelers daar in de luisterproef om vragen; maak pitch-smoothing een afzonderlijke expliciete control als die muzikaal gewenst blijkt.

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

## Wijzigingen 2026-10-01

Een review van de code en de metingen leverde twee bevindingen op die de luisterproef zouden hebben ondermijnd. Beide zijn hersteld.

1. **Koppeling schaalde niet met de toonhoogte.** De brughoek was een vast aantal radialen per sample (1800/rate). Bij Couple 0,65 gaf dat een modussplitsing van ongeveer 370 Hz, groter dan de grondtoon: bij Pitch 0 lagen de modi op 60 en 891 Hz, bij Pitch -24 lag de laagste modus hoger dan bij Pitch -12. De koppelingshoek is nu 0,1 maal de hoek van de grondtoon, zodat de modusverhoudingen vastliggen en V/Oct transponeert. De oude schaal is niet behouden: hij was geen muzikale keuze maar een schaalfout.
2. **Memory bundelde brugcontact en demping, en de demo hield de brug permanent gebroken.** De stressgestuurde demping domineerde het hoorbare verschil (7,6 dB RMS) en is precies de "gewoon kortere decay" die het document zelf als valkuil noemt. Het 2:3-ritme brak de brug bij vrijwel elke aanslag, zodat de brug 94 % van de tijd gebroken was en de A/B een statisch verschil vergeleek. Nu is de demping een aparte control `fatigue`, `memory` stuurt alleen het brugcontact, en de demo is een zacht-hard-zacht-frase waarin de brug binnen iedere cyclus breekt en herstelt.

Bijbehorende wijzigingen: paneelknop Fatigue, contract met negen controls, drie demopatches en drie takes, contracttest op de frasevorm, wasm-tests die Memory (balans, geen extra dissipatie) en Fatigue (kortere uitklank) afzonderlijk toetsen, C++-toets op energiebehoud van Memory, en de moduskaarttool.

## Wat nu bewust niet doen

- Geen FPGA-port zonder gemeten CPU-probleem.
- Geen willekeurige extra CV-ingangen zonder concreet speeldoel.
- Geen automatische loudness-normalisatie in de DSP; dat maskeert het model.
- Geen stilzwijgende pitch-smoothing of gewijzigde gateflanken.
- Geen claim dat browser en Teensy externe CV samplegelijk verwerken.
- Geen claim dat de muzikale hypothese bewezen is op basis van technische tests of de positieve eerste luisterindruk.
