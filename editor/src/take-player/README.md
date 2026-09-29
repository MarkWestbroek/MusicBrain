# take-player

Pianorol en spelers voor MIDI-takes uit de MusicBrain-editor. De sim van de
editor gebruikt deze map, en de take-widget van Imprint neemt hem over.

- **Bron:** `MusicBrain/editor/src/take-player/`. Hier wordt ontwikkeld.
- **Kopie in Imprint:** `sites/musicbrain/src/widgets/take/`. Noteer bij het
  kopiëren de commit van de MusicBrain-repo in dit bestand.
- **Afhankelijkheden:** alleen React.

## Bestanden

| Bestand | Inhoud |
|---|---|
| `smf.ts` | Standard MIDI Files lezen (`parseSmf`), noten (`noteSpans`), controllers (`controllerSeries`). Zuiver, geen DOM. |
| `playback.ts` | `Playback`-interface (wat de rol van een speler nodig heeft) en `AudioPlayback`, die een `<audio>` volgt. |
| `MidiRoll.tsx` | De pianorol met transport. Werkt met elke `Playback`. |
| `TakePlayer.tsx` | Kant-en-klaar client component: audio met de pianorol eronder. |
| `takePlayer.test.tsx` | Tests (vitest, node): adapter, palet, samenvatting, render. |

## Gebruik in een widget-viewer

De server geeft alleen URL's door; props zijn plain JSON.

```tsx
import { TakePlayer } from './take/TakePlayer';

<TakePlayer
  audioUrl="/api/assets/library/<slug>/original.<hash>.wav"
  midiUrl="/api/assets/library/<slug>/original.<hash>.mid"
  title="cs-80-koper"
  height={160}
  controllers
/>
```

- **Zonder `midiUrl`**, of als de .mid niet te laden is, blijft alleen de
  audiospeler van de browser over.
- **Tekstalternatief en downloadlinks** zet de viewer zelf onder de widget.
  `describeRoll()` geeft dezelfde samenvatting als de `aria-label` van de canvas.

## Gedrag

- **Afspeelkop.** De afspeelkop volgt de audio. Klikken of slepen in de noten
  springt in de audio.
- **Lusvenster.** Slepen in de liniaal maakt een lusvenster; een rand slepen
  verschuift die rand. Dubbelklik in het venster haalt het weg. Het venster
  klikt vast op de tellen; met Alt vrij.
- **Transport.** ⏪ en ⏩ springen een maat. Dubbelklik of Shift springt naar
  het begin of het einde. Afspelen en pauze zitten op één knop met
  `aria-pressed`. Stop gaat terug naar het begin van het lusvenster.
- **Toetsen.** Alleen als de rol focus heeft: spatie = afspelen/pauze,
  ←/→ = maat, Home/End = begin/einde. De spatie scrolt de pagina dus niet
  weg. De editor gebruikt `keyScope="window"`, de widget laat de standaard
  `"focus"` staan.
- **Raster.** Tempo en maatsoort komen uit de .mid. Tel 1 komt uit de marker
  `MMB tel 1`, de lus uit de markers `loopStart`/`loopEnd`. Een widget heeft
  geen snelheidsknop, omdat hij vast aan de audio zit.
- **Beweging.** Er is geen automatisch scrollen of animeren; alleen de
  afspeelkop beweegt. Daarmee is `prefers-reduced-motion` gerespecteerd.

## Kleuren

`MidiRoll` leest de CSS-tokens van de site: eerst de basisnaam, dan de
`--color-*`-alias. Een themawissel via `data-theme` op `<html>` werkt direct.

| Rol in de rol | Token |
|---|---|
| achtergrond | `--background` |
| liniaal, controller-laag | `--surface` |
| rasterlijnen | `--border` / `--color-line` |
| maatnummers, labels | `--muted` |
| noten, lusvenster | `--accent` |
| afspeelkop | `--foreground` |
| modwheel | `--accent-2` |
| aftertouch | `--accent-strong` |
| pitch bend | `--foreground` |
| overige CC's | `--muted` |

Ontbreekt een token, dan gebruikt de rol het meegegeven `palette`, anders de
tekstkleur. In deze map staan geen losse hex-kleuren; de editor geeft zijn
eigen palet mee (`EDITOR_PALETTE` in `modular-mb/sim/MidiRoll.tsx`).
