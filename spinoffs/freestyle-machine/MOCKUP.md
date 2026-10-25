# Freestyle-machine: mockup op de laptop

Plan, 2026-10-25. Status: **stap 1–3 gebouwd (2026-10-25), nog niet
beluisterd**: maatklok + arm/fire, de trap-patch en de pagina staan in
`editor/src/freestyle/` en zijn bereikbaar via `?app=freestyle` (of de knop
Freestyle in de editorkop); live sinds 2026-10-25 en door Mark bevestigd
("werkt uitstekend"). Daarna de twee andere stijlen (boom bap 88, bounce 100)
met een stijlkeuze op het scherm, en een telefoonlayout (één kolom, DROP
vasthouden, NEXT, FILL, stems 2×2; tikken op de stijlnaam = volgende
stijl). Touch op een echte telefoon nog door Mark te bevestigen.
Korte Engelse handleiding voor de telefoon: [QUICKSTART.md](QUICKSTART.md);
in de app een rondleiding (PlayTour met eigen stappen, bij het eerste
bezoek en via ?).
De ringbuffer (§4.7) is gebouwd: `MasterRecorder` met `keepSeconds`,
SAVE (knop en S) schrijft de laatste twee minuten als wav; de buffer
pauzeert bij STOP. Ook gebouwd (2026-10-25, avond): MIC (stem in een eigen
ringbuffer, SAVE geeft beat én voice apart, echo-onderdrukking aan),
einde-fill bij STOP (nog eens = meteen stil), Autopilot (variatie per frase
in een rondje van vier, fill in elke vierde frase), tempo ± per bpm.
FILL-verfijning en de beatbox-laag staan open. Marks vraag naar een
formaat voor de hele take (muziek + stem + instellingen) is geparkeerd:
het zou een eventlog (stijl, tempo, elke gewapende actie met tel) naast de
voice-wav zijn, geen MIDI; let op dat Grids met Chaos > 0 niet
deterministisch terugspeelt. Tegenhanger van
het hardwareplan [PLAN.md](PLAN.md); voert stap 1 t/m 3 van de
[review van 2026-08-31](REVIEW-2026-08-31.md) uit ("bouw eerst een
softwarematig bewijsmodel met gewone knoppen").

Vraag van Mark: een werkende simulator, zoals de Modular Brain-simulator,
om het idee op de computer te demonstreren en bij een vriend (rapper) op
zijn eigen laptop te laten proberen. Zijn antwoorden op de eerste vragen:

- liever **eigen gegenereerde beats** dan zijn karaoke-bestanden;
- **trager dan 140**: de referenties zijn trap in half-time (gevoeld rond
  70) en boom bap / bounce (83–100);
- de **maat** speelt een kleine djembe en soms een Stratocaster of een
  westerngitaar, en wil **geen pedaal**: hij speelt mee;
- het **scherm is Engels** (eerst), zodat Mark en de vriend het beide lezen.

**Positionering** (Mark, 2026-10-25): dit is een variant op MusicBrain die
minder besturing en meer zelf een instrument is. Dezelfde insteekkaarten
blijven bruikbaar als een rapper meer analoog geluid wil: de analoge 808- of
CR-78-schakeling, echte filters, echte VCO's en VCA's. De doos wordt dan
groter, maar het kan, en het haalt druk van de Teensy. Plan en positionering
komen later; eerst de mockup.

## 1. Referenties

Vijf instrumentals die de vriend stuurde (25-10-2026), met het tempo uit
de databases; tussen haakjes de gevoelde puls.

| Nummer | Database | Gevoeld | Stijl |
|---|---|---|---|
| Soulker, "Bang" | niet gevonden | ? | Poolse beatmaker, World Tour Vol. 1 (2022) |
| Iggy Azalea, "Sally Walker" instr. (prod. Dices) | 140 | 70 | trap half-time, piano-motief, 808 |
| PRO8L3M, "Molly" instr. (Steez83) | 140 | 70 | donkere trap, kaal |
| Timbaland & Magoo, "Cop That Shit" instr. | 202 | ~101 | Timbaland-bounce, stotterende kick |
| Fugees, "How Many Mics" instr. | 83 | 83 | boom bap, bas-loop, sparse drums |

Wat ze gemeen hebben, en wat de generator dus moet kunnen:

- **Kaal en donker.** Een 808-kick met toonglijder die ook de bas is, snare
  of clap op de 3 (half-time) of op 2 en 4, hi-hats in zestienden met
  rolletjes en triolen. Mineur, weinig noten.
- **De melodie is een motief, geen akkoordenschema.** Twee tot vier noten
  piano of pluck, vier of acht maten, en dan nog eens. Eén of twee akkoorden
  per loop.
- **Variatie is weglaten.** Hats eruit, bas eruit, alleen het motief, dan
  alles terug op de 1. Fills zitten in de hats (een roll aan het eind van
  de vierde maat), niet in de kick.
- **Timbaland is de uitzondering**: gesyncopeerde, stotterende kick en
  bounce. Dat wordt een eigen stijl naast trap en boom bap.

## 2. Hoe rappers en loopers werken (onderzoek 2026-10-25)

- **De frase is vier maten.** In een cypher wisselen deelnemers per vier
  bars; een vers is 16, een hook 8. Een rapper telt niet, hij hoort de "1".
  De machine moet die "1" hoorbaar en zichtbaar maken en alles aan
  frasegrenzen hangen.
- **De DJ-trucs zijn weinig en simpel:** beat wegtrekken voor een punchline
  en op de 1 terugbrengen, een fill aan het eind van de 4, naar de hook.
- **Het BeatBuddy-pedaal heeft de bediening al uitgevonden** (voor
  gitaristen): één schakelaar, tik = fill, vasthouden = overgang naar het
  volgende deel (landt op de maat), dubbeltik = einde. De tweede generatie
  heeft een "Autopilot" die fills en overgangen zelf plant. Dit is de
  grammatica die wij overnemen; hij bevestigt het arm/fire-principe uit
  PLAN.md.
- **RC-505 en RC-600** zijn opnemen-overdubben-muten per spoor met veel
  knopcombinaties (druk, houden, dubbelklik) en lagen eronder. Dat is de
  complexiteit die de vriend afschrikt. Het bruikbare deel: een paar
  sporen, gekwantiseerd starten, mute per spoor op de volgende maat.
- **Beatbox naar drumcomputer** werkt met grenzen (Vochlea Dubler): snel
  en nauwkeurig bij ongeveer vier klanken, mistriggers boven de drie, alle
  MIDI moet achteraf gepoetst, lage latency alleen met hun eigen USB-mic.
  Les: **niet live triggeren maar luisteren, analyseren en dan afspelen.**
  Dan telt latency niet en mag de analyse niet-causaal zijn.
- **Freestyle-apps** (Rhymeable, Rap Skool, RapBeats) zijn oefenmateriaal:
  woordprompts op de beat, tap tempo. Niets doet secties, variatie of
  meespelende muzikanten. Daar zit ons gat.

Bronnen: Sound on Sound over BeatBuddy Mini en BeatBuddy 2, Roland-
persbericht RC-505mkII/RC-600, MusicTech over Dubler 2, Ableton-interview
met SK Shlomo, ISMIR 2005 en ICASSP 2015 over beatboxclassificatie,
songbpm.com voor de tempo's.

## 3. Uitgangspunten (uit PLAN.md en de review, blijven staan)

1. **Niets gebeurt op de flank.** Elke bediening bewapent een verandering
   die landt op de volgende maat of de "1" van de volgende frase.
2. **DROP is asymmetrisch.** Beat weg: direct, met een klikvrije ramp van
   een paar ms. Beat terug: op de gekozen grens (tel of maat), ook met
   ramp. DROP werkt op de eindmix, niet per stem, zodat tails en de
   recorder hetzelfde horen.
3. **Altijd opnemen, achteraf bewaren.** Een ringbuffer van de laatste
   twee minuten (op de laptop gewoon in het geheugen: 23 MB) en één knop
   Bewaren. In de browser is dit triviaal; de review-zorgen over SD en RAM
   gelden de Teensy, niet de mockup.
4. **Eén tempo, de machine is de baas.** TAP zet het, her-tappen tijdens
   het spelen mag (de band drift), de machine volgt niet de band.
   Beat-tracking van een echte drummer is een eigen onderzoek en valt
   buiten versie 1.

## 4. Wat het is

Eén kale pagina in de browser, naast de Modular MB-editor, met een eigen
scherm en een eigen bediening. Onder de motorkap draait een gewone patch
van bestaande modules in de bestaande simulator; de pagina is een
**bedieningslaag** erover: een maatklok, secties, mutes op maatgrenzen, DROP,
de ringbuffer en een scherm voor iemand die staat.

### 4.1 Scherm

Ontworpen voor iemand die staat, zelden kijkt en slecht licht heeft.

- Eén groot getal: **BPM**. Daaronder de tel in de frase (1-2-3-4, en
  welke maat van de vier).
- **Een fel vlak dat op de "1" van elke frase flitst**, perifeer zichtbaar.
  Dat is de echte UI, ook voor de maat met de djembe.
- **Toonsoort en huidig akkoord**, groot, voor de gitarist (bijv. "Fm" en
  "Fm · Db"). Zonder dit kan de maat niet meespelen.
- De **sectienaam** (A / B / HOOK) en, als iets gewapend staat, wat er op de
  volgende grens gebeurt ("→ B op 1", "HATS uit op maat").
- Vier **stemknoppen** met aan/uit-stand: KICK · SNARE · HATS · MOTIEF.
- Onderaan klein: ● opname loopt, Bewaren, stijlkeuze, dichtheid.

Geen menu's in speelstand. Alles wat instelt (stijl, toonsoort, tempo als
getal, "percussie speelt mee") zit achter één knop Instellen, en die is
tijdens het spelen niet nodig.

### 4.2 Bediening

Toetsen op de laptop; een pedaal is optie, geen eis.

| Actie | Toets | Kwantisering |
|---|---|---|
| **DROP** | spatie ingedrukt houden | uit: direct; terug: volgende tel (instelbaar: maat) |
| **NEXT** (volgende sectie) | → of Enter | volgende frase; nog eens drukken = nog een sectie verder |
| **FILL** | F | op de laatste maat van de frase (de hats rollen) |
| **Stem aan/uit** | 1 2 3 4 | volgende maat |
| **TAP** | T | tempo; vier tikken is genoeg |
| **Bewaren** | S | direct: de laatste twee minuten als wav |
| **Start/stop** | P | start met één maat aftellen; stop = einde-fill, dan stil |

Een goedkoop Bluetooth-bladomslagpedaal stuurt PageUp/PageDown en kan
later NEXT en DROP overnemen zonder driver; een MIDI-voetcontroller via
Web MIDI ook. Beide zijn een mapping, geen nieuw pad.

### 4.3 De vier stems

De "vier tracks die je mute" van de RC-505, maar dan gegenereerd. Elk
heeft een mute die op de volgende maat landt (Level naar 0 met korte ramp).

| Stem | Module(s) | Wat |
|---|---|---|
| KICK/808 | `tp_mmb_peaks` (Drum = Kick) + bas: `tp_mmb_acid` of een sinus met glijder | kick en sub-bas uit één patroon; in trap is dit één ding |
| SNARE/CLAP | `tp_mmb_peaks` (Snare) of `tp_mmb_cr78` | op de 3 (half-time) of op 2 en 4 |
| HATS | `tp_mmb_peaks` (Hat) of `tp_mmb_cr78`, aangestuurd uit `tp_mmb_clock` ×2/×3/×4 via `tp_mmb_grids` HH | zestienden, rolletjes, triolen; dichtheidsknop |
| MOTIEF | `tp_mmb_seq8` → `tp_mmb_chord` → pluck of piano (`tp_mmb_epiano`, `tp_mmb_plaits`), met galm | 2–4 noten, 4 of 8 maten |

Klok: `tp_mmb_clock` als masterklok (Bar, Beat, ×2, ×3, ×4), Grids en de
sequencers op ExtClk. Het patchtempo (`patch.tempo`, doc/plans/tempo.md)
is het ene tempo; TAP zet het via `setPatchTempo`.

### 4.4 Stijlen

Drie stijlen als start, elk met eigen gevoeld tempo, patroonkeuze en
hat-gedrag. Een stijl is een bundel knopstanden en patroonkeuzes, geen
andere patch.

| Stijl | Gevoeld tempo | Kick | Snare | Hats | Referentie |
|---|---|---|---|---|---|
| Trap half-time | 65–80 (standaard 72) | 808 met glijder, sparse | clap op de 3 | zestienden met rolls, triolen | Sally Walker, Molly |
| Boom bap | 80–95 (standaard 88) | droog, op 1 en de "en" | op 2 en 4, swing | achtsten, open hat op de 4 | How Many Mics |
| Bounce | 95–105 (standaard 100) | gesyncopeerd, stotterend | op 2 en 4, rimshot | dun, offbeat | Cop That Shit |

Een schakelaar **half-time/dubbel** verdubbelt alleen de hats, zodat 72
en 144 dezelfde beat zijn met andere hats.

### 4.5 Secties en variatie

Een "song" is een lijstje van drie tot vier secties (A, B, HOOK, soms
BREAK). Een sectie legt vast: welke stems aan staan, de dichtheid van
Grids (X/Y), het akkoord of het akkoordenpaar, de motiefstappen en de
hat-dichtheid. NEXT bewapent de volgende; op de "1" van de volgende frase
schakelt alles **atomair** (alle controlwijzigingen in dezelfde callback).

Variatie zonder NEXT:

- **FILL** rolt de hats op de laatste maat en laat Branches de kick een
  keer overslaan;
- **Autopilot** (uit te zetten): om de twee frases een kleine wijziging
  (hat-dichtheid, een open hat, een akkoordwissel), zodat vier minuten op
  één sectie niet dood is. De BeatBuddy 2 bewijst dat dit gewenst is.

### 4.6 De maat (djembe, gitaar)

- Stand **"percussie speelt mee"**: hats en shakers dunner (Grids HH
  omlaag, geen rolls) zodat de djembe de gaten vult; de kick blijft.
- **Toonsoort en akkoord groot op het scherm**; harmonie uit één of twee
  akkoorden, anders kan de gitarist niet voicen. Een Strat wil ruimte voor
  stabs of echofiguren, een westerngitaar een strum; beide werken alleen
  bij een kaal motief.
- Dezelfde "1"-flits voor hem. Geen pedaal, geen opname van zijn spel in
  versie 1 (hij hoort zichzelf akoestisch).

### 4.7 Opname

De `MasterRecorder` tapt de eindmix (ná DROP). In plaats van start/stop
een **ringbuffer** van 120 s die altijd loopt; Bewaren schrijft de laatste
twee minuten als wav (bestaande `encodeWav` + `downloadWav`). Later:
sectie- en tempomarkeringen als metadata, en de take naar de mediabibliotheek
(`mediaLibrary.ts`).

## 5. Fasen

**Fase 1, beatgenerator (de demo).** Alles uit §4 behalve beatbox en
looper. Eén stijl eerst (trap half-time), dan de andere twee.

**Fase 2, beatbox-programmeur.** Count-in van één maat, twee maten
beatboxen via `tp_mmb_audioin` (of rechtstreeks `getUserMedia`), daarna
niet-causaal: onsets, drie klassen (kick, snare, hat) op spectraal
zwaartepunt plus laagfrequente energie, kwantiseren op zestienden, tonen
op een grid, afspelen met de stems van §4.3. Meer dan drie klassen niet
(Dubler-les). Geen ML voor de mockup; als drie klassen op een echte
beatboxer niet lukken, pas dan een klein model (DrumCoach-aanpak,
TensorFlow.js) overwegen.

**Fase 3, looper.** Twee tot vier sloten, opnemen van de mic op de maat,
mute op de volgende maat, karaoke-mp3 als bron met TAP voor het tempo.
Alleen als de vriend er na fase 1 nog om vraagt.

## 6. Architectuur en bestandenkaart

De pagina stuurt een gewone patch via de bestaande `AudioEngine`
(`editor/src/modular-mb/sim/AudioEngine.ts`): `build(project, patch)`,
`updateControl(moduleId, controlId, value)` voor mutes, dichtheid en
sectiewissels, `setMasterVolume` (met ramp) voor DROP, `recorderTap()`
voor de ringbuffer. Patronen en klank blijven in de wasm-modules; de pagina
doet alleen controlwijzigingen op maatgrenzen. Daardoor kan dezelfde
patch later op de Teensy draaien en wordt de bedieningslaag een front of
een transport, geen tweede synth.

Maatklok: zoals `SongTransport` (`sim/SongTransport.ts`) op de
AudioContext-klok: de patch start op een gepland contextmoment (het
`restart`-mechanisme zet de patroonmodules op maat 1), en de pagina rekent
tel, maat en frase uit `(contextTime − start) × bpm`. Een
`setTimeout`-lookahead van ~100 ms plant de wijzigingen vlak vóór de grens.

```
editor/src/freestyle/
  FreestyleApp.tsx        pagina: scherm, toetsen, Instellen
  Screen.tsx              BPM, tel, flits, akkoord, sectie, stemknoppen
  BarClock.ts             tel/maat/frase op de AudioContext-klok, armQueue
  Performance.ts          DROP, NEXT, FILL, mutes: arm → fire op de grens
  sections.ts             type Section, Song; atomair toepassen op de engine
  styles.ts               de drie stijlen: knopstanden en patroonkeuzes
  freestylePatch.ts       bouwt de onderliggende patch (modules + kabels)
  ringRecorder.ts         ringbuffer op MasterRecorder, Bewaren
  keys.ts                 toetsen → acties (later: pedaal/MIDI-mapping)
  beatbox/                fase 2: onsets, classify, quantize, grid
  *.test.ts               BarClock, arm/fire, sections, classify (synthetisch)
```

Ingang: `?app=freestyle` naast `?lang=`/`&mode=` in `App.tsx`, zodat de
pagina op editor.musicbrain.nl staat en op de laptop van de vriend draait
zonder installatie. De patch komt niet in de patchcatalogus (geen seed),
tenzij hij ook als gewone patch nuttig blijkt.

Hergebruik, niet opnieuw bouwen: `TempoTap` / `setPatchTempo` (tempo),
`MasterRecorder` / `encodeWav` / `downloadWav` (opname), `tp_mmb_audioin`
(mic), `engineSingleton` (één engine), de i18n-laag voor een Engelse
stand (de vriend is Pools; UK English volstaat, zie
`speelmodus-engels`).

## 7. Volgorde

1. `BarClock` + arm/fire als pure TypeScript met tests over frasegrenzen,
   tempowissel tijdens gewapende actie, DROP+NEXT tegelijk, wrap-around.
2. `freestylePatch.ts`: één stijl (trap half-time) als patch, handmatig in
   de editor beluisterd en met de patchcontrole (`patchCheck.ts`) langs.
3. `FreestyleApp` + `Screen` + toetsen: start, DROP, NEXT, mutes, TAP.
4. Ringbuffer + Bewaren.
5. Secties, FILL, Autopilot; de twee andere stijlen.
6. Stand "percussie speelt mee" en het akkoordscherm; eerste proef met
   Mark aan de djembe of de gitaar.
7. Demo bij de vriend op zijn laptop; pas daarna fase 2.

## 8. Wanneer is de demo goed

- DROP mute de eindmix binnen 10 ms en komt klikvrij terug op de tel.
- Elke NEXT, FILL en mute landt in een proef van tien minuten zonder
  gemiste of dubbele actie op de juiste grens.
- Een rapper kan vier minuten op één sectie met Autopilot rappen zonder
  dat het dood klinkt, en de gitarist weet altijd in welk akkoord hij zit.
- Bewaren levert de laatste twee minuten als wav die klopt met wat je
  hoorde.
- Het hele ding draait op een gewone laptop in Chrome zonder onderbrekingen
  (het moduleaantal is een fractie van een gewone patch).

## 8a. Wat er staat (2026-10-25)

| Bestand | Wat |
|---|---|
| `editor/src/freestyle/barClock.ts` | `BarClock` (tel/maat/frase op de contextklok, tempowissel zonder sprong) en `ArmQueue` (gewapende acties per tel) |
| `editor/src/freestyle/style.ts` | `Stem`, `Change`, `Section`, `Style`; de stijlen TRAP (140, Grids op x2), BOOM_BAP (88, swing) en BOUNCE (100), elk vier secties, eigen klank (`sound`) en fill |
| `editor/src/freestyle/freestylePatch.ts` | bouwt de vaste patch (Clock → Grids op x2 → Peaks ×3 + Acid; accenten → Seq → E-piano → Reverb) |
| `editor/src/freestyle/performance.ts` | `Performance`: start/stop, DROP (direct omlaag, terug op de tel), NEXT (frase), stems (maat), FILL (één maat), TAP, percussionist; geeft `Fired`-pakketjes terug |
| `editor/src/freestyle/FreestyleApp.tsx` | het scherm en de toetsen; plant de pakketjes op de `AudioEngine`; stijlkeuze (tik/S = volgende) bouwt de patch opnieuw (stopt de beat); laptop- en telefoonlayout (≤ 700 px) met grote DROP/NEXT/FILL-knoppen |
| `editor/src/freestyle/ringRecorder.test.ts` | de ringbuffer-trim (`trimParts` in `sim/wavRecorder.ts`) |
| `*.test.ts` | klokgrenzen, tempowissel, DROP+NEXT tegelijk, wrap-around, fill, percussionist, patchcontrole per stijl, ringbuffer |

Afwijkingen van het plan hierboven: de bas is geen eigen stem maar zit in de
kick-stem (elke kick slaat ook de 808-sub aan, de bassequencer schuift per
kick een noot); Grids loopt op de halve klok zodat zijn 32 stappen één frase
zijn en de snare in half-time op de 3 valt; FILL landt op de volgende maat,
niet per se op de laatste van de frase. `AudioEngine.setMasterVolume` kreeg
een ramp-parameter voor de DROP.

## 9. Open vragen

- Soulker, "Bang": tempo en stijl nog niet bekend; tikken op het nummer.
- Wil de vriend Engels of Pools op het scherm? (Engels is er bijna gratis.)
- Krijgt de rapper zelf later een pedaal, of blijft het de laptop plus
  iemand die drukt? Bepaalt of NEXT en DROP op één schakelaar moeten
  (BeatBuddy-grammatica) of twee.
- Fase 2: op welke microfoon beatboxt hij (laptop-mic of een SM58 via
  interface)? Bepaalt de onsetdrempels.
