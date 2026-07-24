# musicbrain-vcf8kern — 8× multimode VCF-kernkaart (rev 0.1)

Kernkaart van het **poly-analog-spoor** (`doc/poly-analog-spec.md`, VCF8 +
B3/B7/B10): 8 identieke SSI2140-stemmen met **pole-mixing multimode** (8 modes
via een 4051 per stem), cutoff/Q vanuit de Brain via de SPI-bus. Staande
kaart achter de VCF8-backbone (kernslot-contract v1.1). **110×92, 4-laags
(In1/In2 = GND-planes), dubbelzijdig bestukt** (besluit 2026-07-21: per stem
gaat de pole-mix-ster + buffer-steun + ontkoppeling naar de B-zijde via JLC
PCBA; de SSI2140's op de top soldeer je zelf), passieven 0603.

**Schema = hiërarchisch/gepagineerd + bedraad** (2026-07-21): root +
**`in-uit-DACs`**-pagina + **1 pagina per stem** (`stem1`..`stem8`, identiek
op ref/net-suffix na). Elke stempagina toont de SSI2140 met **echte draadjes**
naar zijn lokale subcircuits (gm-trap-knopen, integrator-caps, EXPO-, Q- en
pole-mix-netwerk → 4051); de **tap-bus** (AINB, OUT1..OUT4) loopt als globale
labels (die fan-outen naar meerdere stages + de pole-mix, net als de OLED-bus
in het TD-12-interposer-schema). Cross-pagina-netten (VCUT/VQ/FMCVB/MOUT/MODE)
= globale labels = de kale PCB-netnamen (PCB-netten hebben géén `/`-prefix).
Bron: `gen_vcf8kern.py` (+`schlib_hier.py`). *Dicht maar leesbaar; kan verder
uitgespreid worden.*

**Status: routing 99% af** (2026-07-22) — ERC 0, netcheck OK, plaatsing
net-bewust (v3), alle signalen + voedingen geroute; rest = ±10 kleine
hand-fixes (exacte lijst in `doc/plans/vcf8kern-handover.md` §restklusje),
daarna DRC 0/0 + fab. Recept + valkuilen: WERKWIJZE.md §"Dichte borden".
Dit is een **rev-0.1-validatiekaart**: verwacht een respin na de bench-test
(SSI2140-niveaus, pole-mix-matching, tune-lus).

## Architectuur

```
                          ┌───────────── per stem (×8) ──────────────┐
kernslot ─SCLK/SDIN/CS/LDAC─► 2× AD5754 (daisy) ─VCUTk─►54.9k─► EXPO(7) SSI2140
  (v1.1)  ─SCLK2/SDIN2/CS2──► DAC128S085 ─VQk─►13k─► Q CTRL(12)   4-pole cascade
          ─FMCV─►buffer─►100k─► EXPO(7)                           IN1→gm1..gm4→OUT4
J2 AUDIO IN ─►/5-buffer─► AINB ─►15k─► IN1 ... cascade ... OUT1..OUT4
                                    │
              taps E0=AINB,E1..E4=OUT1..OUT4 ─► 8 passieve som-sterren
                                    └─► 4051 (MODE0..2) ─► ×5-buffer ─► J3 AUDIO UIT
OUT4 (×8) ─► 4051 (TSEL0..2) ─► LM311 ─► TOUT (open-drain, TEN via 2N7002)
```

### SSI2140-cascade (datasheet Fig 3, SSOP-20 — zelf solderen)

⚠️ **Pinout datasheet-geverifieerd** (2026-07-20): de buildspec had pins 1–6
verwisseld. Correct: 1=OUT2 2=CAP2 3=IN2 4=OUT1 5=CAP1 **6=IN1 (ingang)**
7=EXPO 8=TEMPCO 9=Q VCA OUT 10=GND 11=V− 12=Q CTRL 13=Q VCA IN+ 14=OUT4
15=CAP4 16=IN4 17=OUT3 18=CAP3 19=IN3 20=V+.

- Keten: `IN1(6)→gm1→OUT1(4)→IN2(3)→gm2→OUT2(1)→IN3(19)→gm3→OUT3(17)→IN4(16)
  →gm4→OUT4(14)`. Per trap **15k serie-in + 15k feedback + 200Ω shunt→GND +
  1nF C0G op CAPx** (Fig-20-schaling 15k voor buffer-load ≥5k). Elke cel
  inverteert → de pole-mix-tekens komen gratis.
- **Resonantie**: Q VCA OUT (pin 9, stroom) **direct op de IN1-knoop** →
  resonantie om de héle keten (SSM2040-karakter, Marks topologiekeuze). Zelf-
  oscillatie ≈ 222 µA; 13k vanaf de 0–3V3-Q-DAC geeft 254 µA = net voorbij.
- **Q-compensatie** (input-gain, Fig 14): AINB → 16.2k → Q VCA IN+ (13),
  1k pin13→GND — constante passband, géén extra opamp.
- **EXPO** (Fig 2b, tempco uit): cutoff-CV → 54.9k → pin 7, **1k pin7→GND,
  pin 8 open**. Temperatuurcompensatie via B10-tuningcycles i.p.v. de tempco-R.

### Pole-mixing (Fig 20 + AN701 Table 1)

5 taps (E0 = gebufferde ingang AINB, E1..E4 = OUT1..OUT4) → **8 passieve
gewogen-som-sterren** (één per mode) → een **4051** kiest de mode (MODE0..2) →
uitgangsbuffer. Gewicht *w* → weerstand **75k/w** (R_ref = 75k = Fig-20 RF);
gebruikte waarden 75k/37.4k/18.7k/12.4k. De passieve normalisatie (÷Σgewichten)
egaliseert de modeniveaus vanzelf. Tekens komen uit de trap-inversies, dus alle
weerstanden positief naar één knoop (AN701 §2).

**Modemenu (tap-zuinig, 15 mix-R/stem):**

| MODE0..2 | Mode | Gewichten (E0,E1,E2,E3,E4) |
|:--:|---|---|
| 000 | 4-pole LP | 0,0,0,0,1 |
| 001 | 3-pole LP | 0,0,0,1,0 |
| 010 | 2-pole LP | 0,0,1,0,0 |
| 011 | 1-pole LP | 0,1,0,0,0 |
| 100 | 2-pole HP | 1,2,1,0,0 |
| 101 | 2-pole BP | 0,1,1,0,0 |
| 110 | 4-pole BP | 0,0,1,2,1 |
| 111 | notch | 1,2,2,0,0 |

MODE gedeeld = **globale** modekeuze (v1); per-stem-modes = contract-extensie.

### CV — twee DAC-domeinen

- **Cutoff** (precisie, breed): **2× AD5754BREZ** in daisy op CS (16-bit,
  ±10 V-range, ADR421 2.5 V-ref — verplicht, non-R-variant). Offset binary
  (BIN→DVCC), EP=AVSS=−12V. VCUT1-4 = U31 A/B/C/D, VCUT5-8 = U32 A/B/C/D.
- **Q** (unipolair): **DAC128S085** octaal 12-bit (0–3V3), op de tweede
  SPI-keten (SCLK2/SDIN2/CS2). VQ1-8 = VOUTA-H → 13k → Q CTRL.
- **FMCV** (kernslot pin 5): audio-rate FM van de front-jack (via de
  backbone-attenuverter) → on-card buffer → per stem 100k op de EXPO-knoop.

### Tune (B10)

OUT4 van elke stem → **4051** (TSEL0..2 selecteren de stem) → **LM311**
comparator → **TOUT** (open-drain, pull-up op de backbone). **TEN** (geografisch)
schakelt via een **2N7002** de LM311-emitter naar GND: TEN hoog = déze kaart
drijft TOUT; anders hoog-Z. De Brain pollt via CS2, de RP2040-PIO meet de
periode/duty. Geen analoge tune-lijn over de bus.

## Kernslot-contract v1.1 (`doc/poly-analog-spec.md` B7)

Haakse male 2×12 aan de onderrand (J1), plugt in de verticale female 2×12 op
de backbone. Pins 1–6 spiegelen het busslot.

| Pin | Net | Pin | Net |
|--:|---|--:|---|
| 1 | GND | 2 | +12V |
| 3 | GND | 4 | −12V |
| 5 | **FMCV** | 6 | +3V3 |
| 7 | SCLK | 8 | GND |
| 9 | SDIN (AD5754 in) | 10 | SDO (daisy uit) |
| 11 | CS (SYNC) | 12 | LDAC |
| 13 | SCLK2 | 14 | SDIN2 (DAC128 in) |
| 15 | SDO2 (daisy uit) | 16 | CS2 |
| 17 | MODE0 | 18 | MODE1 |
| 19 | MODE2 | 20 | TSEL0 |
| 21 | TSEL1 | 22 | TSEL2 |
| 23 | TEN (geografisch) | 24 | TOUT (open-drain) |

**Audio** loopt níet door dit contract: **J2 = AUDIO IN, J3 = AUDIO UIT**
(1×10, jack8-contract: 1=GND, 2–9=stem1–8, 10=GND), **verticaal op de
bovenrand** (tegenover de kernslot). Verticale headers = van bovenaf geplugd
in de kaart-tot-kaart-gap; er is een plug-keepout omheen zodat het IDC-huis
vrij ligt (de lage 0603's ernaast lopen er in Z onderdoor).

## Kanaalmap (firmware)

| Stem | cutoff (AD5754) | Q (DAC128S085) | J2/J3 | tune-mux |
|--:|---|---|---|---|
| 1–4 | U31 A/B/C/D | VOUTA–D | pin 2–5 | Y4/Y7/Y6/Y5 |
| 5–8 | U32 A/B/C/D | VOUTE–H | pin 6–9 | Y2/Y0/Y1/Y3 |

De tune-mux-Y's zijn **geografisch** gemapt (2026-07-21, routing): linker
fysieke pinnen = helft-L (stem 1–4), rechter = helft-R (stem 5–8). Firmware-
tabel TSEL-code *n* (=Y*n*) → stem: **0→6, 1→7, 2→5, 3→8, 4→1, 5→4, 6→3, 7→2**.

- **POR/mute**: cutoff-DAC's centreren met marge (firmware); geen per-stem
  instelpots (B10-trimmerbeleid — het poly-probleem). Rev-0.1 legt géén
  DNP-trimvoetjes: de DAC-ranges + B10-tuning doen de kalibratie digitaal.

## Bestukken

- **JLC PCBA** voor alles uit de LCSC-catalogus: 4051/DAC128S085/TL074/LM311/
  2N7002/ADR421/passieven. ⚠️ **AD5754** (HTSSOP, ~€28 @LCSC) pas op een
  gevalideerd board (Route B) of los sourcen/consignment.
- **SSI2140** (SSOP-20, Sound Semiconductor — niet bij LCSC): **zelf
  nasolderen** (drag-solder, 0,635 pitch). De SSI-plekken op de top liggen
  vrij; **dubbelzijdige bestukking**: bottom-0603's vallen bij lokaal
  ironwerk niet af (FR4 geleidt slecht), maar het bord ligt niet vlak →
  foam/fixture onder de kaart bij het nasolderen.
- Rot van alle SMD in de JLC-preview checken vóór PCBA (nieuwe placement).

## Testen zonder backbone

Zie **`musicbrain-vcf8kern-testadapter`**: passief kaartje dat de kern direct
op de hoofd-SPI-bus zet (MOSI→SDIN+SDIN2, SCLK→SCLK+SCLK2, IRQ→CS2), met
MODE/TSEL-jumpers en een TOUT-pullup — bench-test vóór de VCF8-backbone bestaat.

## Openstaand vóór fab

- Routing (aparte sessie); daarna DRC 0/0 + fab-pakket.
- RP2040-PIO-SPI-slave-test (poly-spec open punt) staat los van deze kaart.
- Pole-mix-matching: AN701 waarschuwt dat stopband-diepte volledig van de
  weerstandstolerantie afhangt — 1%-serie minimaal; bij respin evt. array's.
- Interne niveaus (SSI ±1 V, in-attenuatie ÷5 / uit-versterking ×5) op de
  bench meten en het noise-budget vastleggen.
