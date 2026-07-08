# AD5754BREZ — samenvatting datasheet + cross-check

> Bronnen: `doc/data-sheets/AD5724R_5734R_5754R.pdf` (Analog Devices Rev. G, 2009–2017),
> discussie in `doc/tech/dac-ad5754brez.md`, de lokale ComponentSearchEngine-library
> `doc/data-sheets/LIB_AD5754BREZ/` (CSE model v3.1, gedownload 2026-07-08; zie §13),
> en cross-check tegen Nic Newdigate's teensy-eurorack (`D:\Git\Muziek\Nick\teensy-eurorack\hardware`).
>
> Doel: de pinout **eens en voor altijd** vastleggen (datasheet blz. 10 + Tabel 6), plus de
> zaken die er voor de MusicBrain-breakout toe doen.

---

## 1. Wat is het, precies?

| Item | Waarde |
| --- | --- |
| Fabrikant | Analog Devices |
| Functie | Complete, **quad (4-kanaals), 16-bit**, serieel-input, unipolair/bipolair spanningsuitgang-DAC |
| Behuizing | **24-lead TSSOP** met exposed pad (EPAD) — `RE` in het bestelnummer |
| Bestelnummer-decode | `AD5754` (basis) · `B` (grade, −40…+85 °C) · `RE` (TSSOP-24) · `Z` (RoHS/Pb-free) |
| Interface | SPI, tot **30 MHz**, DSP/µC-compatibel, daisy-chain + readback |
| Voeding analoog | AVDD +4.5…+16.5 V, AVSS −4.5…−16.5 V (of 0 V bij unipolair) |
| Voeding digitaal | DVCC +2.7…+5.5 V |
| Uitgangsbereiken (softwaremat.) | +5, +10, +10.8, ±5, ±10, ±10.8 V |
| Settling time | ~10 µs typ. |
| Referentie | **2.5 V EXTERN vereist** — zie §2 |

### ⚠️ 2. De belangrijkste valkuil: BREZ = géén interne referentie

De datasheet-PDF heet `AD5724R/AD5734R/AD5754R` — dat is de **R-variant mét interne
2.5 V referentie**. Ons onderdeel is de **AD5754BREZ, dus zónder `R`**.

Uit **Tabel 1** van de datasheet (blz. 1):

> `AD5724/AD5734/AD5754` = `AD5724R/AD5734R/AD5754R` **without internal reference.**

Gevolg voor de AD5754(BREZ):

- **Pin 17 heet hier alleen `REFIN`** (bij de R-variant `REFIN/REFOUT`). Er komt niets uit;
  je moet er een schone **2.5 V referentie in voeden**.
- Referentie-inputbereik 2 V…3 V, **2.5 V voor gespecificeerde performance**.
- → Voor de MusicBrain-breakout is een **precisiereferentie (ADR421, 2.5 V)** verplicht.
  Zie geheugen [[ad5754-breakout-design]]. Dit is ook precies het verschil met Nic's
  aanpak (§11): hij deelt een 2.5 V **LDO** als referentie; wij gebruiken een echte
  precisiereferentie.

De rest van deze samenvatting (pinout, registers, transferfunctie) geldt identiek voor
de R- en non-R-varianten; alleen pin 17 verschilt in functie.

---

## 3. Pinout — TSSOP-24 (datasheet blz. 10, Figuur 5 + Tabel 6)

Top view (Figuur 5), pen 1 linksboven, tegen de klok in:

```
              ┌──────────────┐
       AVSS  1│              │24  AVDD
         NC  2│              │23  VOUTC
      VOUTA  3│   AD5754R    │22  VOUTD
      VOUTB  4│              │21  SIG_GND
  BIN/2sCOMP 5│   TOP VIEW   │20  SIG_GND
         NC  6│ (not to scale)│19  DAC_GND
      ~SYNC  7│              │18  DAC_GND
       SCLK  8│              │17  REFIN (/REFOUT bij R)
       SDIN  9│              │16  SDO
      ~LDAC 10│              │15  GND
       ~CLR 11│              │14  DVCC
         NC 12│              │13  NC
              └──────────────┘
              EPAD (onderkant) → AVSS-potentiaal
```

### Tabel 6 — pinfuncties (volledig, letterlijk uit de datasheet)

| Pin | Naam | Type | Functie |
| --- | --- | --- | --- |
| 1 | **AVSS** | Voeding | Negatieve analoge voeding, −4.5…−16.5 V. Mag 0 V zijn als alle bereiken unipolair zijn. |
| 2 | NC | — | No Connect. **Niet aansluiten.** |
| 3 | **VOUTA** | Analoog uit | Uitgang DAC A. Drijft direct 2 kΩ / 4000 pF. |
| 4 | **VOUTB** | Analoog uit | Uitgang DAC B. |
| 5 | **BIN/2sCOMP** | Digitaal in | Kiest de coding bij **bipolaire** bereiken. **Hard bedraden** naar DVCC of GND — niet laten zweven. DVCC = offset binary; GND = twos complement. (Unipolair is altijd straight binary.) |
| 6 | NC | — | No Connect. Niet aansluiten. |
| 7 | **~SYNC** | Digitaal in | Actief-laag frame-sync. Data schuift in op dalende SCLK terwijl SYNC laag is; gelatcht op stijgende SYNC. |
| 8 | **SCLK** | Digitaal in | Seriële klok. Data ingeklokt op **dalende** flank. Tot 30 MHz. |
| 9 | **SDIN** | Digitaal in | Seriële data-in. Geldig op dalende SCLK. MSB eerst. |
| 10 | **~LDAC** | Digitaal in | Load DAC. Vast laag → output update op stijgende SYNC. Hoog tijdens write → output-update wacht tot dalende LDAC (simultaan updaten). **Niet onaangesloten laten.** |
| 11 | **~CLR** | Digitaal in | Actief-laag. Zet DAC-registers naar zero-scale óf midscale (instelbaar via control-register). |
| 12 | NC | — | No Connect. Niet aansluiten. |
| 13 | NC | — | No Connect. Niet aansluiten. |
| 14 | **DVCC** | Voeding | Digitale voeding, +2.7…+5.5 V. |
| 15 | **GND** | Voeding | Digitale/ground referentie. |
| 16 | **SDO** | Digitaal uit | Seriële data-uit voor daisy-chain/readback. Uitgeklokt op stijgende SCLK, geldig op dalende SCLK. Uitschakelbaar via control-register. |
| 17 | **REFIN** (`REFIN/REFOUT` bij R) | Referentie | Externe referentie-input, 2 V…3 V (**2.5 V** voor spec). Bij de R-variant tevens 2.5 V uitgang; bij BREZ **alleen input**. |
| 18 | **DAC_GND** | Voeding | Ground-referentie voor de vier DAC's. |
| 19 | **DAC_GND** | Voeding | idem. |
| 20 | **SIG_GND** | Voeding | Ground-referentie voor de vier output-amplifiers. |
| 21 | **SIG_GND** | Voeding | idem. |
| 22 | **VOUTD** | Analoog uit | Uitgang DAC D. |
| 23 | **VOUTC** | Analoog uit | Uitgang DAC C. |
| 24 | **AVDD** | Voeding | Positieve analoge voeding, +4.5…+16.5 V. |
| EPAD | **Exposed pad** | Thermisch | Aansluiten op **AVSS-potentiaal** (of elektrisch onaangesloten laten); thermisch op een koperplane voor warmteafvoer. |

> Let op de "gekruiste" volgorde aan de rechterkant: **22 = VOUTD, 23 = VOUTC** (dus niet
> C vóór D). VOUTA/B staan links (pin 3/4), VOUTC/D rechts (pin 23/22).

---

## 4. Voeding & ontkoppeling

- **AVDD / AVSS**: analoge rails. Voor ±10 V-uitgang wil de datasheet minimaal AVDD/AVSS
  = ±11.7 V (bij REFIN = 2.5 V); voor +12 V DC-output-headroom ±12.9 V (bij REFIN = 3 V).
  In Eurorack voeden we direct met de **±12 V** rails — ruim genoeg voor de ±10 V-bereiken.
- **DVCC**: 2.7…5.5 V logisch (bv. 3.3 V vanaf de host-MCU-rail).
- **AVSS = 0 V mag** als je uitsluitend unipolaire bereiken gebruikt; voor bipolair (±5/±10 V)
  is een negatieve rail nodig.
- Absolute max (blz. ~13): AVDD tot GND +0.3…−17 V; AVSS tot GND −0.3…+7 V; REFIN tussen AVSS en AVDD.
- Ontkoppel elke voedingspen dicht bij de chip (0.1 µF + bulk 10 µF per rail; referentiepen
  eigen 0.1 µF + 10 µF — Nic gebruikt precies die 0.1u/10u-combinatie op DAC_REF2V5).

---

## 5. SPI-interface & het 24-bits woord

- Elk commando = **24 bits**, MSB eerst, ingeklokt op **dalende SCLK** terwijl **~SYNC** laag is.
- Format (Tabel 17):

```
 DB23  DB22  DB21 DB20 DB19  DB18 DB17 DB16   DB15 ............ DB0
 R/W   0     REG2 REG1 REG0  A2   A1   A0     16-bit data
       (reserved, altijd 0)  (adres)          (data)
```

- **R/W**: 1 = read (readback), 0 = write.
- **DB22 reserved**: altijd 0.
- **REG2..0** kiest het doelregister (Tabel 18):

| REG2 REG1 REG0 | Register |
| --- | --- |
| 0 0 0 | DAC-register |
| 0 0 1 | Output-range-select |
| 0 1 0 | Power-control |
| 0 1 1 | Control |

- **A2..0** = kanaaladres:

| A2 A1 A0 | Kanaal |
| --- | --- |
| 0 0 0 | DAC A |
| 0 0 1 | DAC B |
| 0 1 0 | DAC C |
| 0 1 1 | DAC D |
| 1 0 0 | Alle vier |

---

## 6. Registers (kort)

- **DAC-register (REG=000)**: 16-bit data in DB15..DB0 (bij de 16-bit AD5754R; de
  AD5734R gebruikt DB15..DB2 = 14 bit, de AD5724R DB15..DB4 = 12 bit).
- **Output-range-select (REG=001)**: R2,R1,R0 in DB2..DB0 kiezen het bereik (Tabel 23):

| R2 R1 R0 | Bereik |
| --- | --- |
| 000 | +5 V |
| 001 | +10 V |
| 010 | +10.8 V |
| 011 | ±5 V |
| 100 | ±10 V |
| 101 | ±10.8 V |

- **Power-control (REG=010)**: bits PUA/PUB/PUC/PUD zetten elk kanaal aan (default = **uit/power-down**).
  Na inschakelen **10 µs power-up-tijd** aanhouden vóór je de output laadt. Bevat ook
  status-/alertbits (overcurrent OCA–OCD, thermal shutdown TSD) via readback.
- **Control-register (REG=011)** (Tabel 24/25):
  - `SDO disable` (schakel SDO uit als je geen readback/daisy-chain gebruikt),
  - `CLR select` (clear naar 0 V of midscale/neg. full scale),
  - `Clamp enable` (default aan: stroom geklemd op 20 mA i.p.v. uitschakelen bij overstroom),
  - `TSD enable` (thermal shutdown, default uit),
  - plus `Clear` en `Load` als losse commando's.

**Aanbevolen init-volgorde** (zoals Nic's voorbeeld ook doet):
1. Power-control: kanalen + interne blokken aanzetten.
2. (optioneel) Control: `SDO disable` als je SDO niet gebruikt.
3. Output-range-select: gewenst bereik per kanaal.
4. 10 µs wachten, dan DAC-register(s) schrijven / LDAC togglen.

---

## 7. Transferfunctie & coding

- **Unipolair**:  `VOUT = VREFIN · Gain · (D / 2^N)`
- **Bipolair**:   `VOUT = VREFIN · Gain · (D / 2^N) − Gain · VREFIN / 2`

met D = decimale code, N = bit-resolutie (16), VREFIN = referentie op pin 17.

**Interne gain per bereik (Tabel 7):**

| Bereik | Gain |
| --- | --- |
| +5 V | 2 |
| +10 V | 4 |
| +10.8 V | 4.32 |
| ±5 V | 4 |
| ±10 V | 8 |
| ±10.8 V | 8.64 |

(Met VREFIN = 2.5 V geeft gain 2 → +5 V FS, gain 8 → ±10 V FS, enz.)

**Coding:**
- Unipolaire bereiken → altijd **straight binary** (0x0000 = 0 V, 0xFFFF ≈ +FS).
- Bipolaire bereiken → **offset binary** (pin 5 → DVCC) of **twos complement** (pin 5 → GND).
  Bij offset binary is 0x8000 = midscale = 0 V, 0xFFFF ≈ +FS, 0x0000 ≈ −FS.
  → MusicBrain kiest **offset binary**, dus **pin 5 (BIN/2sCOMP) naar DVCC**. Zie [[ad5754-breakout-design]].

---

## 8. LDAC / SYNC / CLR gedrag (samengevat)

- **Individueel updaten**: LDAC vast laag → elk kanaal update op stijgende SYNC na zijn write.
- **Simultaan updaten**: LDAC hoog houden tijdens alle writes → daarna één keer LDAC laag →
  alle uitgangen tegelijk. Handig voor gesynchroniseerde CV/audio-updates.
- **~CLR**: laag houden ≥ min. tijd → alle kanalen naar zero/midscale; output blijft daar tot
  een nieuwe waarde geschreven wordt. LDAC/CLR **nooit laten zweven**.

---

## 9. Waarom deze chip voor Eurorack (uit `dac-ad5754brez.md`)

- Ingebouwde **hoogspanning-output-stage**: rechtstreeks ±10 V / 0–10 V uit de chip, geen
  externe op-amp-gain/offset nodig.
- **DC-nauwkeurig** (V/oct houdbaar, in tegenstelling tot audio-DAC's die DC wegfilteren).
- Snel genoeg (SPI tot 30 MHz) om alle 4 kanalen op audio-rate te draaien.
- Nadeel: prijzig (~€15–20) en veel voedingslijnen om te routen.

---

## 10. Snelle referentiekaart (voor schema/layout)

| Groep | Pinnen | Naar |
| --- | --- | --- |
| Analoge voeding | 24 AVDD / 1 AVSS | +12 V / −12 V (+ ontkoppeling) |
| Digitale voeding | 14 DVCC / 15 GND | 3.3 V (of 5 V) / GND |
| Grondreferenties | 18,19 DAC_GND · 20,21 SIG_GND | analoge GND (stervormig) |
| Referentie | 17 REFIN | **externe 2.5 V (ADR421)** |
| SPI | 7 ~SYNC, 8 SCLK, 9 SDIN, 16 SDO | host-MCU |
| Control | 10 ~LDAC, 11 ~CLR | host-MCU (nooit zwevend) |
| Coding-select | 5 BIN/2sCOMP | **DVCC** (offset binary) |
| Uitgangen | 3 A, 4 B, 23 C, 22 D | jack-buffers |
| Thermisch | EPAD | AVSS-plane |
| Niet aansluiten | 2, 6, 12, 13 | — |

---

## 11. Cross-check tegen Nic Newdigate (teensy-eurorack)

Gecheckt in `D:\Git\Muziek\Nick\teensy-eurorack`.

**Pinout — 100% bevestigd.** Nic's KiCad-symbool (`teensy-eurorack.lib`, `DEF AD5754BREZ`)
heeft exact dezelfde 24 pinnen + exposed pad (pin 25 = EP) als datasheet-blz. 10:

```
1 AVSS · 2 NC · 3 VOUTA · 4 VOUTB · 5 ~2SCOMP · 6 NC · 7 ~SYNC · 8 SCLK · 9 SDIN
10 ~LDAC · 11 ~CLR · 12 NC · 13 NC · 14 DVCC · 15 GND · 16 SDO · 17 REFIN
18 DAC_GND · 19 DAC_GND · 20 SIG_GND · 21 SIG_GND · 22 VOUTD · 23 VOUTC · 24 AVDD · EP
```

Hij labelt pin 17 als **`REFIN`** (niet REFIN/REFOUT) — consistent met de non-R BREZ.
Er zitten **twee** DAC's op zijn breakout (U2 en U3), beide identiek bedraad.

**Referentie — hier zit het verschil.** Op zijn PCB voedt netnaam `/DAC_REF2V5` pin 17 van
beide DAC's. Dat net wordt gedreven door:

| Component | Rol op /DAC_REF2V5 |
| --- | --- |
| **U5 = MCP1700-2502E** | 2.5 V LDO-regulator → levert de "referentie" |
| U6 = AD7606BSTZ (pin 42) | ADC deelt dezelfde 2.5 V |
| C29/C37 (10 µF), C30/C39 (0.1 µF) | ontkoppeling |

→ Nic gebruikt dus een **2.5 V LDO (MCP1700-2502)** als gedeelde referentie voor zowel de
DAC's als de AD7606-ADC — géén precisiereferentie. Een LDO heeft matige initiële
nauwkeurigheid (~±0.4 %) en tempco; dat vertaalt zich direct in schaalfout op VOUT.

**Conclusie / afwijking t.o.v. onze breakout:** de MusicBrain-keuze voor een **ADR421**
(2.5 V precisiereferentie, ~3 ppm/°C, ~0.05 %) is een bewuste verbetering boven Nic's
LDO-als-referentie. De pinout en het SPI-protocol nemen we 1-op-1 over; alleen de
referentie doen we beter. Zie [[ad5754-breakout-design]].

**Driver (`software/src/ad5754.h`)** bevestigt het protocol uit §5/§6: 3 bytes per commando,
`registerWord[2] = (regBits << 3) + adrBits`, MSB-first, en de register-/range-constanten
komen overeen met Tabel 18/23. Bruikbaar als referentie voor onze firmware-driver.

---

## 12. Openstaande aandachtspunten

- Pin 5 (BIN/2sCOMP) vast naar DVCC (offset binary) — controleer in ons schema.
- Pin 17 REFIN op ADR421-uitgang, met eigen 0.1 µF + 10 µF ontkoppeling dicht bij de pen.
- EPAD op AVSS-plane (níet op GND) — anders potentiaalverschil.
- Power-up: kanalen defaulten **uit**; firmware moet power-control schrijven + 10 µs wachten.
- CAD-model (symbool/footprint/3D) staat lokaal in `doc/data-sheets/LIB_AD5754BREZ/` — zie §13.

---

## 13. Lokale ComponentSearchEngine-library (`doc/data-sheets/LIB_AD5754BREZ/`)

Volledige multi-CAD-export van CSE (SamacSys), model **v3.1** (released 2015-10-13,
gedownload 2026-07-08). Metadata uit `AD5754BREZ/part_info.txt`:

| Veld | Waarde |
| --- | --- |
| Manufacturer | Analog Devices |
| Part | AD5754BREZ · Mouser P/N **584-AD5754BREZ** |
| Beschrijving (CSE) | "4-channel 16-bit Serial DAC, **100 ksps**" |
| Package | Small Outline, **PinCount = 25** (24 pins + 1 exposed pad) |
| 3D | Ja (`3D/AD5754BREZ.stp`) |

Er zitten libs in voor o.a. KiCad, Altium, EAGLE, EasyEDA, OrCAD/Allegro, PADS, DesignSpark,
Proteus, Pulsonix, DipTrace, CADSTAR/eCADSTAR en Xpedition. Voor ons relevant:

- **KiCad symbool**: `KiCad/AD5754BREZ.kicad_sym` (+ oude `.lib`/`.dcm`)
- **KiCad footprint**: `KiCad/SOP65P640X120-25N.kicad_mod`
- **3D-model**: `3D/AD5754BREZ.stp` (STEP)
- Gebruiksuitleg: `AD5754BREZ/How_To_Use_Models.pdf`; licentie: `license.txt`

### Symbool — pinout (derde onafhankelijke bevestiging)

Het CSE KiCad-symbool bevat exact dezelfde 24 pinnen + EP (pin 25) als datasheet-blz. 10 en
als Nic's symbool. Pin 17 heet ook hier **`REFIN`** (dus non-R, geen interne referentie —
consistent met §2). BIN/2sCOMP staat als `BIN/~{2SCOMP}` op pin 5. Alle NC's expliciet
gelabeld (NC_1…NC_4 op pin 2/6/12/13).

### Footprint `SOP65P640X120-25N` — cross-check tegen onze breakout

IPC-naam decode: SOP, **0.65 mm** pitch, **6.40 mm** lead-span, **1.20 mm** hoogte, **25** pads.

| Maat | CSE-model | Onze breakout (`HTSSOP-24-1EP_4.4x7.8mm_P0.65mm_EP3.2x5mm`) |
| --- | --- | --- |
| Body | 4.4 × 7.8 mm (F.Fab) | 4.4 × 7.8 mm |
| Pitch | 0.65 mm | 0.65 mm |
| Signaalpads | 0.45 × 1.475 mm, kolom op X = ±2.938 mm | idem-klasse |
| **Exposed pad (25)** | **3.25 × 5.02 mm** | **3.2 × 5.0 mm** |
| Courtyard | 7.85 × 8.4 mm | ~gelijk |

→ **Functioneel identiek**; het EP-verschil (3.25×5.02 vs 3.2×5.0) is ≤ 0.05 mm afronding.
De KiCad-standaardlib-footprint die de MusicBrain-breakout gebruikt is dus een prima match
met het officiële CSE/fabrikant-model. Onze zelf-gekozen footprint hoeft niet vervangen te
worden; het CSE-model is bruikbaar als validatie of als bron voor het STEP-3D-model.

> Kanttekening: de CSE-EP-pad heeft F.Paste over het volledige 3.25×5.02-vlak. Voor
> productie wil je meestal een opgedeelde (windowpane) paste-stencil op de thermal pad om
> te veel soldeer/float te voorkomen — check dit bij de fab-stap.
