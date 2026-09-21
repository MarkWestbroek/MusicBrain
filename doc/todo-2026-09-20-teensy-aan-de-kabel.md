# Todo zodra de Teensy weer aan de kabel hangt

> Geschreven 20 september 2026. Er staan firmware-wijzigingen klaar die nog
> nooit geflasht zijn, en twee dingen die ik bewust heb laten liggen omdat ze
> alleen met je oren erbij te beoordelen zijn. Dit bestand mag weg als het
> gedaan is. Achtergrond: [sim-firmware-parity-plan.md](sim-firmware-parity-plan.md).

## 1. Flashen — ✅ gedaan op 21 september 2026

Er draaide 0.5.48; geflasht is **0.5.50**, geverifieerd met een `hello` over
COM3 (`{"version":"0.5.50","step":3}`). Vier commits gingen mee:

| commit | wat |
|---|---|
| `aba501d` | MS-20 klemt zijn uitgang vóór de int16-cast |
| `e940b95` | note-priority (PRIO) werkt, en mono zakt terug naar een nog ingedrukte toets |
| `05458f7` | `env_sens` op de samplercel + de follower die niet terugzakte |
| `f053fec` | `Curve::Log` in `MidiMap::scale` |

Let op bij een volgende keer: `pio run -t upload` gebruikt hier de
teensy-gui-loader en meldt SUCCESS zodra hij die opent — niet zodra het beeld
erin staat. Vraag dus altijd `hello` na. Een open COM-poort (editor verbonden)
blokkeert het flashen.

Nog geen noot ervan is gehoord — dat is hieronder.

## 2. Beoordelen met je oren

**MS-20 met de resonantie open én drive erbij.** Vóór deze wijziging wrapte de
int16-cast zodra de Korg35-lus boven ±1 uitkwam: harde foldover. Nu klemt hij.
Het moet dus *schoner* klinken bij zelf-oscillatie — en als je die foldover
juist mooi vond, zeg het, want dan maken we er een keuze van in plaats van een
bugfix.

**Mono spelen — dit verandert bestaande patches.** Hou een lage toets vast,
speel er een hoge bij, laat de hoge los. Vroeger viel de gate (de noot stopte,
terwijl je nog een toets vasthield). Nu zakt de stem terug naar de lage.
Dat is hoe Yarns en Surge het doen en hoe een monosynth hoort te spelen, maar
het is wél ander gedrag dan je gewend was.

**PRIO op low en high.** Zet hem op high en druk een lagere toets bij: er hoort
niets te gebeuren. Laat de hoge los en de stem zakt naar de lage.

**Auto-wah op de sampler.** Zet een bank op de SD, laad de patch met
`env_k → cutoff_k` (Poly ▾ → Sampler ×8 auto-wah) en speel hard en zacht. Met
`Sens` op +12 dB hoort het filter mee te ademen; in de browser doet dezelfde
patch het nu, dus dit is meteen een pariteitscheck van de hele keten.

**Unison met spread.** Zet UNI aan en draai SPRD open. Vergelijk met dezelfde
patch in de browser-simulator — die gebruikt nu letterlijk dezelfde formule
(`spreadOffsetV`), dus ze horen gelijk te klinken. Als dat zo is, is dat meteen
een mooie bevestiging dat de hele pariteitsketen klopt.

## 3. Bouwen mét oren erbij

**De hertrigger-flank** (zie FW-10 in de backlog). Zowel voice-stealing als een
nieuwe mono-noot doet dit:

```cpp
gate_[idx] = false;
...
gate_[idx] = true;      // in dezelfde aanroep
```

De CvGraph bemonstert op 1 kHz, dus die flank ziet niemand: de envelope slaat
niet opnieuw aan. Precies dezelfde klasse fout als de gate-collaps die de
simulator had (daar opgelost met: gate laag, aanslag één blok later). De
firmware heeft een retrigger-puls per stem nodig, en dat raakt de CvGraph — dus
het is werk dat je wilt kunnen horen terwijl je het doet.

**Brass reageert niet op de Timbre-knop** zolang er een V/Oct-kabel in zit.
`Brass::setFrequency()` stemt de lipspanning af op de toon, en de CV-tick doet
dat duizend keer per seconde, dus de knop wordt telkens overschreven. Eén regel:
`applyControlChanges()` aanroepen aan het eind van `setPitch()` in
`StkSoundModule.h`. Verandert de klank van bestaande Brass-patches — nu doet
Timbre niets, daarna wel.

## 4. Rommel die opvalt

De SPRD-knop in de catalogus gaat tot 100 cent, de firmware klemt op 200
(`MidiIn.cpp`). Draai je de knop helemaal open, dan krijg je de helft van wat
de firmware aankan. De simulator volgt de firmware. Optrekken of de firmware
terugbrengen — maakt niet uit, als het maar één getal wordt.
