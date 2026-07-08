# MusicBrain DAC8 — 8× CV-uitgang (slotkaart)

**Status**: schema ERC-schoon + netlist geverifieerd; PCB volledig geroute
(DRC 0 fouten, 0 unconnected). **Spec**: `doc/spi-bus-spec.md`.
Bord: 50 mm breed × **80 mm hoog** (H-standaard), 2 lagen.

## Wat het is

8 nette CV-uitgangen uit **2× AD5754BREZ** (16-bit quad-DAC, ±10V-bereik)
met een gedeelde **ADR421**-referentie (2,5 V precisie) — hetzelfde
gevalideerde recept als de AD5754-breakout, nu als slotkaart in lijn met
GATE8/ADC8.

## Architectuur

- **Daisy-chain**: MOSI → U1.SDIN, U1.SDO → U2.SDIN, U2.SDO → MISO.
  Eén CS voor beide chips; de firmware klokt 48-bit frames (2×24) en
  bereikt beide DAC's in één transactie. U2.SDO is tri-state bij CS hoog.
- **LDAC = buslijn** (slotpin 15): beide chips laden hun uitgangsregisters
  tegelijk op LDAC↓ — en tegelijk met álle andere DAC-kaarten op de bus.
  Dat is precies waarvoor de LDAC-lijn in de spec bestaat.
- **Offset binary** (BIN/2sCOMP → DVCC), ~CLR met 10k pull-up (R1),
  interne versterkers op ±12V (AVDD/AVSS), EP-pads aan AVSS.
- 100 Ω serie per uitgang (R2–R9), kortsluitbescherming.

## Kanaaltoewijzing

| CV | DAC | | CV | DAC |
|---|---|---|---|---|
| CV1 | U1·B | | CV5 | U2·A |
| CV2 | U1·A | | CV6 | U2·B |
| CV3 | U1·C | | CV7 | U2·C |
| CV4 | U1·D | | CV8 | U2·D |

(CV1/CV2 verwisseld t.o.v. alfabetisch — routinggedreven; firmware-tabel.)

## Aansluitingen

- **J1** (haakse male 2×10, onderrand): volledig contract incl. +12V,
  −12V, +3V3, LDAC; MOSI én MISO in gebruik (daisy).
- **J2** (haakse male 1×10, bovenrand): 1 = GND, 2–9 = CV1..8, 10 = GND —
  zelfde jack8-contract; **JP1 op het jack8-printje OPEN laten** (outputs!).

## PCB-notities

De acht VOUT's verlaten de chips via korte F-escapes naar via's en lopen
als B.Cu-lanes (y 114,3–118,3, strikt genest) naar de serieweerstandsrij.
De stuursignalen dalen als B-rijen onderin (CS 168,6 / SCLK 169,4 /
MOSI 170,2 / CLR 162,4) naar F-verticalen die de 0,65 mm-westkolommen
in nesten ("diepste entry → oostelijkste verticaal"); LDAC heeft een
F-band op y 167,3 en stapt bij U1 van onderen de padkolom in. De
±12V/+3V3-verdeling loopt via een F-corridor (y 120,3/121,1) boven de
chips en B-banden (y 160,8/161,6) onderlangs. VREF loopt op B.Cu van de
ADR421 naar beide REFIN-pinnen. DGND-pads tussen de fijne entries hangen
aan eigen redding-via's.

## Firmware

Setup per chip (via de keten): power-up register (alle kanalen aan),
output range ±10V, BIN-coding. Daarna per sample: 2×24 bit data door de
keten schuiven, CS hoog, en LDAC↓ (buslijn) voor de synchrone update.
