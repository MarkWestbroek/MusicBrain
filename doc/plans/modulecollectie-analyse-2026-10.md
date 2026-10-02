# Modulecollectie: wat er is, wat er miste en wat erbij kwam (2026-10-02)

**Status:** analyse plus eenentwintig gebouwde modules (zestien in de eerste ronde, vijf in een tweede op dezelfde dag), getest in wasm en gebouwd voor de Teensy 4.1. Niet door een mens beluisterd en niet geflasht.
**Aanleiding:** Marks vraag van 2 oktober 2026: zijn alle digitale Mutable-modules geport, welke analoge zijn te emuleren, en wat mist er aan synthesetechnieken, effecten en vooral CV-modulatoren? "Wat je vindt mag je gaan bouwen."

De collectie stond op 83 panelen (84 firmware-types). De catalogus is [module-catalogus.md](../module-catalogus.md); dit document zegt wat daaruit volgt.

## Kort

- **Mutable Instruments:** de grote digitale modules zijn er. Wat ontbreekt is klein of dubbelt (Braids, de niet-drumstanden van Peaks) of vraagt een eigen bedieningsontwerp (Frames, de arpeggiator van Yarns).
- **CV-modulatoren waren het dunst.** Er was een LFO, Tides, Marbles, een sequencer en een quantizer, maar geen klok, geen S&H in de firmware, geen logica, geen kans, geen chaos en geen functiegenerator. Dat pakket is nu gebouwd: negen modules.
- **Synthese en effecten:** de West Coast-kant ontbrak (wavefolder, low-pass gate), net als een frequency shifter, een pedaalvervormer, een acid-stem, een Benjolin en een orgel bij de Rotary. Die zeven zijn gebouwd.
- **Tweede ronde:** de vijf kandidaten die na de eerste ronde bovenaan stonden zijn ook gebouwd: SEM-filter, complex-oscillator, wah, ensemble en elektrische piano.
- **Contract:** 105 firmware-types (was 84), 103 panelen, 96 daarvan als wasm in de simulator.

## Zo is het te horen

Open de editor en kies een van de onderstaande menu-ingangen; die zetten de nieuwe panelen zelf in het project.

| Menu | Wat het doet |
|---|---|
| **Solo ▾ → 🧪 Acid jam** | Speelt zichzelf: Clock → Seq → ACID, Euclid op Accent en Slide, Chaos op de cutoff, kick op de tel. Draai aan Cutoff, Reso, Env mod en Accent. |
| **Solo ▾ → 🌊 West Coast** | Speelt zichzelf: Turing → Quantizer → sinus → FOLDER → LPG → galm. LFO-8 en Chaos bewegen de folder. |
| **Solo ▾ → 🌀 Rungler** | Speelt zichzelf; het klavier stemt oscillator A. Begin bij Run A en Freq B. |
| **Poly ▾ → 🎹 Organ ×12** | Tonewheel-orgel door de ROTARY; het mod-wiel schakelt langzaam/snel. Speel legato en luister naar de percussie. |
| Solo ▾ → 🧪 Acid | De acid-stem los onder het klavier (zonder accent en slide). |
| Solo ▾ → Fluit + FOLDER, String + DRIVE, Rings + FREQ SHIFT | De drie effecten achter een bekend instrument. |
| **Poly ▾ → 🎹 E-piano ×12** | Elektrische piano (tine/reed), velocity bekabeld. Speel zacht en hard. |
| **Solo ▾ → 🎛️ Buchla-stem** | COMPLEX door de LPG onder het klavier; SLOPE opent de gate en beweegt het timbre. |
| **Solo ▾ → 🎚️ SEM sweep** | Speelt zichzelf: zaag door het SEM-filter, Mode schuift in een halve minuut van LP via notch naar HP. |
| Solo ▾ → Strijker + ENSEMBLE, String + WAH | De ensemble en de touch-wah achter een bekend instrument. |

De CV-modules staan in het modulemenu onder Sequencer (Clock, Euclid, Turing), LFO (Chaos, LFO-8), Envelope (Slope) en Utility (S&H, Branches, Logic).

## 1. Mutable Instruments: wat is geport en wat niet

| Module | Soort | Stand | Opmerking |
|---|---|---|---|
| Elements, Rings, Plaits, Clouds, Warps | digitaal | ✅ geport | Plaits met 24 engines (1.2) |
| Tides (2018), Marbles, Stages | digitaal | ✅ geport | CV-domein, 1 kHz |
| Peaks | digitaal | ◐ alleen de drums | envelope, LFO en tap-LFO niet; AHDSR, LFO en Slope dekken ze |
| Grids | digitaal (GPL) | ✅ eigen patroondata | upstream-code niet gebruikt |
| Branches | digitaal (GPL) | ✅ **nu**, eigen code | `tp_mmb_branches` |
| Braids | digitaal (MIT) | ✗ | voorloper van Plaits; overlapt grotendeels. Uniek: een paar modellen (CSAW, toy, vowel/FOF, de digitale filters). Lage prioriteit. |
| Frames | digitaal (MIT) | ✗ | keyframe-mixer: het idee (één knop morft vier CV's langs opgeslagen standen) is waardevol, maar hoort bij [morph A-B](morph-a-b.md) en vraagt een bedieningsontwerp in de editor |
| Streams | digitaal (MIT) | ✗ | dynamics-gate. De vactrol-stand is nu de LPG, de compressor is er zesvoudig; een port voegt weinig toe |
| Yarns | digitaal (MIT) | ✗ | MIDI-interface; MidiIn doet dat. Het bruikbare deel is de **arpeggiator** (zie open punten) |
| Edges | digitaal (GPL) | ✗ | chiptune-oscillatoren; de SID en Plaits Chiptune dekken dit |
| Beads | digitaal | ✗ | opvolger van Clouds; de broncode is voor zover bekend niet vrijgegeven |
| Ripples, Blades, Shelves | analoog | ✗ | filters; zie §2 |
| Veils, Blinds, Shades, Links | analoog | (✓) | VCA's en CV-rekenwerk: Octa-VCA en CV Math doen dit |
| Kinks | analoog | ✅ **nu** | Logic (min/max, gelijkrichter, vergelijker) en S&H |

Conclusie: er valt aan Mutable weinig meer te halen dat niet al op een andere manier in de collectie zit. De drie die inhoudelijk iets toevoegen zijn Frames (als morph-idee), de arpeggiator van Yarns en Peaks' tap-LFO (een LFO die een externe klok volgt).

## 2. Analoge schakelingen die te emuleren zijn

Gebouwd op 2 oktober staan met ✅; de rest is een kandidatenlijst, gesorteerd op hoeveel het toevoegt aan wat er is.

| Schakeling | Wat het is | Stand |
|---|---|---|
| Buchla 259 timbre | wavefolder met vijf vouwcellen | ✅ `tp_mmb_folder` (Type 259, naast Sine en Tri) |
| Buchla 292 | low-pass gate met vactrol | ✅ `tp_mmb_lpg` |
| TB-303 | diode-ladder, accent en slide | ✅ `tp_mmb_acid` (complete stem) |
| Bode 1630 | frequency shifter | ✅ `tp_mmb_freqshift` |
| Tube Screamer, RAT, Big Muff | pedaalvervormers | ✅ `tp_mmb_drive` (drie standen) |
| Hammond-generator | 91 toonwielen, trekstangen, percussie, scanner | ✅ `tp_mmb_organ` |
| Benjolin (Hordijk) | twee oscillatoren + rungler + filter | ✅ `tp_mmb_rungler` |
| Serge DUSG / Maths | functiegenerator | ✅ `tp_mmb_slope` |
| Moog-ladder, MS-20/Korg35, SVF | filters | waren er al |
| Buchla 259 compleet | complex-oscillator: modulatie-oscillator met FM-, AM- en timbre-index naar de vouwer | ✅ `tp_mmb_complex` (tweede ronde) |
| Oberheim SEM | 12 dB state-variable met LP→notch→HP-morph | ✅ `tp_mmb_sem` (tweede ronde) |
| Steiner-Parker, Wasp, Polivoks | filters met een eigen vervorming | kandidaat (een "karakterfilter" met standen, zoals DRIVE) |
| Roland IR3109 / Juno-chorus | OTA-cascade; de chorus is BBD | chorus is er (BBD CHORUS); filter kandidaat |
| MI Ripples / Blades | 2/4-polig met drive | kandidaat, zelfde familie als hierboven |
| Solina ensemble | drie BBD-lijnen met twee LFO's | ✅ `tp_mmb_ensemble` (tweede ronde) |
| Wah (Cry Baby), talkbox/formantfilter | inductorwah, klinkerfilter | ✅ `tp_mmb_wah` (tweede ronde; type Wah en type Vowel) |
| Elektrische piano (tine/reed) | Rhodes/Wurlitzer als fysisch model | ✅ `tp_mmb_epiano` (tweede ronde) |
| TR-808/909-resten | handclap, toms, cowbell, cymbal | kandidaat; Peaks, CR-78 en Plaits dekken kick/snare/hat |
| Space Echo (meerkoppig) | drie koppen, veergalm | deels: STEREO TAPE heeft twee sporen |

## 3. Synthesetechnieken

**Er is:** subtractief (VCO, Octa-VCO, vier filters), FM (2-op, DX7 zes-op), wavetable (WT, Morph-WT, Draw), fysisch (Karplus, Elements, Rings, STK, resonatorbank), sampling (sampler, Tape strip), zang (FOF, PSOLA, Plaits Speech, vocoder), chips (SID), drums (Peaks, CR-78), macro (Plaits: PD, wave terrain, additief, korrels, zwerm, akkoorden) en de onderzoeksmodules (Material Bridge, Scanned, GENDYN, Excitable, Reservoir).

**Erbij sinds vandaag:** waveshaping West Coast (FOLDER + LPG), additief met gedeelde bronnen (ORGAN), getrapte chaos (RUNGLER), en de acid-stem als complete analoge emulatie.

**Erbij in de tweede ronde:** de complex-oscillator (COMPLEX) en de elektrische piano als model van tine en pickup (E-PIANO).

**Mist nog** (uit [synthesetechnieken-verkenning](synthesetechnieken-verkenning.md) en ModularGrid-gangbare modules): vectorsynthese en wave sequencing, pulsar en VOSIM, additieve resynthese (FW-AU-7, de "fourier shaper"), phase vocoder/spectraal bevriezen als losse module, en een supersaw die meer is dan de detune van de Octa-VCO.

## 4. Effecten

**Er is:** echo's (digitaal, tape, stereo tape, vintage digitaal), modulatie (phaser, stereo phaser, BBD-chorus, vibe, tremolo, rotary), galm (plaat/veer, Dattorro, shimmer), dynamiek (zes compressors, drie EQ's), toonhoogte (harmonizer, octaver), ringmod, comb, resonator, Clouds, Warps.

**Erbij:** DRIVE (er was alleen de tanh van COMP), FOLDER, FREQ SHIFT.

**Erbij in de tweede ronde:** WAH (pedaal, auto-wah, LFO, en een klinkerstand), ENSEMBLE en het SEM-filter.

**Mist nog:** bitcrusher als losse module (DIGITAL ECHO heeft de bits), gated reverb en een hall/kamer (FDN), noise gate/expander, looper, versterker- en kastsimulatie, Air/Tilt-EQ (staat open in [vintage-eq](vintage-eq.md)).

## 5. CV-modulatoren

Dit was het gat. Wat er nu is, per functie:

| Functie | Module | Opmerking |
|---|---|---|
| Tempo, delingen, swing | **CLOCK** ✅ nieuw | één fase voor alle uitgangen; maatzaag als CV |
| Ritme | Grids, **EUCLID** ✅ nieuw | drie kanalen, Fill-CV |
| Melodie, generatief | Seq, Marbles, **TURING** ✅ nieuw | lus die langzaam verandert; CV2 als canon |
| Kans | **BRANCHES** ✅ nieuw | muntworp, toggle, latch |
| Random | Marbles, **S&H** ✅ firmware nieuw | paneel bestond al; los = interne ruis |
| Periodiek | LFO, Tides, **LFO-8** ✅ nieuw | acht verwante LFO's op één knop |
| Niet-periodiek, samenhangend | **CHAOS** ✅ nieuw | Lorenz, Rössler, Thomas; X/Y/Z + gate |
| Envelope / functie | AHDSR, Stages, **SLOPE** ✅ nieuw | rise/fall apart, kromming, cycle, EOR/EOC |
| Rekenen, logica | CV Math, Quantizer, Chord, **LOGIC** ✅ nieuw | min/max, AND/OR/XOR, vergelijker, gelijkrichter |
| Uit audio | Envelope-volger | — |
| Uit de klank zelf | Reservoir, **RUNGLER** (Rung, Tri B), **LPG** (Env), **ACID** (Env) | modulatoren die bij de stem horen |

**Mist nog:** een arpeggiator (houdt de toetsen van een PolyGroup vast en speelt ze als reeks; Yarns is het voorbeeld), de poly-sequencer (FW-SQ-2), een klok die MIDI-clock volgt en tap-tempo, een CV-recorder/looper, een sequentiële schakelaar, een burst/ratchet-generator, een toonhoogtevolger (audio → V/Oct, voor zingen in AUDIO IN) en de keyframe-morph (Frames).

## 6. Wat er gebouwd is

Alle eenentwintig: firmwareklasse, wasm in de simulator, paneel, gedragstests, contract. Eerst de zestien van de eerste ronde, daaronder de vijf van de tweede.

**CV-pakket** (firmware-`CvModule`, 1 kHz; de simulator draait de firmwareklasse zelf via `cvhost.h`):
`tp_mmb_sh`, `tp_mmb_clock`, `tp_mmb_euclid`, `tp_mmb_turing`, `tp_mmb_branches`, `tp_mmb_chaos`, `tp_mmb_lfo8`, `tp_mmb_slope`, `tp_mmb_logic`. Gedeelde hulpjes in `firmware/app-modular-brain/src/CvHelpers.h`.

**Audio** (kern in `firmware/lib/mmb-dsp/mmb_dsp/`, gedeeld door Teensy en wasm):

| Type | Kern | Gemeten (wasm, 44,1 kHz) |
|---|---|---|
| `tp_mmb_folder` | `wavefolder.h` + `oversample.h` | oversampler vlak tot 16 kHz (−0,6 dB op 18 kHz), vertraging precies 16 samples; alias van de 15e harmonische −49 dB (Tri) tot −95 dB (Sine) |
| `tp_mmb_lpg` | `lpg.h` | ping: vactrol op 0,95 binnen 5 ms, 0,27 na 300 ms; in 100 ms zakt 1100 Hz 12 dB meer dan 110 Hz |
| `tp_mmb_drive` | `drive.h` | drie standen; overdrive vervormt 1 kHz ruim 8 dB meer dan 80 Hz (mid-hump) |
| `tp_mmb_freqshift` | `freq_shifter.h` | ongewenste zijband −44 dB of beter van 40 Hz tot 18 kHz |
| `tp_mmb_acid` | `acid.h` | resonantiepiek +24 dB bij Reso 1, geen zelfoscillatie; slide bindt (geen nieuwe aanslag) |
| `tp_mmb_rungler` | `rungler.h` | Loop herhaalt elke 8 klokken; Chaos gebruikt alle 8 niveaus |
| `tp_mmb_organ` | `tonewheel.h` | twee toetsen op één wiel: exact 2× (fasevast); trekstang 4 = −12,0 dB; foldback en eenmalige percussie kloppen |

Twee nieuwe gedeelde rompen maken een volgende kernel-module goedkoper: `KernelStream.h` (Teensy: blokwerk, controls, CV's, parkeren) en `tools/mmb-wasm/kernel_host.h` (wasm). Een kernel met `Init / setControl / setCv / cvOut / Process` heeft daarna alleen nog een moduleklasse met de poortnamen nodig.

**Tweede ronde** (zelfde recept; de vier eenvoudige moduleklassen en hun wasm-wrappers zijn uit één beschrijving gegenereerd):

| Type | Kern | Gemeten (wasm, 44,1 kHz) |
|---|---|---|
| `tp_mmb_sem` | `sem.h` | laagdoorlaat 12 dB/oct (2 → 8 kHz: 24 dB), notch −31 dB op de cutoff, hoogdoorlaat −40 dB op 100 Hz; resonantiepiek tot +10 dB, een tik sterft uit (geen zelfoscillatie) |
| `tp_mmb_complex` | `complex_osc.h` (+ `wavefolder.h`) | Timbre 0: zuivere sinus (h2 en h3 onder −115 dB); Timbre 0,6: h3 −7 dB, h7 −5 dB, geen even boventonen; FM met Ratio 2 blijft harmonisch |
| `tp_mmb_wah` | `wah.h` | piek +9 dB die van 400 Hz naar 2,2 kHz schuift; klinkerstand IE: pieken op 270 en 2290 Hz met 29 dB gat ertussen; auto-wah: 28 dB verschil tussen zacht en hard spel |
| `tp_mmb_ensemble` | `ensemble.h` | draaggolf −25 dB (de energie zit in de zijbanden), links en rechts verschillend, geen kwart seconde zonder signaal |
| `tp_mmb_epiano` | `epiano.h` | Timbre 0: alleen het octaaf (grondtoon −116 dB lager); standaard: octaaf 10 dB onder de grondtoon; hard t.o.v. zacht: 5× zo luid en de derde harmonische 32 dB sterker |

**Tests:** `editor/src/modular-mb/sim/wasmModulators.test.ts` (34), `wasmClassics.test.ts` (30) en `wasmClassics2.test.ts` (22), plus acht C++-invariantentests op 32/44,1/48/96 kHz in `tools/mmb-wasm/bitcheck/`. De hele suite: 1013 geslaagd; `zz_sidupgrade.test.ts` faalt, maar dat is een tijdelijk bestand van een andere sessie dat een omgevingsvariabele verwacht. PlatformIO-build voor de Teensy 4.1 slaagt (RAM1 vrij 57 KB, RAM2 vrij 269 KB).

De demo-patches (Acid jam, West Coast, Organ, en in de tweede ronde Buchla-stem en SEM sweep) zijn buiten de editor om doorgerekend met de echte wasm-modules in een keten; de niveaus van de demo's zijn daarop afgesteld. Dat ving één fout: met een externe klok bepaalt de Rate-knop van de sequencer nog steeds de gate-lengte, dus bij Rate 2 Hz bleef de gate hoog en speelde ACID één noot. De demo zet Rate nu op het stappentempo; het staat ook in de notitie van CLOCK.

## 7. Wat niet is gedaan

- **Niemand heeft geluisterd.** Alle klankkeuzes (de vouwvormen, de drie pedaalstanden, de resonantie en het accent van ACID, de click en de scanner van het orgel, de pickup en de bel van de E-PIANO, de klinkers van de WAH) zijn op meting en op kennis van de schakelingen gemaakt. De E-PIANO is daarvan het meest een gok: de verhouding tussen grondtoon, octaaf en bel bepaalt of het een piano is of een bel met een sinus.
- **Niet geflasht**, geen CPU-meting op de Teensy. Kandidaten voor een krappe marge: ORGAN met veel toetsen en alle trekstangen open (tot ~100 sinussen per sample), en FOLDER/DRIVE door de 4× oversampling.
- De panelen zijn niet in een browser bekeken; labels kunnen overlappen. Het orgel heeft schuiven als trekstangen: of dat prettig bedient moet blijken.
- De demo's zijn niet door de simulator van de editor zelf gespeeld (wel module voor module en als keten in node).
- De AI-receptcatalogus (`editor/src/modular-mb/recipe/catalog.ts`) kent de nieuwe modules niet.
- DRIVE, ACID, ORGAN, SEM, WAH en E-PIANO zijn modellen naar de topologie van de schakelingen, geen simulatie per onderdeel; de merknamen staan alleen in de uitleg, niet op de panelen.
- De E-PIANO loopt niet overbemonsterd; hard aangeslagen hoge noten met Drive open kunnen aliasen. Niet gemeten.
- Niets is gecommit: de wijzigingen staan in de werkboom.

## 8. Aanbevolen volgorde

1. **Acid jam** en **West Coast** luisteren; per module noteren: goed, bijstellen of weg.
2. **Organ ×12** bespelen met de Rotary. Mark heeft echte Leslies: de vraag is of de generator ervoor geloofwaardig is (click, percussie, lek, het in-fase optellen). Daarna **E-piano ×12**: zacht en hard spelen, en aan Timbre en Bell draaien tot het een piano is.
3. De CV-modules los proberen in een bestaande patch: LFO-8 en Chaos op een filter, Turing achter de Quantizer.
4. Daarna flashen en CPU meten, te beginnen met ORGAN.
5. Volgende bouwronde, in volgorde van wat het toevoegt: arpeggiator, MIDI-clock op CLOCK, karakterfilters (Steiner-Parker, Wasp, Polivoks), de resten van de 808/909, een hall-galm.
