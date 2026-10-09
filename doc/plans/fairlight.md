# Fairlight: de CMI in MusicBrain

> **Stand (2026-10-09):** besluiten 1–3 genomen (zie §5). Stap 1 (Era CMI op
> de sampler) en stap 2 (de stem `tp_mmb_cmi`) zijn gebouwd, getest en op de
> Teensy gemeten (fw 0.5.98: de stem ~2,4 % cpu totaal). Stap 3 (de editor:
> profiel → golfvormen, opslag in de patch, het Harmonischen-venster) en
> stap 4 (FFT) volgen.

Voorstel, 2026-10-09, ter review door Mark. Doel: vandaag bouwen.
Backlog: FW-AU-7 (Fourier-shaper, "Fairlight-achtig").

## 0. Nagekeken in de documentatie (2026-10-09)

Bronnen: Greg Holmes' pagina's over de CMI Series II
(<http://www.ghservices.com/gregh/fairligh/>, met
[Page 4](http://www.ghservices.com/gregh/fairligh/page_4.htm)), Wikipedia en
de Virtual Music-uitleg. Wat dat verandert of bevestigt:

- **Pagina's**: 4 = harmonische profielen tekenen (lichtpen), 5 = dezelfde
  gegevens als faders, **6 = golfvorm tekenen** (niet D; D is een 3D-weergave),
  7 = besturing (vibrato, loops), **8 = samplen**, R = Real-Time Composer.
  Onze wave-tekenaar is dus Page 6, de sampler Page 8.
- **Page 4, Mode 1**: tot 32 harmonischen × **32 segmenten van 128 samples**
  (4096 samples), precies onze stem. Erbij: een **DURATION**-profiel (hoe
  lang elk segment klinkt) en een **ENERGY**-profiel (de volumecurve over de
  segmenten). **INTERP** mengt elk segment met het volgende: onze Smooth.
  COMPUTE rekent de 32 golfvormen uit. (Mode 4, 128 segmenten, laten we
  liggen.)
- **Afspelen**: met een variabele rate per stem (toonhoogte), 8 bit; Series I
  samplede op 8–24 kHz, Series II tot ~32 kHz. Per audiokaart een eenvoudig
  laagdoorlaat, **met de hand** in 16 standen (0–15), niet toonvolgend. Onze
  Era CMI houdt het toonvolgende filter (handiger); een vaste stand kan er
  als optie bij.

Gevolg voor stap 3: het profiel krijgt naast de 32 × 32 harmonischen ook
een DURATION- en een ENERGY-curve; de stem krijgt die mee (32 duurfactoren
en 32 niveaus na de 4096 samples). Mark: Page 4 mag groen op zwart; het
tekenen per harmonische is gewenst; een getekende golf (Page 6) analyseren
naar harmonischen is een goede brug naar Page 4 (dezelfde rekensom als de
FFT uit een sample).

## 1. Wat de Fairlight CMI zijn klank gaf

Uit wat ik van het instrument weet (Series I/II, 1979–1983; de details
hieronder zijn op het oor te controleren, niet allemaal nagemeten):

1. **Sampling met een klok per stem** (Page 8). Elke stem had een eigen DAC en een
   eigen sampleklok: toonhoogte = sneller of langzamer uitlezen, **zonder
   interpolatie**, 8 bit. Daardoor schuiven de alias-spiegelingen mee met de
   toon, en klinkt hoog spelen korrelig en laag spelen dof. Een filter per
   stem dat de klok volgt haalt het ergste eraf. Dat is het geluid van ORCH5
   en de koren.
2. **Golfvormsynthese** (Page 4/5): tot 32 harmonischen, elk met een eigen
   verloop over 32 segmenten van de noot. De CMI rekende daar 32
   golfvormen van uit (één per segment) en speelde die na elkaar af: de
   klank beweegt door de noot heen. Feitelijk een wavetable-sweep,
   berekend uit harmonischen.
3. **Golfvorm tekenen** (Page 6, lichtpen): één periode tekenen.
4. **Page R**, de patroon-sequencer.

## 2. Wat er al is

| | in MusicBrain | dekt |
|---|---|---|
| Sampler + banken + streaming | `tp_mmb_sampler` | sampling, maar schoon (lineaire interpolatie, 16 bit) |
| Wave-tekenaar, .wav als wavetable | `WaveDrawModal`, `tp_mmb_draw_vco`, `tp_mmb_morph_wt` (8 frames) | Page D, maar niet bewaard in de patch |
| Sporen, arp, sequencers | overdub, `tp_mmb_arp`, … | Page R hoeft niet |

## 3. Voorstel: twee stukken

### A. CMI-stand op de sampler (klein, eerst)

Een schakelaar **Era** op SAMPLER: *Clean* (zoals nu) / *CMI*. In de
CMI-stand, per stem:

- **Geen interpolatie**: de dichtstbijzijnde sample (zero-order hold op de
  klok van de stem). Daarmee lopen de spiegelingen mee met de toon, zoals
  bij een klok per stem.
- **8 bit**: kwantiseren naar 256 niveaus (optioneel een knop *Bits* 6–12).
- **Klokvolgend laagdoorlaat**: een tweepolig filter op ~0,45 × de
  effectieve klok van de stem (bronrate × toonhoogteverhouding), begrensd op
  Nyquist. Hoog spelen laat meer door, laag spelen wordt dof.
- **Klok** (knop): de samplerate waarop de bank "opgenomen" was, 8–32 kHz,
  standaard 24 kHz: de bank wordt bij het laden (of bij het lezen, goedkoper)
  op die rate gelezen, zodat een moderne 48 kHz-bank ook die korrel krijgt.

Kosten: minder dan nu (geen interpolatie), plus één filter per stem. Alle
bestaande banken klinken er meteen naar 1982.

Seeds: **"Fairlight koor"** en **"ORCH5-stoot"** als dat met een bestaande
bank kan; anders een *CMI*-variant van de Mellotron-patches.

### B. FAIRLIGHT-stem: golfvormsynthese (de grotere)

Een nieuwe module **`tp_mmb_cmi`**:

- **32 golfvormen × 128 samples, 8 bit** (4 KB), na elkaar afgespeeld over
  de noot: segment *n* duurt `seg` ms (knop), tussen segmenten een korte
  overvloeiing (knop *Smooth*, 0 = hard zoals de CMI). Loop-stand: na het
  laatste segment blijft hij op segment `loop` … 32 rondgaan zolang de toets
  vastgehouden wordt (sustain), bij loslaten door naar het eind.
- Afspelen zoals in A: zero-order hold, 8 bit, klokvolgend filter.
- Poorten: `voct`, `gate`, `vel`, `out`, `seg_cv` (schuift de positie).
  Poly via een PolyGroup (de CMI had 8 stemmen; ~1–2 % per stem verwacht).

**De editor** maakt de golfvormen, niet de firmware:

- Een **Harmonischen-venster** (zoals Page 4): 32 harmonischen als rijen,
  32 segmenten als kolommen; per harmonische een curve tekenen met vinger of
  muis (ook op de telefoon). Snelknoppen: *zaag*, *vierkant*, *koor*,
  *klok*, *orgel* als startpunt.
- **Uit een sample** (FFT, optie): een stuk audio (bank, take of een
  .wav) → per segment een FFT → de harmonischen → de curves. Dat is de
  "Fourier-shaper" uit de backlog.
- De editor rekent de 32 golfvormen uit (additief, met de harmonischen
  boven Nyquist van de doelklok weggelaten) en stuurt ze naar de
  simulator (wasm-blob, zoals Morph-WT) en de Teensy (een frame
  zoals `wavetable`, 32 × 128 bytes).

**Bewaren in de patch** (nieuw, besluit nodig): het harmonischenprofiel
(32 × 32 niveaus, 1 byte elk = 1 KB, base64 ±1,4 KB) als data van de module
in de patch, zodat de klank bij het laden terugkomt. Voorstel: een veld
`patch.moduleData[moduleId] = { cmi: '<base64>' }`, mee in export en pool,
niet in de config-payload (die krijgt de berekende golfvormen als apart
frame na de config).

## 4. Volgorde voor vandaag

1. **A, CMI-stand op de sampler**: kern (`sample_player.h`), firmware,
   wasm, paneel, test (geen interpolatie: spiegelingen aanwezig; 8 bit:
   kwantisatieruis; filter volgt de toon), seed. Flashen en meten.
2. **B, de stem**: kern `mmb_dsp/cmi.h` (afspelen van 32 frames), module,
   wasm met blob, contract, paneel, test met een vast profiel.
3. **B, de editor**: rekenen profiel → golfvormen (getest), versturen naar
   sim en Teensy, opslag in de patch, het Harmonischen-venster met de
   snelknoppen, twee seeds.
4. **B, FFT uit een sample**: als de tijd het toelaat; anders morgen.

Release-notes, catalogus, Engelse teksten en een stap in de rondleiding
zoals gewoonlijk.

## 5. Vragen voor de review

Besluiten (Mark, 2026-10-09): 1 ja, A eerst; 2 ja, een schakelaar *Era* op
SAMPLER; 3 ja, een dataveld in de patch (`patch.moduleData`), als
"edit buffer"; een bank met CMI-stemmen (zoals de DX7: 32 per bank,
"bewaar in bank" / "laad uit bank") kan er later naast komen.

1. **Volgorde**: eerst A (klein, meteen hoorbaar op alles), dan B. Akkoord?
2. **CMI-stand als schakelaar op SAMPLER**, of liever een aparte module
   `CMI SAMPLER`?
3. **Opslag van het profiel** in `patch.moduleData` (nieuw veld): akkoord, of
   liever ergens anders?
4. **Het Harmonischen-venster**: tekenen per harmonische (zoals Page 4), of
   eerst alleen de snelknoppen + FFT en het tekenen later?
5. **Page R** laten we liggen (sporen en arp dekken het). Akkoord?
