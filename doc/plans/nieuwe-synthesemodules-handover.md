# Vijf onderzoeksmodules: overdracht (2026-10-02)

**Status:** gebouwd, getest en gecommit in de nacht van 1 op 2 oktober 2026; niet beluisterd door een mens en niet op hardware geflasht. De vijfde (Tape strip) kwam uit een idee van Mark later die nacht.
**Herkomst:** de open kandidaten uit [Synthesetechnieken buiten de vier bekende](synthesetechnieken-verkenning.md) na het Material Bridge-werk van 2026-10-01 ([handover](material-bridge-handover.md)).

Alle vier volgen het Material Bridge-recept: een gedeelde header-only C++-kern in `firmware/lib/mmb-dsp/mmb_dsp/`, een Teensy-wrapper in `firmware/app-modular-brain/src/`, een wasm-wrapper in `tools/mmb-wasm/`, een C++-invariantentest in `tools/mmb-wasm/bitcheck/` op 32/44,1/48/96 kHz, een paneel en Solo-seed in `seedModules.ts`, gedragstests in `wasmPorts.test.ts`, en het gegenereerde contract. Na iedere module slaagden vitest, de C++-check, de TypeScript-check, de editorbuild en de PlatformIO Teensy 4.1-build. Eindstand: 343 contract- en wasm-tests.

## Zo zijn ze te horen

Open de editor, kies **Solo ▾** en daarna een van:

| Menu | Module | Wat je hoort |
|---|---|---|
| Scanned (levende golftabel) | `tp_mmb_scanned` | Speel korte noten: iedere aanslag zet de ring in beweging en de golfvorm trilt na. Aftertouch (of een CV op Press) drukt een vinger in de ring. |
| GENDYN (stochastisch) | `tp_mmb_gendyn` | Ruwe, wandelende golfvorm. Iedere noot begint hetzelfde (Seed) en wandelt weg. Amp 0 met Settle 0 is een stilstaande golf. |
| Excitable (prikkelbaar medium) | `tp_mmb_excitable` | Pulsvormig; Gate B via MIDI zit niet in de solo-seed, patch zelf een tweede gate op Gate B. Draai Refract omhoog bij hoge noten voor subharmonieken. |
| Reservoir demo (gedeelde bron) | `tp_mmb_reservoir` | Zelfspelend, twee patches: "gedeelde bron" (Drain 0,8) en "onafhankelijk" (Drain 0). Wissel en luister of de stemmen elkaar wegduwen. |
| **Poly ▾ > Tape strip ×8 (Mellotron)** | `tp_mmb_tapestrip` | Speelt de bank van de sampler (bankbalk in Simulatie) met Mellotron-mechanica. Houd een toets langer dan 8 s, speel snel dezelfde toets opnieuw, speel akkoorden tegen enkele noten. |

De Reservoir-module zelf staat onder de utility-modules en heeft geen eigen Solo-seed; hij is pas zinvol met twee of meer stemmen.

## 1. Scanned synthesis (`tp_mmb_scanned`, 12 HP)

Gesloten ring van 64 massa's met buurveren (Tension) en terugveer naar rust (Return). De fysica stapt op ~5,5 kHz, Speed vertraagt of versnelt het materiaal; de ring wordt op de toonhoogte van V/Oct en Pitch lineair geïnterpoleerd uitgelezen. Hit slaat aan met Vel als kracht rond Position met breedte Width; Press (CV 0..1) drukt een constante kracht in de ring, zodat een stilstaande vorm ontstaat die bij loslaten terugveert; In duwt met audio. Energy (CV) is de RMS-uitwijking. DC-blokker op 5 Hz. Harde grens ±1 als "fret". Kernel 620 bytes.

Gemeten (wasm, 44,1 kHz): aanslag vel 1 piek 0,55, vel 0,3 piek 0,15; gehouden Press 1 piek 0,75 met periode exact 260,9 Hz op C4 (autocorrelatie); loslaten veert terug; audio-in op 110 Hz piek 0,88. Zonder demping is de mechanische energie niet-stijgend (symplectische stap, grens neemt alleen weg).

Open: de klank is nog niet door een mens beoordeeld. Default Damping 0,3 laat de ring lang nabewegen; wie dat te onrustig vindt zet 0,5 of hoger. Speed onder 0,05 maakt het materiaal zo traag dat een aanslag seconden nabeweegt.

## 2. Reservoir, resource-coupled synthesis (`tp_mmb_reservoir`, 8 HP, CV 1 kHz)

Een bron (0..1) waar vier belastingen (In A..D, 0..1) uit putten: bij Drain 1 leegt een volle stem hem in 1 s; herstel exponentieel met tijdconstante Recover; Refill vult extra bij. Aanbod = Floor + (1−Floor)·Level^Curve. Out A..D = belasting maal aanbod; Level, Starve en een hysteretische Empty-gate geven de bron zelf. Kernel 64 bytes; de firmware-CvModule draait in wasm via cvhost.

Gemeten in de demo (echte wasm-modules, twee stemmen op 1 en 1,5 Hz, sustain 0,8, Drain 0,8, Recover 0,6 s, Curve 2): bron pendelt tussen 0,44 en 0,65; stem A wordt tot 11 dB zachter wanneer B speelt en herstelt ertussen. Met de oorspronkelijke demostand (2 en 3 Hz, Recover 2 s, Drain 0,7) zat de bron permanent op nul en hoorde je alleen een vlak niveauverschil van −20 dB. Dat is dezelfde valkuil als bij de eerste Material Bridge-demo: een gedeelde toestand moet tussen de noten kunnen herstellen, anders test de A/B een statisch verschil.

Open: dit is het goedkoopste experiment uit de verkenning en toetst de aanname onder het hele state-graph-spoor. De demo stuurt alleen de VCA; Starve naar cutoff of V/Oct (met attenuator) is de volgende stap als de VCA-variant hoorbaar is.

## 3. GENDYN (`tp_mmb_gendyn`, 10 HP)

Xenakis' dynamische stochastische synthese, gestemd: Points (3..24) breekpunten; na iedere cyclus zet elk punt een random stap in amplitude (Amp, spiegelend binnen ±1) en duur (Dur, symmetrisch rond de nominale segmentduur, zodat de gemiddelde toonhoogte V/Oct volgt). Dist mengt uniform (0) met zwaarstaartig (1). Smooth van rechte lijnstukken naar cosinusbogen. Settle trekt amplitudes per cyclus naar nul. Hit zaait de xorshift-ruis opnieuw met Seed en herstelt een zachte sinusbeginvorm; zonder Hit loopt de wandeling vrij. Amp+ (CV) moduleert de stapgrootte, Cycle is hoog in het eerste segment. Kernel 272 bytes. Niet bandbegrensd; dat is de techniek.

Gemeten: cycli per seconde 1000..1100 op 261,6 Hz met Dur op 1 (symmetrie klopt); dezelfde Seed en Hit geeft sample-identieke uitvoer; Amp 1 staat vrijwel permanent tegen de grenzen (peak 0,8 = Level), Amp 0 met Settle 0,1 sterft uit (bedoeld: Settle trekt naar nul), Amp 0 met Settle 0 is periodiek binnen 5 %.

## 4. Excitable media (`tp_mmb_excitable`, 12 HP)

Begrensd 16×16-raster van Greenberg-Hastings-cellen: rust → actief (Excite stappen) → refractair (Refract stappen) → rust; een rustende cel wordt actief zodra Thresh van zijn vier buren actief is. Pacemaker A (cel 3,8) en B (cel 12,8; Detune en V/Oct B) prikkelen hun cel op de toonhoogte zolang hun gate hoog is. Fronten lopen een cel per mediumstap, doven aan de rand en vernietigen elkaar bij botsing. Twee Gaussische pickups (Pickup 0 bij de bronnen, 1 in het midden). Speed = samples per mediumstap (1, 2, 4; 1 is op de Teensy zwaar: 256 cellen per sample). De puls is bipolair (negatieve refractaire staart) zodat loslaten niet ploft; DC-blokker 20 Hz, eenpool-lowpass 6 kHz tegen de trapjes. Kernel 2424 bytes.

Gemeten: 262 pulsen/s op C4 bij de linker pickup; na loslaten binnen 20 ms leeg en stil; Pitch +24 met Refract 60 geeft 349 pulsen/s in plaats van 1047 (3:1-blok, een subharmoniek uit het medium); twee bronnen op C4 en G4 geven in het midden 441 pulsen/s in plaats van 654 (botsingen vernietigen fronten). Pieken 0,46..0,66 bij Level 1.

Open: pulsvormige klank met stapjitter van een mediumstap (bij Speed 2 op 44,1 kHz ~45 µs, dus ~1 % periodejitter op C4). Het interessante zit in het samenspel van twee bronnen en in de refractaire blokkade, niet in de kale toon. Dit is de riskantste van de vier; een luisteroordeel kan hem ook afschrijven.

## 5. Tape strip, Mellotron-mechanica om een gewone bank (`tp_mmb_tapestrip`, 16 HP)

Marks idee: de Mellotron had goede opnames op band; de muziek zit in de onvolmaaktheid eromheen. Dus geen Mellotron-samples, maar de bestaande `.mmbs`-banken van de sampler, "gemellotroniseerd". Acht stemmen op dezelfde `SamplePlayer`-kern en (op de Teensy) dezelfde `SampleBank` als de sampler; in de simulator krijgt het type automatisch de bank van de sampler (`WasmModule.bankAliases`), dus bankbalk, multisample-import en autoload werken ongewijzigd.

De kern `tape_strip.h` (1452 bytes) weet niets van samples en levert per noot de startpositie, per blok de snelheidsafwijking en per sample de bewerking:

- **Bandje per toets** (128 posities): loopt met de klok mee, stopt abrupt op Length (1..8 s) met een fade van 6 ms; de toets blijft dan stil tot loslaten.
- **Veerterugloop met geheugen**: na loslaten loopt het bandje terug (Return = terugloop van een volle strip, 0,1..4 s). Opnieuw indrukken terwijl het bandje onderweg is start op de huidige positie, via `SamplePlayer::playSeconds()` omgerekend naar een startoffset in het sample (transpositie meegerekend).
- **Kopcontact** (Contact): opkomst van 8 tot 58 ms, hoogafval van 700 Hz naar vol, pitch-dip tot -60 cent die in ~50 ms wegtrekt.
- **Motor**: belasting = spelende stemmen / 8 met 150 ms traagheid, tot -40 cent bij vol; Press (channel pressure) tot -40 cent extra.
- **Wow** (0,55 Hz sinus plus random walk, tot 25 cent) en **Flutter** (6,3 en 11,1 Hz, tot 6 cent).
- **Wear**: bandruis (-52 dB bij vol, alleen als er een band loopt), bandbreedte 12 kHz naar 3 kHz, zachte verzadiging.
- Uitgangen Tape (positie van het laatst aangeslagen bandje, 0..1) en Load (motorbelasting).

Toegevoegd aan de gedeelde sampler-kern: `playSeconds(midi, vel)` en `kill()`; de sampler zelf gebruikt ze niet. Getest met een synthetische bank in de wasm-tests (stopt na Length, terugloop met geheugen, kopcontact, motor, stil zonder bank, begrensd met slijtage) en de kern apart in de C++-check op vier samplerates.

Open: niet beluisterd met een echte bank; de bankbalk-koppeling is alleen door code gecontroleerd, niet in de browser. Op de Teensy houdt de firmware een bank tegelijk: een sampler en een tape-strip met een ander banknummer wisselen elkaar af. Streaming: sampler en tape-strip melden samen 16 stemmen aan, precies de limiet (`kMaxStreams`); een tweede sampler ernaast streamt dan niet.

## Reproduceren

```powershell
& 'C:\Program Files\Git\bin\bash.exe' tools/mmb-wasm/build.sh scanned
& 'C:\Program Files\Git\bin\bash.exe' tools/mmb-wasm/build.sh reservoir
& 'C:\Program Files\Git\bin\bash.exe' tools/mmb-wasm/build.sh gendyn
& 'C:\Program Files\Git\bin\bash.exe' tools/mmb-wasm/build.sh excitable
& 'C:\Program Files\Git\bin\bash.exe' tools/mmb-wasm/build.sh tapestrip
& 'C:\Program Files\Git\bin\bash.exe' tools/mmb-wasm/bitcheck/check.sh scanned
& 'C:\Program Files\Git\bin\bash.exe' tools/mmb-wasm/bitcheck/check.sh reservoir
& 'C:\Program Files\Git\bin\bash.exe' tools/mmb-wasm/bitcheck/check.sh gendyn
& 'C:\Program Files\Git\bin\bash.exe' tools/mmb-wasm/bitcheck/check.sh excitable
& 'C:\Program Files\Git\bin\bash.exe' tools/mmb-wasm/bitcheck/check.sh tapestrip
python tools/contract_dump.py
editor/node_modules/.bin/vitest.cmd run --root editor src/modular-mb/contract.test.ts src/modular-mb/sim/wasmPorts.test.ts
npm --prefix editor run typecheck
npm --prefix editor run build
.\.venv\Scripts\pio.exe run -d firmware\app-modular-brain
```

Commits: 508a05b (Scanned), 9607912 (Reservoir), bacc55d (GENDYN), b58189c (Reservoir demo), b01b8ea (Excitable), 1b26123 (docs); Tape strip in de commit na deze tekst.

## Wat niet is gedaan

- Geen menselijke luisterbeoordeling van welke module dan ook.
- Niet geflasht; geen CPU-meting op de Teensy. Excitable op Speed 1 en Scanned met veel instanties zijn de kandidaten voor een krappe marge.
- De panelen zijn niet in een browser op labeloverlap gecontroleerd.
- Geen wav-renders zoals bij Material Bridge; de reservoir-meting staat alleen in deze tekst (script in de chatsessie, niet in de repo).
- De AI-receptcatalogus (`editor/src/modular-mb/recipe/catalog.ts`) kent de nieuwe modules niet; een recept kan ze dus nog niet kiezen.

## Aanbevolen volgorde morgen

1. Luister kort naar alle vier via Solo en noteer per module: weg, bijstellen, of verder onderzoeken.
2. Scanned en Reservoir-demo hebben de grootste kans om direct te overtuigen. Bij Reservoir: schakel tussen de twee patches tijdens het spelen.
3. Excitable alleen verder brengen als het samenspel van twee bronnen iets doet wat een mixer van twee pulsgolven niet doet.
4. Tape strip met een echte bank (vleugel, koor) onder Poly ▾: eerst Length 8 en alles op default, dan Contact en Wear omhoog.
5. Pas daarna CPU op de Teensy meten, te beginnen met Excitable op Speed 1.
