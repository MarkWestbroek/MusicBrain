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

## 5. Gevonden bij het porten naar de simulator (24 september)

Deze drie heb ik in de simulator letterlijk nagebootst, want pariteit betekent
dat de browser doet wat de hardware doet — ook als dat een fout is. Maar het
zijn waarschijnlijk fouten, en ze verdienen je oren.

**De comb staat vals, en volgt V/Oct niet** (`CombModule.h`). De feedback loopt
door de Teensy-audiograaf: `fbAmp_ → inMix_`. De Teensy werkt de objecten af
in constructievolgorde en `inMix_` komt vóór `fbAmp_`, dus de mixer krijgt de
feedback van het *vorige* blok. De luslengte is daardoor de vertraging plús
128 samples:

| gestemd | vertraging | lus | klinkt op | fout |
|---|---|---|---|---|
| C4 (262 Hz) | 169 | 297 | 148 Hz | ~10 halve tonen te laag |
| C5 (523 Hz) | 84 | 212 | 208 Hz | ~16 halve tonen te laag |

Een octaaf hoger spelen maakt de toon dus maar 1,4× hoger in plaats van 2×. De
simulator-test `tp_mmb_comb › resoneert zoals de hardware` legt dit vast.
Oplossing: een eigen `mmb_dsp::Comb`-kernel met de feedback binnen de lus van
één sample, zoals de resonator al werkt. Dat verandert de klank — dus eerst
horen of de huidige comb inderdaad zo vals klinkt als deze rekensom zegt.

**`thr_cv` op de compressor** (`CompDriveModule.h`) zet de drempel op de
CV-*waarde* in dB. Een CV van 0..1 geeft dus een drempel van 0..1 dB, oftewel
vrijwel geen compressie. Vermoedelijk hoort de CV geschaald te worden naar het
bereik van de knop (−48..0 dB).

**De resonator heeft twee uitgangen die hetzelfde signaal geven.** `out` en
`mix` wijzen allebei naar kanaal 0, terwijl de kop `out` "nat" noemt. Geen
klankprobleem, wel een belofte die de module niet waarmaakt.

**S&H bestaat niet in de firmware.** `tp_mmb_sh` staat in de catalogus met een
paneel, knoppen en een beschrijving ("Sample-and-hold met slew-limiter"), maar
er is geen `ShModule` en geen typeId in de firmware. Op de Teensy doet hij dus
niets. De simulator speelt hem bewust óók niet: als de browser hem wel zou
laten klinken, zou een patch daar anders klinken dan op je hardware. Bouwen
of uit de catalogus halen — dat is jouw keuze.

**De LFO-standen Gated en OneShot doen niets.** De Run-schakelaar op het
paneel heeft ze, en `Lfo.cpp` implementeert ze met een `gate`-ingang. Maar de
catalogus geeft de LFO geen `gate`-poort, dus je kunt er geen kabel in steken.
Gated staat dan stil (`running_ = lastGate_ = false`) en OneShot start nooit.
Poort toevoegen aan `mmbLfo()` in `seedModules.ts` of de twee standen van de
schakelaar halen. De simulator volgt nu de firmwareklasse, dus daar doet het
hetzelfde.

**De AHDSR heeft een `eoc`-uitgang op het paneel die de firmware niet kent**
(`Ahdsr.h` leest alleen `cv_out`). Een kabel uit EOC geeft op de Teensy nul.

**Noise zit sinds 24 september in de firmware** (`NoiseModule.h`, kernel
`mmb_dsp::Noise`: wit/roze/bruin, dezelfde code en seed als de simulator).
Nog niet geflasht; na het flashen even horen of wit, roze en bruin klinken
zoals in de browser. De versie is niet opgehoogd, dat gaat mee met de
volgende firmware-release.

**De ladder vouwt om bij veel drive — dezelfde fout als de MS-20 had.**
`AudioFilterLadder::update()` (Teensy Audio Library) schrijft
`blocka->data[i] = blockOut[i] * 32768.0f` zonder klem. Komt de uitgang boven
±1, dan wordt dat op ARM een int32 en daarna afgekapt tot 16 bits: het
signaal springt van +1 naar −1. Gemeten in de simulator, die deze cast
nabootst, met een zaagtand op volle schaal en cutoff 2 kHz:

| drive | piek | sprongen/s |
|---|---|---|
| 1 – 2 | 0,78 – 0,93 | 0 |
| 3 | ≥ 1 | ~440 (vier per periode bij 110 Hz) |

Met een ingang op halve schaal blijft hij zelfs bij drive 4 onder de 1. Het
klinkt als harde klikken of een raspende foldover. Oplossing: de ladder naar
`mmb-dsp` halen (hij is MIT, net als de rest) en daar klemmen, zoals bij de
MS-20. Dat verandert de klank alleen in het gebied waar hij nu omvouwt, dus
eerst luisteren: zet een ladder op drive 3–4 achter een luide VCO.

**Quad-VCO en quad-mixer bestaan ook alleen in de catalogus**
(`tp_mmb_quad_vco_shared`, `tp_mmb_quad_mixer_shared`) — zelfde verhaal als
S&H: op de Teensy doen ze niets, en de simulator laat ze daarom ook zwijgen.

**Octa-VCO: het paneel zegt level 0,5, de firmware begint op 0,8.** Een knop
die je niet aanraakt gaat niet mee naar de Teensy, dus daar klinkt 0,8 terwijl
het paneel 0,5 toont. Eén van de twee gelijktrekken (`mmbOctaVco()` in
`seedModules.ts` of de constructor van `OctaVcoModule`).

