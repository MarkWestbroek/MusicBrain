# DSP-check: aliasing, begrenzing en zelf-oscillatie (2026-10-11)

> **Actueel (2026-10-11, fw 0.5.102):** ADAA gebouwd in Drive, Tube en de
> uitgang van de e-piano; zie **§5 Na de aanpassing**. fw 0.5.103: een eigen
> Ladder (§6). Correctie op §1: de
> Ladder is alleen schoon tot Drive 1; met een zaag en Drive 4 aliast hij fors
> (§5). De meting staat nu als test in `editor/src/modular-mb/sim/wasmAlias.test.ts`.

Aanleiding: de kritiek van *Archit3ch_* op Circuit Studio
(circuit.synthcity.org, r/synthdiy, oktober 2026). Zijn punten zijn een goede
checklist voor elke nagebootste analoge schakeling, dus ook voor de onze:

1. oversampling met een zwak decimatiefilter, getest met alleen een sinus;
2. stil minder kwaliteit bij processordruk;
3. een tanh op de uitgang zonder anti-aliasing, en geen clipindicator;
4. zelf-oscillatie die vastloopt op een constante;
5. (buismodellen die met geen referentie kloppen; hier niet onderzocht).

Gemeten op de echte wasm-kernen in node (dezelfde code als op de Teensy),
44,1 kHz. De meetopstelling staat niet in de repo (scratch); de methode
hieronder is genoeg om hem na te bouwen.

## Methode

- Een sinus van f0 (3456,7 Hz of 1234,5 Hz, bewust geen mooie verhouding met
  de samplefrequentie) of een bandbegrensde zaag op 220,13 Hz erin; 1,2 s
  renderen, vanaf 0,3 s een FFT van 32768 punten (Blackman-Harris).
- **Aliasing** wordt alleen gemeten op de plekken waar teruggevouwen
  boventonen landen: elke harmonische k·f0 boven Nyquist vouwt naar een
  voorspelbare frequentie. Plekken die samenvallen met een echte harmonische
  tellen niet mee. Zo vertroebelen zelf-oscillatie en ruis de uitkomst niet.
- Per geval: **THD** (harmonischen 2 en hoger t.o.v. de grondtoon, om te zien
  óf er vervormd wordt), **aliasing** (totaal t.o.v. de harmonischen) en de
  **sterkste alias onder 10 kHz** t.o.v. de grondtoon (het hoorbaarste deel).
- **Controle**: elk geval opnieuw met f0 + 7 Hz. Een echte alias verschuift
  dan (een veelvoud van 7 Hz); iets wat blijft staan is geen alias.

## 1. Aliasing bij een hoge sinus, hard aangestuurd

| Geval | f0 | THD | aliasing | sterkste alias < 10 kHz | echte alias? |
|---|---|---|---|---|---|
| VCF (SVF), open: ijkpunt, lineair | 3456,7 | −150 dB | −115 dB | −120 dB | nee (ruisvloer) |
| Ladder, open, drive max | 3456,7 | −20 dB | −102 dB | −111 dB (6076 Hz) | ja |
| Ladder, 3 kHz, q 0,9, drive max | 1234,5 | −24 dB | −103 dB | −118 dB | nee (ruisvloer) |
| MS-20, open, drive max | 3456,7 | −11 dB | −28 dB | −49 dB (8696 Hz) | ja |
| MS-20, 3 kHz, q 0,9, drive max | 1234,5 | −12 dB | −48 dB | −57 dB (551 Hz) | ja |
| SEM, open, drive max | 3456,7 | −28 dB | −38 dB | −49 dB (837 Hz) | ja |
| SEM, 3 kHz, res 0,9, drive max | 1234,5 | −19 dB | −48 dB | −59 dB (8300 Hz) | ja |
| **Drive, max** | 3456,7 | −21 dB | −32 dB | **−34 dB (108 Hz)** | ja |
| **Tube, drive max** | 3456,7 | −39 dB | −36 dB | **−38 dB (108 Hz)** | ja |
| Folder, fold max | 3456,7 | +1 dB | −31 dB | −61 dB (837 Hz) | ja |
| Folder, fold max | 1234,5 | +7 dB | −40 dB | −119 dB | nee |

(Ladder: q is hier 1 op een bereik tot 1,8; drive 4 = het maximum.)

## 2. Muzikaler: zaag op A3 (220 Hz), hard aangestuurd

| Geval | THD | aliasing | sterkste alias < 10 kHz |
|---|---|---|---|
| Drive max | +1 dB | −46 dB | −64 dB (76 Hz) |
| Tube drive max | −8 dB | −51 dB | −70 dB (1835 Hz) |
| MS-20 open, drive max | −9 dB | −38 dB | −75 dB (4771 Hz) |
| SEM open, drive max | −3 dB | −44 dB | −69 dB (294 Hz) |
| Folder fold max | +29 dB | −39 dB | −70 dB (9171 Hz) |

## 3. Zelf-oscillatie (resonantie op het maximum, alleen een tikje als start)

| Filter | Oscilleert hij? | Toon bij cutoff 1 kHz |
|---|---|---|
| Ladder (q 1,8) | ja, rms 0,21 | 993 Hz |
| Ladder, drive max | ja, rms 0,21 | 993 Hz |
| MS-20 (q 1) | nee, de tik klinkt uit | — |
| MS-20, drive max | ja, rms 0,75 | **689 Hz** |
| SEM (res 1) | nee, klinkt uit | — |
| VCF/SVF (Q 5) | nee, klinkt uit | — |

Geen enkel filter loopt vast op een constante (gemiddelde overal 0,000).

## Conclusies per punt

1. **Decimatiefilter.** Het gedeelde 4×-filter (`oversample.h`, 65 taps,
   Kaiser β 7) is −6 dB precies op 22 kHz: wat tussen ruwweg 22 en 28 kHz zit
   vouwt deels terug naar 16–22 kHz. Dat is het bovenste, minst hoorbare
   stuk. De **grootste aliassen komen niet daarvandaan** maar van de
   vervormers zelf: een harde knik (de clipper van Drive, de dioden van
   Tube en MS-20) maakt zoveel boventonen dat ze al op de 4×-rate terugvouwen.
   De 108 Hz bij Drive en Tube is de 51e harmonische (176,3 kHz) die op de
   4×-rate (176,4 kHz) bijna op nul terugvouwt: een brom onder de toon,
   −34 dB onder de grondtoon. Met een sinus van 3,5 kHz is dat een zwaar
   geval; met een zaag op A3 is het −64 dB.
2. **Stil minder kwaliteit bij processordruk: doen we niet.** Nergens in de
   firmware of de kernen hangt de oversampling of de kwaliteit af van de
   processorlast.
3. **Begrenzing op de uitgang.** De limiter van de SAMPLER heeft boven 0,8
   een tanh-bocht zonder oversampling, maar pas na de piekbegrenzer; die
   doet zelden iets. Niet gemeten. Een clipindicator is er: de VU op het
   OUT-paneel; in de speelmodus niet.
4. **Vastlopen op een constante: niet gezien.**
   - De **SEM** oscilleert niet zelf. Dat klopt met het origineel: de SEM staat
     erom bekend dat hij dat niet doet.
   - De **SVF** oscilleert niet, bewust.
   - De **MS-20** oscilleert alleen met veel drive, en dan een kwint te laag
     (689 Hz bij een cutoff van 1 kHz). Een echte MS-20 gilt bij volle
     resonantie ook zonder overdrive; **dit is een punt om te beluisteren en
     te vergelijken** (Circuit Studio heeft een MS-20-schakeling).

## Voorstellen (nog niet gedaan)

- ~~**Drive en Tube**: anti-aliasing op de clipper zelf (ADAA) … daarna deze
  meting als test vastleggen.~~ Gedaan, zie §5.
- **MS-20**: zelf-oscillatie zonder drive en de toon bij hoge drive naast de
  Circuit Studio-schakeling en een echte MS-20-opname leggen.
- **Het decimatiefilter**: steiler maken (meer taps of een tweede trap) kost
  rekentijd op 22 kernen; eerst de vervormers aanpakken, dan opnieuw meten of
  dit nog uitmaakt.
- **Een clipindicator in de speelmodus** (OUT-niveau te heet).

## 5. Na de aanpassing (fw 0.5.102)

Mark (2026-10-11): "Clippen vond ik ook wel te veel aanwezig, ook in de drive
in de e-piano." Gebouwd:

- `mmb_dsp/adaa.h`: eerste-orde ADAA (`Adaa1`), vormen met hun primitieve
  (`TanhShape`, `KneeShape`) en `SoftLimit`, een uitgangsbegrenzer die
  schoon is tot de knie en pas daarboven ADAA gebruikt (op de gewone rate zou
  ADAA in het lineaire stuk het hoog dempen: −2,5 dB op 10 kHz).
- **Drive**: ADAA op alle drie de clippers (binnen de 4×). De harde clipper
  van Distortion is nu een knie-vorm (recht tot 0,5, dan een tanh-bocht naar
  vol), want die heeft een primitieve; hij ligt binnen een paar procent van
  de oude vorm. De harde klem op de uitgang is een zachte begrenzer (knie 0,9).
- **Tube**: ADAA op beide triodetrappen en de eindtrap (met sag:
  `processVarying`), zachte begrenzer op de uitgang.
- **E-piano**: de tanh over de **som** van alle stemmen (die gewone akkoorden
  al samen vervormde) is een begrenzer die schoon blijft tot 0,7. Het grommen
  zit in de tine zelf (Drive) en blijft.

| Geval | signaal | sterkste alias < 10 kHz voor → na | volume |
|---|---|---|---|
| Drive Overdrive vol | sinus 3457 Hz | −34 → **−72 dB** | gelijk |
| Drive Overdrive vol | zaag A3 | −64 → **−96 dB** | gelijk |
| Drive Distortion vol | sinus 3457 Hz | −31 → **−66 dB** | gelijk |
| Drive Distortion vol | zaag A3 | −63 → **−96 dB** | gelijk |
| Drive Fuzz vol | sinus 3457 Hz | −33 → −44 dB | gelijk |
| Drive Fuzz vol | zaag A3 | −56 → −65 dB | gelijk |
| Tube Studio vol | sinus 3457 Hz | −80 → −94 dB | gelijk |
| Tube Amp vol | sinus 3457 Hz | −38 → −43 dB | gelijk |
| Tube Amp vol | zaag A3 | −70 → −67 dB | gelijk |

**E-piano, twee tonen (C4 + E4) op volle aanslag**, intermodulatie
t.o.v. de grondtoon:

| Drive | 2f1 − f2 (194 Hz) voor → na | 2f2 − f1 (398 Hz) voor → na |
|---|---|---|
| 0,4 (standaard) | −27 → **−49 dB** | −27 → **−49 dB** |
| 1 | −39 → **−75 dB** | −40 → **−128 dB** |

Het geheel wordt ~1 dB luider (minder samengedrukt); de piek blijft onder 0,8.

**Wat overblijft**

- **Tube Amp op vol**: nauwelijks beter. Twee trappen met samen tot 60 × 15
  versterking; de triodecurve heeft een knikje in de kromming op nul, en
  daarvoor is eerste-orde ADAA met 4× niet genoeg. Sag, kast en
  uitgangsbegrenzer zijn het niet (apart uitgezet en gemeten). Oplossing:
  tweede-orde ADAA of 8× voor deze stand.
- **Ladder (correctie op §1)**: met een sinus was hij schoon, met een
  **zaag op A3 en Drive 4** aliast hij fors: −35 dB (in totaal −13 dB). Bij
  Drive 1 is hij schoon (−114 dB). Oorzaak in `AudioFilterLadder` van de
  Teensy Audio Library (Richard van Hoesel): `fast_tanh` knipt hard af boven
  ±3, en de oversampling heeft een FIR van 36 taps. De firmware gebruikt de
  bibliotheek ongewijzigd; repareren vraagt een eigen kopie (of een melding
  bij PJRC). Precies het punt van Archit3ch_: met alleen een sinus mis je dit.
- **Fuzz**: twee trappen achter elkaar; −44 dB bij een hoge sinus.

## 6. Eigen Ladder (fw 0.5.103)

Mark: "een eigen ladder maken ipv de teensy audio lib is geen probleem."
`mmb_dsp/ladder.h` is hetzelfde algoritme (Huovilainen / van Hoesel, MIT,
met de kop van de bibliotheek), maar:

- ons 4×-filter (65 taps) in plaats van de FIR van 36 taps;
- geen 16-bit-uitgang die boven ±1 omklapt (dat was het grootste deel van de
  −13 dB aliasing bij Drive 4), maar een zachte begrenzer (knie 0,9) op de
  4×-rate, na de vierde pool en buiten de terugkoppellus;
- in de lus géén ADAA (de halve sample vertraging zou de resonantie
  verstemmen); de gladde Padé-tanh blijft, op 4×;
- ×1,1 op de uitgang: het oude interpolatiefilter versterkte zoveel.

| | oud (bibliotheek) | nieuw |
|---|---|---|
| Kleinsignaal, q 0 / 1 / 1,5 | — | binnen 0,6 dB gelijk |
| Zelf-oscillatie (q 1,8, cutoff 1 kHz) | 991 Hz, rms 0,21 | 990 Hz, rms 0,23 |
| Zaag A3, Drive 2: aliasing totaal | −97 dB | −77 dB |
| Zaag A3, Drive 4: aliasing totaal | **−13 dB** | **−65 dB** |
| Zaag A3, Drive 4: sterkste alias < 10 kHz | **−35 dB** | **−115 dB** |

Firmware en browser gebruiken nu dezelfde kern (`LadderModule.h`,
`tools/mmb-wasm/ladder_wasm.cc`); de module heeft dezelfde poorten, knoppen en
CV-wetten.

