# Overdub: vier sporen in de speelmodus

Voorstel, 2026-10-08. Vraag van Mark: een ritmepatch combineren met een bas,
een akkoord en een melodie, na elkaar ingespeeld, als sporen, hoogstens vier,
"a bit like overdubbing", ook op de telefoon.

> **Actueel (2026-10-09):** de eerste versie (2026-10-08) nam per spoor één
> vaste regio op; Mark bedoelde het anders en zo is het nu gebouwd: eerst
> vrij opnemen met metronoom, zo lang je wilt; daarna een regio kiezen,
> loopen en op een spoor overdoen (drop-in), meermalen; dan mixen en
> bewaren. Onderstaande tekst beschrijft die werkwijze.

## 1. Wat het is

Een vierspoors bandrecorder naast het klavier. Spoor 1 speel je vrij in op
de patch van dat moment, met de metronoom, zo lang je wilt; dat is de
lengte van de song. Daarna kies je een andere patch en speel je spoor 2 in
terwijl spoor 1 meeklinkt; enzovoort tot vier. Een stuk overdoen: zet een
regio (van maat … t/m maat), loop hem, en ● op een spoor neemt de volgende
ronde op in dat spoor (drop-in), zo vaak je wilt. Tevreden: volume en pan
per spoor, bewaren, exporteren.

Elk spoor is een take zoals de opnameknop die nu al maakt: **wav + mid +
patch**. Afspelen is de som van de wavs plus wat je live speelt. Dat is
bewust *audio-overdub* (tape), niet "vier patches tegelijk draaien":

- de simulator draait één patch; vier patches tegelijk zou een nieuw
  engine-model vragen en op de Teensy niet passen;
- een wav afspelen kost niets, op de telefoon ook niet;
- de mid en de patch per spoor blijven bewaard, dus een spoor is later nog
  opnieuw te renderen (andere patch, andere knopstand) of te bewerken in
  de take-editor.

## 2. Wat er al is

| bouwsteen | waar | wat het doet |
|---|---|---|
| `MasterRecorder` | `sim/wavRecorder.ts` | neemt de master-som op als wav; meldt zijn startframe |
| MIDI-recorder | `sim/midiRecorder.ts` | de gespeelde noten, cc, bend, druk |
| take-editor | `sim/TakeEditorWindow.tsx` | bijsnijden, exporteren (ook als Reaper-project) |
| `simOut` / `speakers` | `AudioEngine` | vaste uitgang; de recorder tapt `speakers` |

## 3. Ontwerp (zoals gebouwd)

### Song

```
Song  { id, name, bpm, beatsPerBar, metronome, loop: Region | null, tracks: Track[] (≤ 4) }
Track { id, name, gain, pan, mute, audio: { channels, sampleRate } | null, midi, patch }
Region { from, to }   // maten, 0-based, `to` exclusief
```

`sim/song.ts` is zuiver (getest): maatrekensom, `songMs` = het langste
spoor, `clampRegion`/`loopMs`, `cutRegion` (knippen met fades), `punchIn`
(drop-in met kruisfades), `mixdown` (equal-power pan), `midiToRegion`
(naar songtijd; een noot uit het aftellen begint op het begin) en
`spliceMidi`, `exportFiles`. `sim/songStore.ts` bewaart in IndexedDB
`mmb-songs`; bewaren is een handeling (⤓), nooit automatisch.

### Transport (`sim/SongTransport.ts`)

- **Vrij opnemen** (● zonder lus): recorder aan, één maat aftellen
  (metronoom tikt altijd), dan songtijd 0 op een geplande contexttijd
  (`origin`); de andere sporen starten daar; opnemen tot ■. Het stuk vanaf
  `origin` wordt het spoor; de song groeit mee.
- **Lus** (regio + lus aan): de spelers zijn `AudioBufferSourceNode`s met
  `loop`, `loopStart`, `loopEnd` op de regio, allemaal op `origin`.
- **Drop-in** (● met lus aan en spelend): recorder aan; op de volgende
  keer dat de lus bij het begin van de regio is wordt één ronde geknipt en
  met `punchIn` in het spoor gezet; het spoor start opnieuw op de plek waar
  de anderen zijn. Zo vaak je wilt.
- **Tijd**: alles op de klok van de AudioContext; de tap-worklet meldt
  `currentFrame` bij zijn eerste blok (`MasterRecorder.startFrame`), dus
  het knippen is sample-precies. MIDI loopt op `performance.now()` en wordt
  met het verschil met de contexttijd op songtijd gezet.
- **Wat je hoort**: sporen en metronoom gaan rechtstreeks naar
  `ctx.destination`, buiten de `speakers`-bus om, dus de recorder neemt ze
  niet mee: op een spoor komt alleen de patch.
- **Tempo**: heeft de patch een tempoknop (ritmebox, Grids, Marbles, klok;
  `tempoControl` in `midiRecorder.ts`), dan volgt de song die vóór het
  eerste spoor, en zet het paneel die knop op het songtempo daarna
  (`setPatchControl`), zodat een ritmebox op spoor 2 in de maat loopt.

### Sporenstrip (`sim/OverdubPanel.tsx`)

Klapt open met ≣ in de werkbalk van het toetsenbord (speelmodus). Per
spoor: ● (vrij of drop-in), patchnaam, een balkje (lengte van het spoor op
de song, de regio, de positie), volume, pan, 🔈, ✕. Eronder ▶/■ met de
teller, bpm, metronoom; met sporen: lus aan/uit en de maten, ⤓ bewaren,
⤴ export; 📂 laden.

### Teensy (fase 2)

De sporen spelen in de browser; de Teensy speelt live. Opnemen van de
Teensy in een spoor kan via AUDIO IN (getUserMedia op het Teensy-apparaat).
Niet in versie 1.

## 4. Open

- Export zonder stems terugladen: per spoor renderen uit mid + patch
  (headless, zoals de patch-library meet).
- Reaper-project met vier sporen.
- De ritmebox op "de één" laten starten bij het aftellen (Start/Stop-pad).
- Teensy-fase.

## 5. Besluiten (Mark, 2026-10-08/09)

1. Eerst vrij opnemen met metronoom, zo lang je wilt; de song is zo lang
   als het langste spoor.
2. Daarna regio's kiezen en loopen voor drop-in, meermalen per spoor.
3. Aftellen altijd één maat; metronoom aan/uit als optie.
4. Een paneel dat openklapt onder het klavier.
5. Bewaren bewust (⤓), mixdown erbij; export = mix + per spoor mid + patch
   (zeven bestanden bij drie sporen).
6. Volume en pan per spoor, al vóór het opnemen; na alles terugluisteren,
   mixen, dan exporteren. Laden uit de library.
7. Tempo van een ritmebox en van de opname volgen elkaar.
