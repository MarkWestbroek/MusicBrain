# Overdracht: FOF-VOICE als bespeelbaar steminstrument

**Datum:** 2026-10-01. **Status:** werkend en getest prototype; luistertest,
aliasingmeting en fysieke Teensy-proef staan nog open.

Dit document is bedoeld als zelfstandig startpunt voor een volgende chatsessie.
De bredere inhoudelijke onderbouwing staat in
[De stem als bespeelbaar instrument](stem-als-instrument.md). De bestaande
PSOLA-zanger en zijn andere doel staan in [Zingende stemmen](zingende-stemmen.md).

## Start hier

De module heet `tp_mmb_fof` en is een monofone, FOF/CHANT-geinspireerde
formantstem. Hij maakt zelf geluid en heeft geen opname, Piper-dienst,
lyricbank of extra hardware nodig. Dezelfde header-only C++-kern draait:

- in de browser via WASM;
- op Teensy 4.1 als `AudioStream`;
- sample voor sample, zonder heapallocatie in de DSP-kern.

De snelste proef:

1. Start of herlaad de editor.
2. Kies `Poly > FOF Stem (mono)`.
3. Open `Simulatie`, start audio en speel via MIDI of het schermklavier.
4. Morf `Vowel` langzaam door A-E-I-O-U.
5. Vergelijk `Voice=0` en `Voice=1`, eerst met `Breath=0` en `Vibrato=0`.
6. Gebruik een velocitygevoelig MIDI-klavier of patch CV naar `Vel` om zachte
   en harde aanslagen te vergelijken.

De eerstvolgende aanbevolen ontwikkelstap is **Pressure plus een
reproduceerbare luister- en aliasingtest**. Bouw niet meteen een veel groter
vocal-tractmodel voordat duidelijk is welk hoorbaar probleem nu domineert.

## Relevante commits

De FOF-implementatie is in drie afzonderlijke commits opgebouwd:

| Commit | Inhoud |
|---|---|
| `c87574d` | Eerste speelbare FOF-kern, WASM/Teensy-wrapper, editorpaneel, mono-seed, onderzoek en rooktest |
| `1b7c4f9` | Asymmetrische glottale bron, `Voice`-control en uitgebreide audioregressies |
| `3a05cc8` | Velocitygevoelig volume/fonatie, note-off-behoud en upgrade van oude FOF-definities |

`8a69c1f` is Material Bridge en is geen onderdeel van FOF.

## Architectuur en bestanden

| Laag | Bestand | Verantwoordelijkheid |
|---|---|---|
| DSP | `firmware/lib/mmb-dsp/mmb_dsp/fof_voice.h` | Oscillator, glottale bron, vijf formanten, ruis, envelope en expressie |
| Teensy | `firmware/app-modular-brain/src/FofModule.h` | `AudioStream`, MusicBrain-poorten, controls en lifecycle |
| Registratie | `firmware/app-modular-brain/src/RegisterAllModules.h` | Factoryregistratie van `tp_mmb_fof` |
| WASM | `tools/mmb-wasm/fof_wasm.cc` | Generieke `mmb_abi.h`-wrapper, 44,1 kHz en blokgrootte 32 |
| WASM-build | `tools/mmb-wasm/build.sh` | Targetnaam `fof` |
| WASM-binary | `editor/public/wasm/tp_mmb_fof.wasm` | Gebouwde browser-DSP; opnieuw bouwen na iedere DSP/wrapperwijziging |
| WASM-runtime | `editor/src/modular-mb/runtime/audio/WasmModule.ts` | Markeert het type als ondersteunde WASM-module |
| Paneel/seed | `editor/src/modular-mb/seedModules.ts` | 8 HP-paneel, poorten, mono-seedbedrading en upgradepad |
| Toolbar | `editor/src/modular-mb/ModularMbApp.tsx` | `Poly > FOF Stem (mono)` met standaardcontrols |
| Catalogus | `editor/src/modular-mb/recipe/catalog.ts` | Zoeknamen en speelbare standaardwaarden |
| Classificatie | `editor/src/modular-mb/recipe/classify.ts` | Familie `Physical modelling` |
| Contract | `firmware/app-modular-brain/contract/module-types.json` | Gegenereerde/gesynchroniseerde firmware-interface |
| Tests | `tools/mmb-wasm/test.mjs` | Audioregressies op de echte WASM-kern |
| Editortests | `editor/src/modular-mb/contract.test.ts` | Poort/controlcontract, seedbedrading en migratie |

Belangrijke architectuurkeuze: de DSP-kern kent geen editor, WASM of
`AudioStream`. Nieuwe synthese-eigenschappen horen eerst in `FofVoice`, waarna
de beide wrappers dezelfde API ontsluiten. Houd browser en firmware functioneel
gelijk; voeg geen klankalgoritme alleen in TypeScript toe.

## Huidige publieke contract

### Ingangen en uitgang

| Id | Soort | Betekenis |
|---|---|---|
| `voct` | CV | 0 V = C4 = 261,6256 Hz; frequentie wordt begrensd op 40-2000 Hz |
| `gate` | Gate | Hoge gate opent de vaste attack; lage gate start release |
| `vowel` | CV | Telt op bij de Vowel-knop en wordt daarna begrensd |
| `breath` | CV | Telt op bij Breath en wordt daarna begrensd |
| `vel` | CV | 0-1 aanslagsterkte; zonder kabel is de waarde 1 |
| `out` | Audio | Monosignaal; de mono-seed verbindt dit met L en R |

### Controls

| Id | Default | Betekenis |
|---|---:|---|
| `vowel` | 0 | Genormaliseerde A-E-I-O-U-morf; de kern gebruikt intern 0-4 |
| `tone` | 0,5 | Verandert formantbandbreedtes via `brightness = 0.65 + 0.7 * tone` |
| `breath` | 0,08 | Hoogdoorlaat-aspiratieruis, vooral hoorbaar tijdens glottale opening |
| `vibrato` | 0,12 | 5,3 Hz; maximum is 22 cent |
| `voice` | 0,35 | Korte/heldere naar langere/zachtere glottale open- en sluitfase |
| `level` | 0,8 | Eindniveau |

Nieuwe mono-seeds verbinden MIDI `pitch`, `gate` en `vel` automatisch. Het
bestaande `seedInternals()`-upgradepad vervangt een oude FOF-moduledefinitie
zonder `vel` en behoudt bestaande patches en controlwaarden.

## DSP-model

### Bron

De bron is geen exacte Liljencrants-Fant-implementatie. Zij gebruikt een
Rosenberg-achtige, asymmetrische cosine-flow per grondtoonperiode:

- stijgfase: 45-60 procent van de periode;
- sluitfase: 4-24 procent van de periode;
- daarna gesloten tot de volgende periode;
- excitatie = `0.8 * (vorigeFlow - huidigeFlow)`.

De `Voice`-control wordt over ongeveer 5 ms gladgestreken. De effectieve
fonatie bij velocity is:

```text
effectiveVoice = clamp(voice + 0.3 * (1 - heldVelocity), 0, 1)
```

Een zachte aanslag is dus niet alleen stiller maar heeft ook een langere,
zachtere sluiting. `heldVelocity` blijft tijdens release staan. Als MIDI bij
note-off velocity nul levert, verandert of kapt dat de uitklank niet af.

### Formanten

Vijf tweedegraads gedempte resonatoren worden parallel geëxciteerd. De
frequenties, bandbreedtes en niveaus interpoleren lineair tussen tabellen voor
A, E, I, O en U. De formantfrequenties bewegen niet mee met F0; daardoor blijft
de klinkerkleur bij andere noten herkenbaar.

De tabellen zijn representatieve volwassen-stemwaarden, geen stemidentiteit
en geen articulatorisch mondmodel. `Tone` verandert vooral de resonantieradius
via de effectieve bandbreedte. Ongewijzigde Vowel-waarden herberekenen de
coefficienten niet; `Tone` doet dat momenteel wel bij iedere setter-call.

### Envelope, ruis en output

- attacktijd: 18 ms;
- releasetijd: 120 ms;
- vibrato: sinus op 5,3 Hz;
- noise: deterministische xorshift, eenvoudig hoogdoorlaatgedrag;
- aspiratie volgt gedeeltelijk de glottale opening;
- eindoutput wordt begrensd op -1 tot +1.

De begrenzing voorkomt ongeldige output maar mag niet als oplossing voor
normale clipping worden gebruikt. De regressietest eist daarom dat samples
strikt onder 0,999 blijven.

## Wat al automatisch wordt getest

Voer de WASM-test uit op de werkelijk gebouwde binary:

```powershell
node tools/mmb-wasm/test.mjs tp_mmb_fof
```

De test controleert onder meer:

- 45 combinaties van 110/220/440 Hz, vijf klinkers en drie Voice-standen;
- eindige, niet-stille en niet-geclipte output;
- periodiciteit op de gevraagde F0;
- aantoonbare spectral-tiltverandering door `Voice`;
- zachte versus harde velocity: volume en genormaliseerde golfvorm verschillen;
- sample-exact dezelfde klank bij ongepatchte velocity en velocity 1;
- begrenzing van velocity buiten 0-1;
- velocity nul bij note-off verandert de release sample-exact niet;
- release, hertrigger en exact mute bij `Level=0`;
- acht extreme gevallen met 40/2000 Hz, Voice/Tone-extremen, maximale
  adem/vibrato en CV buiten bereik.

Gerichte editorcontracttests:

```powershell
npm --prefix editor test -- contract.test.ts -t 'FOF|tp_mmb_fof'
```

Deze toetsen het paneel/firmwarecontract, automatische velocitybedrading en
upgrade van een oude definitie zonder bestaande patches te wijzigen.

## Bouw- en validatiecommando's

Gebruik op Windows expliciet Git Bash voor de WASM-build; gewone `bash` kan
naar een onvolledige WSL-installatie wijzen.

```powershell
& 'C:\Program Files\Git\bin\bash.exe' tools/mmb-wasm/build.sh fof
node tools/mmb-wasm/test.mjs tp_mmb_fof
npm --prefix editor test -- contract.test.ts -t 'FOF|tp_mmb_fof'
npm --prefix editor run typecheck
npm --prefix editor run build
.\.venv\Scripts\pio.exe run -d firmware\app-modular-brain
```

Laatste bekende resultaten op 2026-10-01:

- WASM-binary: 65.038 bytes;
- rooktestpiek ongeveer 0,164 en circa 0,2-0,3 procent van realtime op de
  ontwikkel-pc; dit is geen betrouwbare browser- of Teensy-CPU-meting;
- gerichte FOF-editortests: 5 geslaagd;
- Teensy-build: geslaagd, 57.024 bytes vrije RAM1 en 269.408 bytes vrije RAM2;
- niet geflasht en niet fysiek beluisterd.

Tijdens de laatste sessie faalde de volledige worktree-typecheck tijdelijk in
gelijktijdig gewijzigd Material Bridge-demowerk. Een volledige TypeScript-check
op de exact gestagede FOF-bronnen slaagde. Controleer de actuele worktree
opnieuw; neem een oude, inmiddels opgeloste fout niet als blijvende status over.

## Werkboom en commitveiligheid

De repository werd tijdens de FOF-sessies gelijktijdig door andere chats
bewerkt. Op 2026-10-01 stonden onder andere Material Bridge, root-README,
editor-UX-documentatie, website/documentatiereview en Gerberbestanden gewijzigd
of untracked. Die zijn **niet van FOF**.

Voor een volgende commit:

1. Lees `git status --short`, `git diff` en `git diff --cached` opnieuw.
2. Stage nooit alle gedeelde bestanden met `git add -A`.
3. Stage alleen FOF-hunks in onder meer `doc/BACKLOG.md`, `seedModules.ts`,
   `contract.test.ts` en `module-types.json`.
4. Bouw indexversies vanaf de actuele `HEAD`; een andere chat kan tussendoor
   committen. Controleer zowel onbedoelde toevoegingen als verwijderingen.
5. Bekijk `git diff --cached --check` en `git diff --cached --stat` vóór commit.
6. Push of flash niet zonder expliciete opdracht.

## Aanbevolen vervolg: Pressure en meetbare luisterproef

### Doel

Maak langdurige expressie onafhankelijk van de aanslag. `Vel` blijft de
note-on-eigenschap; een nieuwe `pressure`-ingang volgt breath controller,
channel/poly-aftertouch of CV tijdens de noot.

### Eerste, beperkte implementatie

Voeg `setPressure(float)` toe met default 1 voor achterwaartse compatibiliteit
en ongeveer 10-30 ms smoothing. Laat Pressure in de eerste proef maximaal drie
zaken koppelen:

1. amplitude, met een vloer zodat lage druk nog hoorbaar kan zijn;
2. aspiratieniveau;
3. een kleine Voice-verschuiving naar sterker/helderder bij hogere druk.

Begin niet meteen met pitch, formantfrequenties en vibrato tegelijk. Dan is
niet meer vast te stellen welke koppeling muzikaal helpt. Maak de koppelingen
klein, documenteer de formule en voeg tests toe voor defaultcompatibiliteit,
smoothing, monotone RMS-respons en geen klik/NaN bij sprongen.

### Luistermatrix

Render of speel dezelfde noten onder vaste condities:

| Variabele | Waarden |
|---|---|
| F0 | 110, 220, 440 en 880 Hz |
| Klinker | A, I en U |
| Voice | 0, 0,35 en 1 |
| Pressure | laag, midden, hoog en een langzame sweep |
| Breath | 0 en een matige waarde |

Vergelijk op gelijk ervaren volume waar het om klank gaat. Beoordeel apart:

- zangkarakter;
- controleerbaarheid;
- helderheid zonder scherpte;
- hoorbare stappen of klikken;
- pitchstabiliteit;
- ruisgedrag bij lage druk.

Bewaar droge opnames met parameterinstellingen. Een toekomstige chat moet niet
alleen vragen "klinkt het beter?", maar vooraf aangeven welk hoorbaar verschil
een hypothese bevestigt of weerlegt.

### Aliasingmeting

De bron is niet oversampled en niet expliciet bandbegrensd. Meet daarom eerst
een sweep en hoge vaste noten met `Voice=0`, omdat de korte sluiting de meeste
hoge frequenties oplevert. Vergelijk energie boven de harmonisch mogelijke
band met een zachtere Voice-stand. Als aliasing duidelijk hoorbaar of meetbaar
is, vergelijk dan in deze volgorde:

1. minimale sluitduur vergroten;
2. eenvoudige bron-tilt of bandbegrenzing;
3. alleen de bron 2x oversamplen en terugfilteren;
4. pas daarna een volledige andere bron overwegen.

Elke optie moet dezelfde WASM/Teensy-kern houden en op Teensy worden
geprofiled. Kies niet automatisch de theoretisch meest exacte optie.

## Latere richtingen

1. **Dynamische articulatie:** tweeklanktrajecten en instelbare attack/release.
2. **Exactere LF-bron:** A/B tegen de huidige cosinebron, alleen behouden bij
   aantoonbare verbetering en aanvaardbare aliasing/CPU.
3. **Mond-keel-waveguide:** aparte module met dezelfde pitch/vowel/pressure-
   bediening, zodat FOF en een fysiek model eerlijk vergelijkbaar zijn.
4. **Hybride uitspraak:** korte medeklinkers uit ZANG combineren met
   synthetische FOF-klinkers; overgangen en fase zijn dan de hoofdproblemen.
5. **Klein causaal model:** pas na een goede handmatige expressielaag; laat een
   netwerk DSP-parameters op circa 100-250 Hz sturen, niet noodzakelijk audio.

## Niet verwarren of overclaimen

- Dit is FOF/CHANT-geinspireerd, geen volledige CHANT-reconstructie.
- De glottale bron is niet exact LF en geen mechanisch stembandenmodel.
- De klinkertabel modelleert geen specifieke persoon of Nederlandse uitspraak.
- Technische regressies bewijzen niet dat de stem overtuigend menselijk klinkt.
- Snelle offline/WASM-rendering bewijst geen lage instrumentlatency.
- De module heeft nog geen woorden, medeklinkers, tweeklanken of melisma's.
- FOF en ZANG hebben verschillende rollen: berekende bespeelbare klinker versus
  PSOLA-resynthese van opgenomen/gegenereerde lettergrepen.

## Definition of done voor de volgende stap

Pressure/luistermeting is pas klaar wanneer:

- browser en Teensy dezelfde control en formule gebruiken;
- een ongepatchte Pressure-ingang sample- of meetbaar compatibel is met de
  huidige stem;
- geautomatiseerde tests smoothing, bereik, stabiliteit en release afdekken;
- WASM-, gerichte editor- en Teensy-builds slagen;
- droge A/B-opnames of spectra met instellingen beschikbaar zijn;
- de hoorbare uitkomst en eventuele aliasing zijn gedocumenteerd;
- alleen eigen FOF-hunks zijn gecommit.
