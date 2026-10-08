# Overdub: vier sporen in de speelmodus

Voorstel, 2026-10-08. Vraag van Mark: een ritmepatch combineren met een bas,
een akkoord en een melodie, na elkaar ingespeeld, als sporen, hoogstens vier,
"a bit like overdubbing", ook op de telefoon.

## 1. Wat het is

Een vierspoors bandrecorder naast het klavier. Spoor 1 speel je in op de
patch van dat moment; daarna kies je een andere patch en speel je spoor 2 in
terwijl spoor 1 meeklinkt; enzovoort tot vier. Elk spoor is een take zoals de
opnameknop die nu al maakt: **wav + mid + patch**. Afspelen is de som van de
wavs plus wat je live speelt.

Dat is bewust *audio-overdub* (tape), niet "vier patches tegelijk draaien":

- de simulator draait één patch; vier patches tegelijk zou een nieuw
  engine-model vragen en op de Teensy niet passen;
- een wav afspelen kost niets, op de telefoon ook niet;
- de mid en de patch per spoor blijven bewaard, dus een spoor is later nog
  opnieuw te renderen (andere patch, andere knopstand) of te bewerken in
  de take-editor.

## 2. Wat er al is

| bouwsteen | waar | wat het doet |
|---|---|---|
| `MasterRecorder` | `sim/wavRecorder.ts` | neemt de master-som op als wav |
| MIDI-recorder | `sim/midiRecorder.ts` | de gespeelde noten, cc, bend, druk |
| `MidiFileSource` | `sim/midiFilePlayer.ts` | speelt een .mid in de engine, met lus en seek |
| take (wav + mid + patch) | `SimulationPanel` `stopRec` | de opname van nu |
| take-library | `sim/takeLibrary.ts` | bewaren in de browser, naar Imprint |
| take-editor | `sim/TakeEditorWindow.tsx` | bijsnijden, exporteren (ook als Reaper-project) |
| `simOut` | `AudioEngine` | vaste uitgang; de master hangt eraan |

Nieuw is dus vooral het **song**-model, de **transport** en de **sporenstrip**.

## 3. Ontwerp

### Song

```
Song { id, name, bpm, bars, metronome: boolean, tracks: Track[] (≤ 4) }
Track { id, name, take: Take (wav, mid, patch.json), gain, pan, mute }
```

Een spoor is precies één **regio** lang: de lus. Volume en pan staan per
spoor in de strip, vóór het opnemen al (ze gelden bij het afspelen; wat op
de wav komt is de patch met zijn eigen Level). Na het inspelen van alle
sporen kun je afspelen, de mix bijstellen en dan bewaren of exporteren.

**Bewaren is een handeling**, nooit automatisch (regio's opnieuw inspelen
zou anders een stapel bestanden geven): ⤓ bewaart de song in de take-library
(IndexedDB) onder één groep, mét de mixdown. **Exporteren** geeft bij drie
sporen zeven bestanden: `mix.wav`, `1.mid`/`2.mid`/`3.mid` en
`1.patch.json`/`2.patch.json`/`3.patch.json`, plus (optie) de wav per spoor.
Reaper-project met vier sporen later (de exporter bestaat al voor één).

**Laden**: een bewaarde song uit de library komt met zijn sporen terug (de
wav per spoor zit erin). Een export zonder wav per spoor is later ook te
laden door elk spoor uit zijn mid en patch opnieuw te renderen (de sim kan
een mid door een patch spelen; headless, zoals de patch-library meet).

### Transport

- **Regio.** De lus is de regio: tempo (van de patch, anders 120) en een
  aantal maten, in te stellen vóór spoor 1 (standaard 2 maten). Alles loopt
  rond, zoals een looper; er is geen lineaire stand (besluit 2026-10-08).
- **Opnemen van spoor n.** Druk op ● bij een spoor: één maat aftellen
  (altijd; de metronoom tikt mee, aan of uit als optie), dan spelen de
  andere sporen af en neemt de recorder precies één regio op. Daarna blijf
  je op dat spoor: je hoort het terug in de lus en kunt het opnieuw doen,
  tot je zelf naar een volgend spoor gaat. Het spoor krijgt de patch van dat
  moment. Je voegt dus regio's toe, één per spoor.
- **Timing.** Afspelen en opnemen starten op dezelfde `AudioContext`-tijd:
  de `Tone.Player`s van de sporen en de `MasterRecorder` delen één
  startmoment, dus de sporen liggen sample-precies op elkaar. Het klavier
  heeft de latency van Web Audio (~10–30 ms op een telefoon); dat hoor je
  als speler, niet in de opname (die neemt de engine op, niet de
  luidspreker).
- **Alleen het nieuwe spoor** komt op de wav: de spoor-players hangen aan
  `simOut`, naast de master, niet erdoorheen; de recorder tapt de master.

### Sporenstrip (speelmodus)

Achter de opnameknop, onder het klavier, één regel per spoor:

```
● 1  Ritmebox        ▮▮▮▮▮▮▮▮▮▮▮▮  🔈  ✕
● 2  SID bas         ▮▮▮▮▮▮▮▮      🔈  ✕
● 3  —  (patch van nu: E-piano)
     4  —
▶ ■  ⟲ lus   1 maat aftellen   ⤓ bewaren
```

- ● bij een leeg spoor = opnemen; bij een vol spoor = opnieuw (vraagt).
- De naam is de patchnaam; tikken erop laadt die patch (om er nog even op
  te spelen of hem bij te draaien); de patch zit in het spoor.
- 🔈 dempen, ✕ weg, en per spoor een volume- en een panknop (ook vóór het
  opnemen al te zetten).
- Op een telefoon: dezelfde strip, de balkjes zijn de golfvorm van de take
  (de take-editor tekent die al).

### Teensy (fase 2)

De sporen spelen in de browser; de Teensy speelt live. Wie de Teensy
"hoort" via Windows (Listen to this device) hoort beide. Opnemen van de
Teensy in een spoor kan via AUDIO IN (getUserMedia op het Teensy-apparaat);
dat is dezelfde route als de microfoon nu. Niet in versie 1.

## 4. Stappen

1. **Song-model + library.** Types, bewaren/laden in de take-library als
   groep, exporteren als map. Test: rondreis.
2. **Transport.** `SongTransport` in `sim/`: players per spoor aan `simOut`,
   gezamenlijk startmoment, lus, aftellen, opnemen van spoor n via de
   bestaande recorder-handlers (`recordControl`). Test met een
   kunstmatige take: twee sporen liggen op elkaar binnen één blok.
3. **Sporenstrip** in `FrontKeys` (de werkbalk) + een paneel eronder;
   `data-tour`-anker en een stap in de rondleiding; Engels via `nlen()`.
4. **Proef op de telefoon**: ritmebox → bas → akkoord → melodie, lus van
   twee maten; latency op het oor; dan de knoppen bijstellen.
5. Later: spoor opnieuw renderen uit de mid met een andere patch (headless,
   zoals de patch-library meet); Reaper-export met vier sporen; Teensy.

## 5. Besluiten (Mark, 2026-10-08)

1. Lus, altijd: een regio van hele maten; je voegt regio's toe, één per spoor.
2. Aftellen altijd één maat; metronoom aan/uit als optie.
3. Een paneel dat openklapt onder het klavier.
4. Mixdown bij bewaren, maar bewaren is een bewuste handeling, niet
   automatisch. Exporteren = per spoor mid + patch, plus de mix (zeven
   bestanden bij drie sporen).
5. Volume en pan per spoor, al vóór het opnemen; na alle sporen terugluisteren,
   mixen en dan pas exporteren.
6. Laden van een bewaarde song uit de library; laden van een export via
   opnieuw renderen komt later.
