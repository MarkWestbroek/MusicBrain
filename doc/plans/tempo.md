# Tempo: één baas per patch, tap tempo, MIDI-clock

> **Stand (2026-10-09):** gebouwd zoals hieronder (editor). Fase 2 (de
> firmware volgt MIDI-clock zelf, tempo uitsturen) staat open.

Plan, 2026-10-09 (Marks vraag: "tap tempo — een module, een generieke
functie, of iets in MIDI-IN? Wie is de baas over het tempo?"). Mark: "klinkt
goed, eerst het plan, dan maken". Backlog: FW-CV-9 (klok volgt MIDI-clock en
tap tempo).

## 1. Hoe het nu is

- Zeven modules hebben een eigen **Tempo**-knop (bpm per tel): ARP, CLOCK,
  EUCLID, GRIDS, MARBLES, RITMEBOX, TURING. Elk loopt op zijn eigen interne
  klok. Ze lopen alleen samen als je ze zo patcht (een CLOCK met kabels naar
  de Clk-ingangen en ExtClk aan): de modulaire manier.
- De vierspoorsrecorder (overdub) heeft één regel: zonder sporen volgt de
  song de tempoknop van de **eerste** tempomodule in de patch; met sporen is
  de song de baas en zet hij die ene knop. Een tweede klok in dezelfde patch
  loopt niet mee.
- Tap tempo bestaat niet; MIDI-clock wordt alleen gelezen voor het tempo in
  een opgenomen .mid.

## 2. Voorstel

**Eén tempo per patch** (`patch.tempo`, bpm), met een vaste volgorde van wie
beslist:

1. **Inkomende MIDI-clock** (een DAW of drumcomputer), als die loopt en
   "MIDI-clock volgen" aan staat. Die wint.
2. **De song** van de vierspoorsrecorder, zodra die sporen heeft.
3. **Het patchtempo**, dat je zet met **TAP** (of door het getal), of door
   aan de tempoknop van een module te draaien.

Elke tempoknop in de patch **volgt** dat ene tempo, tenzij:

- de module op een externe klok loopt (**ExtClk** aan): dan beslist de kabel,
  zoals nu; of
- je de module bewust op **eigen tempo** zet (per module, in het tempo-menu).

Draai je aan de knop van een volgende module terwijl niemand anders de baas
is, dan wordt dat het nieuwe patchtempo en volgen de anderen. Is de song of
de MIDI-clock de baas, dan veert de knop terug naar hun tempo.

### Waar het zit

- **Geen module en niet in MIDI-IN**: een algemene functie van de editor,
  zoals het toetsenbord. De **TAP**-knop staat in de werkbalk van het
  toetsenbord ("♩ 120"); tikken = tappen, het pijltje ernaast opent een klein
  menu: het tempo als getal, "MIDI-clock volgen", en per tempomodule
  "volgt / eigen tempo".
- De editor zet de knoppen via `setPatchControl` (dezelfde weg als draaien):
  de simulator én de Teensy volgen, zonder firmwarewijziging. Op de Teensy
  zonder editor (MIDI-clock rechtstreeks in de brain) is fase 2, in de
  firmware (FW-CV-9).

### Tap tempo

Gemiddelde van de laatste vier intervallen; na twee seconden zonder tik
begint hij opnieuw; het eerste getal na twee tikken. Bereik 30–300 bpm, op
0,1 (zoals de song en de ritmebox).

### MIDI-clock

24 tikken per tel; het tempo over de laatste 24 tikken (één tel),
afgevlakt; "loopt" zolang de laatste tik minder dan een halve seconde oud is.
Leest de ruwe Web MIDI-ingang (`midiMonitor.startRaw`, vraagt één keer om
toestemming).

## 3. Bouwstenen

| | waar | wat |
|---|---|---|
| zuiver | `modular-mb/tempo.ts` | `tempoModules`, `patchTempoOf`, `reconcileTempo` (wie is de baas, welke knoppen moeten mee), `TapTempo`, `ClockTempo`; getest |
| model | `Patch.tempo`, `Patch.tempoOwn` | het patchtempo en de modules op eigen tempo; in de bewaarcyclus |
| koppeling | `modular-mb/useTempoSync.ts` | volgt de patch, de song en de MIDI-clock, en zet knoppen + `patch.tempo` |
| knop | `modular-mb/TempoTap.tsx` | ♩ TAP in de werkbalk, met het menu |
| overdub | `sim/OverdubPanel.tsx` | gebruikt het patchtempo in plaats van zijn eigen regel |

## 4. Fase 2 (later)

- Firmware: CLOCK (en de andere) volgen inkomende MIDI-clock op de Teensy
  zelf, met Start/Stop (FW-CV-9).
- Tempo uitsturen als MIDI-clock (de MusicBrain als baas van een DAW).
