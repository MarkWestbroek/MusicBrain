# Overdracht: FOF-VOICE als bespeelbaar steminstrument

**Datum:** 2026-10-01 (bijgewerkt na de Pressure-stap en de eerste
luisterronde, dezelfde dag). **Status:** werkend en getest prototype met
`Vel`, `Pressure`, CV op alle expressieknoppen, een attenuator per CV-ingang
en een eerste lettergreeptabel (`Syl`: Vowel / Doo / Da met synthetische d);
meetmatrix en aliasingmeting zijn gedaan; eerste luisterronde met aftertouch
is gedaan (zie [Luisterronde 1](#luisterronde-1-2026-10-01)); fysieke
Teensy-proef en het luisteroordeel over doo/da staan nog open.

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
   Vibrato 1,0 is een halve toon; rond 0,3 klinkt het als een zanger.
6. Gebruik een velocitygevoelig MIDI-klavier of patch CV naar `Vel` om zachte
   en harde aanslagen te vergelijken.
7. Patch MIDI-IN `Press` (aftertouch) of een LFO naar `Press` en houd een noot
   vast: lagere druk is zachter, ademiger (met `Breath` open) en zachter
   gesloten. `Press` wordt bewust niet automatisch bedraad: zonder aftertouch
   staat MIDI-IN `Press` op 0 en zou de stem dof en zacht klinken.
8. Zet `Syl` op Doo of Da en speel korte noten: elke aanslag begint met een
   d. Of patch MIDI-IN `CC1` naar `Syl+` en stuur vanaf een pad-app CC1 = 0
   (Vowel-knop), 64 (doo) of 127 (da): linkerhand kiest de lettergreep,
   rechterhand speelt. De keuze wordt bij de gate-flank gelezen.

De eerstvolgende aanbevolen ontwikkelstap is **luisteren op oor aan de hand
van de gerenderde matrix en dan beslissen over de aliasing bij hoge noten**
(zie [Meetresultaten](#meetresultaten-2026-10-01)). Bouw niet meteen een veel
groter vocal-tractmodel voordat duidelijk is welk hoorbaar probleem domineert.

## Relevante commits

De FOF-implementatie is in drie afzonderlijke commits opgebouwd:

| Commit | Inhoud |
|---|---|
| `c87574d` | Eerste speelbare FOF-kern, WASM/Teensy-wrapper, editorpaneel, mono-seed, onderzoek en rooktest |
| `1b7c4f9` | Asymmetrische glottale bron, `Voice`-control en uitgebreide audioregressies |
| `3a05cc8` | Velocitygevoelig volume/fonatie, note-off-behoud en upgrade van oude FOF-definities |
| `d90c383` | `pressure`-ingang in kern/wrappers/paneel, `onCvDisconnected` op Teensy, pressure-regressies, meetmatrixscript |
| `f016f67` | Pressure herbalanceerd (minder volume, meer sluiting en adem), `vibrato`- en `voice`-CV, zes `*_amt`-attenuators, paneel 12 HP |
| `0c0c1a8` | Vibrato tot 100 cent; `Syl`-schakelaar, `syl_cv` + `syl_amt`; synthetische /d/ (sluiting, burst, glijbaan) voor doo en da; paneel 14 HP |
| `b1caa64` | Locus-vergelijkingen, F1 sneller dan F2/F3 met halve cosinus, intrinsieke toonhoogte/niveau/adem per klinker aan de kaak gekoppeld, burst volgt de klinker |
| `71b82c3` | Sluiting drijft alleen F1 aan (voice bar), burst breedbandig (3000 Hz) en zwakker (0,3), F2-start iets verder van de klinker |
| `19c9ec2` | Burst en voice bar schalen met F0, F0-dip van −60 cent bij de steminzet, F2-F5 komen tijdens de burst geleidelijk op (geen tik), zwakkere burst bij geronde klinkers |
| Plop-stap (2026-10-01, na luisterronde 5) | Geen coëfficiëntensprong meer: F1-F3 glijden tijdens de sluiting naar de locus, updates per 8 samples, bandbreedtes tijdelijk dubbel (gain op de klinkerdemping gehouden), zachte aanloop van lucht door de sluiting |

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
| Meetmatrix | `tools/mmb-wasm/render-fof-matrix.mjs` | Luister-/aliasingmatrix op de WASM-kern: `report.json` plus wav's, standaard in de tmp-map |
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
| `vibrato` | CV | Telt op bij de Vibrato-knop en wordt daarna begrensd |
| `voice` | CV | Telt op bij de Voice-knop en wordt daarna begrensd |
| `vel` | CV | 0-1 aanslagsterkte; zonder kabel is de waarde 1 |
| `pressure` | CV | 0-1 doorlopende expressie tijdens de noot; zonder kabel is de waarde 1 (sample-exact de oude stem) |
| `syl_cv` | CV | 0-1 over de lettergreeptabel, telt op bij `Syl` (zoals `syl_cv` bij ZANG); zonder kabel 0 |

Elke CV-ingang heeft een attenuator in de wrapper (niet in de kern), met
dezelfde formules op Teensy (`FofModule::apply`) en in wasm (`mmb_process`):

```text
vowel/breath/vibrato/voice:  effectief = clamp01(knop + amt * cv)
vel/pressure:                effectief = 1 - amt * (1 - cv)     (amt 0 = kabel doet niets)
syl:                         index = round(Syl + amt * clamp01(cv) * (N - 1)), N = 3
```
| `out` | Audio | Monosignaal; de mono-seed verbindt dit met L en R |

### Controls

| Id | Default | Betekenis |
|---|---:|---|
| `vowel` | 0 | Genormaliseerde A-E-I-O-U-morf; de kern gebruikt intern 0-4 |
| `tone` | 0,5 | Verandert formantbandbreedtes via `brightness = 0.65 + 0.7 * tone` |
| `breath` | 0,08 | Hoogdoorlaat-aspiratieruis, vooral hoorbaar tijdens glottale opening |
| `vibrato` | 0,12 | 5,3 Hz; 1,0 = een halve toon (100 cent); was 22 cent tot de lettergreep-stap |
| `voice` | 0,35 | Korte/heldere naar langere/zachtere glottale open- en sluitfase |
| `level` | 0,8 | Eindniveau |
| `vowel_amt`, `breath_amt`, `vibrato_amt`, `voice_amt` | 1 | Attenuator van de bijbehorende CV-ingang |
| `vel_amt`, `press_amt` | 1 | Gevoeligheid voor Vel en Press (0 = geen effect) |
| `syl` | 0 | Schakelaar: 0 = Vowel-knop, 1 = doo, 2 = da |
| `syl_amt` | 1 | Attenuator van `syl_cv` |

Nieuwe mono-seeds verbinden MIDI `pitch`, `gate` en `vel` automatisch;
`pressure` blijft ongepatcht (zie stap 7 hierboven). Het bestaande
`seedInternals()`-upgradepad vervangt een oude FOF-moduledefinitie zonder `vel`
of `pressure` en behoudt bestaande patches en controlwaarden.

Op Teensy herstelt `onCvDisconnected` bij het lostrekken van `vel` of
`pressure` de waarde 1 (andere CV-poorten vallen terug op 0). Zonder die
override zette de basisklasse `vel` op 0 en viel de stem stil na het
lostrekken van de velocitykabel; dat is in deze stap meegenomen.

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

### Pressure

`setPressure(0..1)`, default 1, wordt over 20 ms gladgestreken naar
`smoothPressure`. Met `slack = 1 - smoothPressure` gelden drie koppelingen,
alle exact 1 respectievelijk 0 bij volle druk:

```text
pressureGain   = 1 - 0.5 * slack         (vloer 0,5 = -6 dB bij druk 0)
aspirationGain = 1 + 1.5 * slack         (alleen hoorbaar als Breath > 0)
effectiveVoice = clamp(voice + 0.3 * (1 - heldVelocity) + 0.45 * slack, 0, 1)
```

De eerste versie (vloer 0,15, adem +0,75, Voice +0,25) is na luisterronde 1
herbalanceerd: Mark hoorde met aftertouch vooral volume en weinig klank. De
volumekoppeling is daarom gehalveerd en de sluiting- en ademkoppeling zijn
versterkt. Pitch, formantfrequenties en vibrato zijn bewust niet gekoppeld;
wie vibrato aan druk wil, patcht Press naar `Vib+` met de attenuator. Een
ongepatchte ingang geeft sample-exact dezelfde output als de binary van vóór
deze stap; dat is met een aparte vergelijking van de oude en nieuwe wasm over
vier configuraties (met en zonder velocity, met release) bevestigd.

### Formanten

Vijf tweedegraads gedempte resonatoren worden parallel geëxciteerd. De
frequenties, bandbreedtes en niveaus interpoleren lineair tussen tabellen voor
A, E, I, O en U. De formantfrequenties bewegen niet mee met F0; daardoor blijft
de klinkerkleur bij andere noten herkenbaar.

De tabellen zijn representatieve volwassen-stemwaarden, geen stemidentiteit
en geen articulatorisch mondmodel. `Tone` verandert vooral de resonantieradius
via de effectieve bandbreedte. Ongewijzigde Vowel-waarden herberekenen de
coefficienten niet; `Tone` doet dat momenteel wel bij iedere setter-call.

### Lettergrepen en de synthetische /d/

`kSyllables` in de kern koppelt een index aan een aanzetmedeklinker en een
klinker: 0 = geen aanzet, klinker uit de Vowel-knop/CV (de oorspronkelijke
stem, sample-exact); 1 = /d/ + oe (tabelrij u); 2 = /d/ + a. De keuze wordt
op de stijgende gateflank gelezen (`startNote`); een wijziging tijdens de
noot wacht tot de volgende aanslag. De klinker van een lettergreep blijft
staan zolang de noot klinkt, ook als de Vowel-knop draait.

De /d/ is CHANT-achtig opgebouwd uit drie fasen in `advanceOnset`:

| Fase | Duur | Wat er gebeurt |
|---|---:|---|
| Sluiting | 20 ms | F1-F3 glijden (halve cosinus, per 8 samples) van waar ze stonden naar de startpositie, met bandbreedte oplopend tot het dubbele (gesloten mond is gedempt); alleen F1 wordt aangedreven, stembron op 0,08 × `pitchScale`: de "voice bar"; een zachte aanloop van lucht (`onsetBreath` tot 0,05) zwelt aan; kaak dicht (`jawMix` 0); F0 −60 cent |
| Burst | 8 ms | Witte ruis door een brede resonator (bandbreedte 3000 Hz, "diffuus stijgend" zoals een alveolaire burst) met centrum 3600 + 0,8 × F2(klinker), begrensd op 3500-5500 Hz; gain 0,3 × (0,6-1,0 naar ronding van de klinker) × `pitchScale`; kwadratisch uitdovend; stembron op 0,4; F2-F5 komen lineair op van 0 naar vol (anders een tik) |
| Glijbaan | 50 ms | Halve-cosinusovergang van start naar klinker: F1 in 25 ms, F2 en F3 in 50 ms (update per 8 samples), bandbreedtes van dubbel terug naar de klinker terwijl de gain op de klinkerdemping blijft; stembron groeit van 0,4 naar 1; de aanlooplucht sterft weg; `jawMix` volgt F1; F0 stijgt van −60 naar 0 cent (Haggard e.a. 1970: stemhebbende plosieven beginnen laag en stijgend, stemloze hoog en dalend) |

`pitchScale` = clamp(F0 / 220, 0,5, 3). De klinker van FOF is bij 880 Hz
ongeveer 16 dB luider dan bij 110 Hz (F1 valt dan op een boventoon), dus een
vaste burst en voice bar zijn laag een /t/ en hoog onhoorbaar. Dit is een
pleister: de echte oorzaak is dat de formantniveaus met F0 schommelen, wat
een zanger ook heeft maar minder extreem.

Startpositie per plaats van articulatie, als **locus-vergelijking** (Sussman
e.a. 1991; de d "leunt" al naar de klinker die volgt, Öhman 1966). Voor de
alveolaire /d/: F1 200 Hz, F2 = 0,45 × F2(klinker) + 1150 Hz (da start op
1668 Hz, doo op 1465 Hz), F3 2600 Hz. De eerste versie had een vaste locus
(F2 1800 Hz) en één exponentiële glijbaan van 60 ms voor alle drie; dat
klonk voor doo goed en voor da onnatuurlijk, omdat de sprong van F1 200 naar
800 Hz en F2 1800 naar 1150 Hz in hetzelfde trage tempo liep.

**Intrinsieke klinkereigenschappen.** De klinkertabel heeft drie extra
kolommen die met de kaakopening meekomen: toonhoogte in cent (a −12, e −4,
i 0, o −6, u 0; open klinkers zingen iets lager, Whalen & Levitt 1995, hier
klein gehouden omdat zangers het grotendeels compenseren), niveau in dB
(a +2,5, e +1, o +1,5) en een ademfactor op de Breath-knop (a ×1,6, e ×1,2,
o ×1,3, zodat Breath 0 schoon blijft; Lehiste & Peterson 1961 voor luidheid). Ze worden lineair mee-geïnterpoleerd met de
Vowel-morf en vermenigvuldigd met `jawMix` (0 tijdens de sluiting, met F1
mee open tijdens de glijbaan, 1 daarna), zodat de toon pas zakt en de lucht
pas toeneemt terwijl de mond opengaat. Hierdoor is de losse klinker (Syl 0)
**niet meer sample-exact** gelijk aan de oorspronkelijke stem: a is 2,5 dB
luider, 12 cent lager en bij gelijke Breath-stand ademiger. De periodiciteitstest zoekt daarom
de beste periode binnen 3 procent en controleert de −12 cent van de a.

Na de glijbaan worden de formantcoëfficiënten exact uit de klinkertabel
herladen, zodat de stationaire klank bitgelijk is aan de losse klinker. De
stembron is tijdens burst en glijbaan gedempt omdat F1 op de startpositie
vlak bij een lage grondtoon ligt en de overgang anders luider is dan de
klinker. Er is nog geen slotmedeklinker (gate dicht = gewone release) en
geen stemloze tegenhanger (/t/ zou een langere, stillere sluiting en een
latere steminzet krijgen).

Metingen op 220 Hz (droog): de sluiting ligt 70 procent onder de gewone
klinkeraanzet, het burstvenster van doo heeft achttien keer zoveel
hoogfrequente energie als de klinker op dezelfde plek, en vanaf 200 ms is de
RMS gelijk aan die van de losse klinker.

Luisterrondes: ronde 2 "doo klinkt best goed, da heel onrealistisch" (vaste
locus, één glijbaan); ronde 3 na de coarticulatie "de d in doo lijkt iets
meer een t, da zit tussen ba en ma". Diagnose: de smalle, relatief sterke
burst (800 Hz breed) klonk stemloos, en de sluiting dreef alle vijf
formanten aan, wat het murmur van een nasaal is in plaats van de lage voice
bar van een gesloten d. Ronde 4 na de voice bar: "da is beter; doo heeft een
korte tik aan het begin; hoe lager de toon hoe meer da als ta klinkt, hoe
hoger hoe minder de d te herkennen is". Diagnose: de tik was de stap waarmee
F2-F5 aan het begin van de burst van nul naar vol gingen; het toonhoogte-
effect is het vaste burst-/voice-barniveau tegenover een klinker die 16 dB
in niveau varieert over 110-880 Hz. De toonhoogte-stap pakt beide aan en
voegt de F0-dip bij de steminzet toe. Ronde 5: "veel beter, ze ploppen nog
wel een beetje", met de suggestie van een zachte aanloop van stem en lucht.
Diagnose plop: F1-F3 sprongen bij de gate in één sample naar de locus en
daarna per 32 samples verder, terwijl de resonatoren (Q rond 10) nog
energie vasthielden; elke coëfficiëntensprong zet die energie om in een
lage bons. De plop-stap laat de formanten ook de sluiting in glijden, werkt
per 8 samples bij en dempt F1-F3 tijdens de aanzet. Daarbij de aanloop van
lucht uit de suggestie (de stem-aanloop was er al als voice bar). Nog niet
beoordeeld. Bekend uit de
literatuur: ook bij echte zangers wordt de medeklinker boven ~500 Hz slecht
verstaanbaar (Scotto di Carlo & Germain 1985), omdat de boventonen te ver
uit elkaar liggen om formantbewegingen te volgen.

### Envelope, ruis en output

- attacktijd: 18 ms;
- releasetijd: 120 ms;
- vibrato: sinus op 5,3 Hz, tot een halve toon;
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
- lettergrepen: sluitingsdip, burst, convergentie naar de klinker (doo op
  oe, da op a), `syl_cv`-keuze en `syl_amt`, keuze pas bij de volgende gate,
  hertrigger speelt de aanzet opnieuw, extreme da op 880 Hz zonder clipping;
- Pressure: ongepatcht == 1 (sample-exact), begrenzing boven 1, monotoon
  stijgende RMS over 0/0,25/0,5/0,75/1, vloer tussen 5 en 30 procent van vol,
  zachtere sluiting bij druk 0, meer hoogfrequente ademruis bij lage druk,
  een sprong 0 naar 1 zonder stap en binnen ~120 ms uitgemiddeld, en 40
  snelle drukwisselingen bij 880 Hz zonder NaN of clipping;
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

Laatste bekende resultaten op 2026-10-01 (na de Pressure-stap):

- WASM-binary: 73.889 bytes;
- rooktestpiek ongeveer 0,164 en circa 0,2-0,3 procent van realtime op de
  ontwikkel-pc; dit is geen betrouwbare browser- of Teensy-CPU-meting;
- gerichte FOF-editortests: 9 geslaagd (186 contracttests totaal); volledige
  typecheck geslaagd;
- WASM-binary na de plop-stap: 76.925 bytes; de losse klinker is
  sinds die stap bewust niet meer sample-exact gelijk aan de eerste versie
  (intrinsieke toonhoogte/niveau/adem per klinker);
- Teensy-build: geslaagd, 57.024 bytes vrije RAM1 en 269.408 bytes vrije RAM2
  (ongewijzigd);
- niet geflasht en niet fysiek beluisterd.

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

## Meetresultaten 2026-10-01

De Pressure-stap uit de vorige versie van dit document is gebouwd zoals
voorgesteld (default 1, 20 ms smoothing, drie kleine koppelingen; zie
[Pressure](#pressure)). Daarna is de luistermatrix als script gerenderd:

```powershell
node tools/mmb-wasm/render-fof-matrix.mjs            # naar %TEMP%\mmb-fof-matrix
node tools/mmb-wasm/render-fof-matrix.mjs D:\pad     # of een eigen map
```

Matrix: F0 110/220/440/880 Hz × klinker A/I/U × Voice 0/0,35/1 × Pressure
laag 0,2/midden 0,6/hoog 1/sweep × Breath 0/0,3, droog, vibrato 0, tone 0,5,
gate 1,2 s van 1,4 s. Dat zijn 288 takes plus een aliasingreeks tot 1760 Hz.
Per take staan RMS, piek, spectraal zwaartepunt, energie boven 4 kHz en (bij
vaste druk zonder adem) een aliasingmaat in `report.json`: energie tussen de
harmonischen van F0 (buiten ±4 bins van k·F0, Blackman-Harris, 32768 punten)
tegenover energie op de harmonischen. Bij 44,1 kHz is 44100 mod F0 = 100 Hz
voor alle vier de F0's, dus gevouwen partiëlen vallen ruim buiten de hoofdlob.
Het script schrijft 23 wav's om te beluisteren: pressure-sweeps (alle F0's en
klinkers, Voice 0,35, Breath 0,3), laag/midden/hoog op 220 Hz A, en Voice 0
tegenover 1 op 440 en 880 Hz, ook op gelijke RMS (`-rms-0.1`). De wav's staan
bewust niet in de repo; render ze opnieuw met het script.

### Pressure-respons (klinker A, Voice 0,35), na de herbalancering

| F0 | Breath | RMS laag | RMS midden | RMS hoog | Centroid laag naar hoog |
|---:|---:|---:|---:|---:|---|
| 110 | 0 | −43,7 | −38,5 | −33,4 dBFS | 310 naar 620 Hz |
| 110 | 0,3 | −35,1 | −34,2 | −32,3 dBFS | 10004 naar 3056 Hz |
| 220 | 0 | −35,2 | −31,6 | −28,7 dBFS | 587 naar 701 Hz |
| 220 | 0,3 | −32,4 | −30,3 | −28,2 dBFS | 5625 naar 1642 Hz |
| 440 | 0 | −29,1 | −25,8 | −23,3 dBFS | 745 naar 812 Hz |
| 880 | 0 | −21,2 | −18,9 | −17,4 dBFS | 887 naar 894 Hz |

Lezing: lage druk is nu 4-10 dB zachter dan volle druk (was 9,5-13 dB); het
restant boven de 6 dB-vloer komt van de langere sluiting, die bij lage F0 ook
energie kost. Het zwaartepunt zakt bij lage druk duidelijk (110 Hz: 620 naar
310 Hz). Met `Breath` 0,3 wordt lage druk sterk ademig; bij 110 Hz laag ligt
de energie boven 4 kHz nog maar 1,4 dB onder het totaal. Als dat op oor te
ruisig is, verlaag de 1,5 in `aspirationGain` (bijvoorbeeld 0,8); als de
sluiting te dof wordt, verlaag de 0,45 in `voiceTarget()`. De `Prs`-
attenuator schaalt alle drie samen, niet hun onderlinge balans.

### Luisterronde 1 (2026-10-01)

Mark heeft aftertouch (MIDI-IN `Press`, via een telefoon-app) op `Press`
gepatcht met de eerste koppelingsset (vloer 0,15, adem +0,75, Voice +0,25).
Oordeel: "vooral veel harder bij druk, weinig ander verschil". Dat is
consistent met de meting (tot 13 dB volumeverschil tegenover een klein
zwaartepuntverschil) en is de aanleiding voor de herbalancering hierboven.
Tweede wens uit dezelfde ronde: `Vibrato` en `Voice` als CV-ingang en een
attenuator op alle ingangen; beide zijn gebouwd. Daarna bleek de vibrato
"zwak" en leek de attenuator niets te doen: de maximale diepte was 22 cent.
Die is naar 100 cent gezet. Het paneel is nu 14 HP: knoppen boven, `Syl` en
Level in het midden, V/Oct-Gate-Out, en zeven attenuators recht boven de
zeven CV-jacks onderaan. De nieuwe Pressure-balans, de vibratodiepte en
doo/da zijn nog niet op oor beoordeeld.

### Spelconcept: linkerhand kiest, rechterhand speelt

Mark's idee (2026-10-01): een beperkte set lettergrepen op een pad-panel op
telefoon of tablet dat per pad een CC-waarde stuurt, en de melodie op het
MIDI-klavier. Dat lost het timingprobleem van medeklinkers op: de keuze is
bekend vóór de aanslag, dus de aanzet start direct op de gate zonder
voorspellen. `syl_cv` volgt daarom de ZANG-conventie (0..1 over de tabel).
Testrepertoire: "doo/da" (Police) met de huidige tabel; "va der ja cob slaapt
gij nog al le klo ken lui den bim bam bom" vraagt v, d, r, j, k, b, s, l, p,
t, g, n, m en de klinkers aa, schwa, o, oe, ij en ui, dus meerdere stappen.

### Aliasing (klinker A, volle druk, Breath 0)

| F0 | Voice 0 | Voice 0,35 | Voice 1 |
|---:|---:|---:|---:|
| 110 | −89 | −90 | −89 dB |
| 220 | −77 | −88 | −87 dB |
| 440 | −66 | −85 | −95 dB |
| 880 | −53 | −79 | −88 dB |
| 1320 | −44 | −61 | −73 dB |
| 1760 | −34 | −58 | −72 dB |

Lezing: aliasing zit vrijwel volledig in de korte sluiting van `Voice=0`
(4 procent van de periode, bij 880 Hz twee samples). Tot en met 880 Hz blijft
het onder −52 dB ten opzichte van de harmonischen; op de standaardstand 0,35
onder −79 dB. Boven 1 kHz met Voice 0 wordt het meetbaar fors (−34 dB bij
1760 Hz). Klinker I en U liggen binnen 1-2 dB van A. Er is dus geen reden om
de bron nu om te bouwen; wel om te beluisteren of `Voice` onder circa 0,15 op
hoge noten scherp of "digitaal" klinkt. Als dat zo is, is de eerste optie uit
de eerdere lijst de goedkoopste en meest gerichte: de minimale sluitduur
(`closure = 0.04 + 0.20 * voice`) laten meegroeien met F0, zodat de sluiting
nooit korter wordt dan ongeveer vier samples. Oversampling of een andere bron
is op basis van deze meting niet nodig.

### Wat de meting niet zegt

- Geen luisteroordeel: de tabellen zeggen niets over zangkarakter,
  controleerbaarheid of hoorbaarheid van stappen. Beoordeel de 23 wav's op
  oor met de eerder afgesproken criteria: zangkarakter, controleerbaarheid,
  helderheid zonder scherpte, hoorbare stappen of klikken, pitchstabiliteit
  en ruisgedrag bij lage druk. Leg vooraf vast welk hoorbaar verschil een
  hypothese bevestigt of weerlegt.
- Geen Teensy-meting: CPU en klank op de hardware zijn niet gemeten.
- De aliasingmaat telt periode-jitter (de sluiting valt per periode op een
  andere fractie van een sample) mee als "tussen de harmonischen"; dat is
  bewust, want het is even onharmonisch.

## Aanbevolen vervolg

1. **Beluisteren, ronde 2.** Zelfde patch als ronde 1 (aftertouch op
   `Press`), nu met de herbalanceerde koppelingen; zet `Breath` rond 0,2 om
   de ademkoppeling te horen en draai `Prs` terug als het geheel te veel
   doet. Noteer per criterium een oordeel. Pas daarna koppelingsfactoren
   aan (eerst `aspirationGain`, zie boven).
2. **Doo/da op oor, ronde 6.** Speel de Police-riff met `Syl` of CC1 op
   `Syl+` op lage, midden en hoge noten; vergelijk met de vorige versies
   (0c0c1a8, b1caa64, 71b82c3, 19c9ec2). Knoppen: `pitchScale`-grenzen, de
   −60 cent F0-dip, burstgain 0,3, de rondingsfactor 0,6, de aanlooplucht
   0,05 en de bandbreedteverdubbeling tijdens de aanzet. Te
   beoordelen: is da nu geloofwaardig, is de d herkenbaar, is de aanzet niet
   te luid of te zacht (burstgain 0,4 en de stembrondemping 0,15/0,4 in
   `advanceOnset`), is de −12 cent van de a storend in een melodie (dan de
   `cents`-kolom verkleinen), stoort de 20 ms vertraging van de klinker.
   Daarna pas uitbreiden: eerst /b/ en /g/ (alleen een andere `Place`:
   labiaal ongeveer slope 0,8 en intercept 200 Hz, velair slope ~0,9), dan
   /t/-/k/-/p/ (stemloos: langere sluiting, latere steminzet), dan
   /m/-/n/-/l/ en de slotmedeklinker bij gate dicht.
3. **Sluitduur bij hoge F0** alleen als het luisteroordeel Voice 0 boven
   ongeveer 1 kHz scherp vindt; houd de `Voice`-regressie (spectral tilt) en
   de sample-exacte compatibiliteit bij volle druk in stand.
4. **Teensy-proef:** flashen, MIDI-IN `Press` naar `Press` patchen met een
   aftertouch-klavier en de `vel`-kabel lostrekken om `onCvDisconnected` te
   horen werken.
5. **Pressure via breath controller:** MIDI-IN levert naast `press`
   (aftertouch) ook CC1/CC2; een breath controller (CC2) kan dus nu al via de
   CC2-uitgang, zonder firmwarewerk.

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
- De module heeft één synthetische medeklinker (/d/) en twee lettergrepen;
  geen woorden, slotmedeklinkers, tweeklanken of melisma's.
- FOF en ZANG hebben verschillende rollen: berekende bespeelbare klinker versus
  PSOLA-resynthese van opgenomen/gegenereerde lettergrepen.

## Definition of done van de Pressure-stap

- [x] browser en Teensy gebruiken dezelfde control en formule (`FofVoice`);
- [x] een ongepatchte Pressure-ingang is sample-exact compatibel met de stem
      van voor deze stap (oude en nieuwe wasm vergeleken);
- [x] geautomatiseerde tests dekken smoothing, bereik, monotonie, vloer,
      timbre, sprongen en release af;
- [x] WASM-, gerichte editor-, typecheck- en Teensy-builds slagen;
- [x] droge opnames en spectra met instellingen zijn reproduceerbaar te
      renderen (`render-fof-matrix.mjs`, `report.json`);
- [x] de gemeten aliasing is gedocumenteerd;
- [x] eerste luisterronde gedaan en verwerkt (herbalancering, CV's,
      attenuators); tweede ronde met de nieuwe balans staat open;
- [ ] alleen eigen FOF-hunks zijn gecommit (controleer bij de commit).
