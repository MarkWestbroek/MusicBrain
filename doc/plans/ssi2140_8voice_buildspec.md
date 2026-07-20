# SSI2140 — 8-voudige VCF buildspec (11 × 6 cm)

Bron: Sound Semiconductor SSI2140 datasheet Rev. 3.1.1 (maart 2023).
Aannames v1: ±12 V rails, CV uit DAC's (µC/FPGA-gestuurde polyfonie), vaste 4-pole lowpass per stem.

---

## 1. Pinout (geverifieerd, 20-lead SSOP)

| Pin | Naam | Functie |
|-----|------|---------|
| 1 | OUT 1 | Buffer-uitgang gm1 (±1 V swing, min. 10 k belasting) |
| 2 | CAP 1 | Integratie-cap gm1 → GND (≥50 pF, aanbevolen 1 nF) |
| 3 | IN 1 | Inverterende ingang gm1 (10 k serie + 200 Ω shunt) |
| 4 | OUT 2 | Buffer-uitgang gm2 |
| 5 | CAP 2 | Integratie-cap gm2 → GND |
| 6 | IN 2 | Ingang gm2 |
| 7 | EXPO CTRL | Frequentie-CV, exponentieel on-chip, −18 mV/oct |
| 8 | TEMPCO | Interne 890 Ω tempco-weerstand (naar GND). Ongebruikt = open laten |
| 9 | Q VCA OUT | Resonantie-feedback, **stroom**-uitgang. Ongebruikt = naar GND |
| 10 | GND | Analoge signaalmassa, korte low-inductance trace |
| 11 | V− | Negatieve voeding, 100 nF lokaal ontkoppeld |
| 12 | Q CTRL | Q-VCA gain, ground-referenced **stroom**-ingang (0–500 µA; osc. ~222 µA) |
| 13 | Q VCA IN+ | Niet-inv. ingang Q VCA (inv. ingang zit intern op OUT 4 via 16:1) |
| 14 | OUT 4 | Buffer-uitgang gm4 = **eindtap 4-pole LP** |
| 15 | CAP 4 | Integratie-cap gm4 → GND |
| 16 | IN 4 | Ingang gm4 |
| 17 | OUT 3 | Buffer-uitgang gm3 |
| 18 | CAP 3 | Integratie-cap gm3 → GND |
| 19 | IN 3 | Ingang gm3 |
| 20 | V+ | Positieve voeding, 100 nF lokaal ontkoppeld |

De vier gm-cellen **delen één frequentie-stuurelement** (EXPO CTRL). Binnen één chip tunen alle vier de polen dus samen — daarom is één SSI2140 = één stem, niet twee.

---

## 2. Eén kanaal: klassieke 4-pole lowpass (datasheet Fig. 3)

Signaalketen: `IN → gm1 → gm2 → gm3 → gm4 → OUT`, uitgang op OUT 4 (pin 14). Elke cel inverteert; vier cellen in serie geven de klassieke 4-pole LP met 180° fasedraai op Fc.

**Per gm-trap:**
- 10 kΩ serieweerstand van de vorige uitgang naar de IN-pin.
- 200 Ω shunt van IN-pin naar GND (brengt signaal terug naar de ~tientallen mV die de ingang aankan; peak ~2 Vpp aan de bron).
- 1 nF C0G/NP0 van de CAP-pin naar GND (zet de Fc; 470 pF ≈ dubbele Fc, 2,2 nF ≈ halve Fc).
- Buffer-uitgang via 10 kΩ naar de volgende trap.

**Resonantie:** Q VCA OUT (pin 9) is een stroom die **direct** terug wordt gesommeerd op de eerste ingangsknoop — geen op-amp nodig in de feedback. De eerste trap gebruikt in Fig. 3 een 953 Ω shunt i.p.v. 200 Ω omdat de Q-feedbackstroom hier samenkomt (neem de eerste-trap-waarden exact over uit Fig. 3).

**Uitgang:** OUT 4 buffered met ½ dual op-amp (TL072 / MCP6002) → schone kanaal-uitgang.

---

## 3. CV-sturing (DAC / firmware-aanpak)

**Cutoff (pin 7, EXPO CTRL):**
- On-chip exponentieel, −18 mV/oct. Voer een **1V/oct-geschaalde spanning** in via 54,9 kΩ serie.
- Voor µC-poly: **laat pin 8 open, 1 kΩ van pin 7 naar GND**, en doe temperatuurcompensatie via periodieke tuning-cycles in firmware (datasheet-advies). Bespaart de tempco-tie én de per-kanaal 1V/oct-trim.
- Nuttig bereik ~ +5 V…−5 V aan de CV-bron. Scale + offset kalibreer je in software.

**Resonantie (pin 12, Q CTRL):**
- Ground-referenced stroomingang. Eén 20 kΩ serieweerstand vanaf de CV: **0 V = geen resonantie, ~4,4 V = zelf-oscillatie** (222 µA). Volledig CV-bestuurbaar.
- De slope is niet-lineair (vlak laag, steil richting oscillatie) — corrigeer desgewenst in firmware met een lookup/curve i.p.v. een hardware reverse-log taper.

---

## 4. Per kanaal vs. gedeeld

| Signaal | Scope |
|---------|-------|
| Cutoff-CV (pin 7) | Per kanaal — eigen DAC-kanaal |
| Resonantie-CV (pin 12) | Per kanaal — eigen DAC-kanaal |
| Audio in / uit | Per kanaal |
| Integratie-caps, weerstanden | Per kanaal |
| V+, V−, GND, bulk-decoupling | Gedeeld over de print |

Voor 8 **onafhankelijke** stemmen de tempco-weerstanden NIET parallel schakelen (dat is alleen voor stereo/tracking-paren). Onafhankelijke voices → firmware-tuning per kanaal.

---

## 5. Per-kanaal BOM

Alles hieronder is standaard JLC-voorraad en wordt door JLC bestukt; **jij plaatst zelf de SSI2140.**

| Ref | Waarde | Package | Aantal | Opmerking |
|-----|--------|---------|--------|-----------|
| U (chip) | SSI2140 | SSOP-20 | 1 | **Jij handmatig, drag-solder, 0,635 mm pitch** |
| C_cap1–4 | 1 nF C0G/NP0 | 0603 | 4 | Integratie-caps, tolerantie ≤5% voor matching |
| R_ser | 10 kΩ 1% | 0603 | ~7 | Ingang + inter-trap serie + buffer-load (zie Fig. 3) |
| R_shunt | 200 Ω 1% | 0603 | 3–4 | Shunt per gm-ingang |
| R_first | 953 Ω 1% | 0603 | 1 | Eerste-trap shunt / Q-feedback (Fig. 3) |
| R_expo | 54,9 kΩ 0,1% | 0603 | 1 | 1V/oct scaling (of firmware-scaled) |
| R_tempco | 1 kΩ | 0603 | 1 | Pin 7 → GND (tempco uit, firmware-tuning) |
| R_q | 20 kΩ 1% | 0603 | 1 | Q-CV → pin 12 |
| C_dec | 100 nF | 0603 | 2 | Ontkoppeling V+ en V− bij de pins |
| U_buf | TL072 / MCP6002 | SOIC-8 | ½ | Output-buffer (1 dual per 2 kanalen) |

Gedeeld per print: 47–100 µF bulk per rail, ingangs-/uitgangsconnectoren, CV-bus.

---

## 6. Q-compensatie (kies er één)

De passband-gain zakt bij hogere resonantie. Drie opties:

- **Geen** (Fig. 3): klassieke synth-respons, −12 dB dip vlak bij oscillatie. Minst parts. "Vintage" gedrag.
- **Input-gain** (Fig. 14): voer het ingangssignaal ook op de Q VCA IN+ (pin 13) via **RQI 16,2 kΩ + RQG 1 kΩ** — géén extra op-amp, alleen 2 weerstanden. Passband blijft constant. **Aanbevolen default.**
- **Output-gain** (Fig. 15): compensatie op de uitgang, minder vervorming bij hoge Q, maar **+2 op-amps per kanaal**. Alleen als je die timbre wilt.

---

## 7. Multimode / uitbreiding (later)

Pole-mixing (datasheet Fig. 20 + App Note AN701) haalt LP/HP/BP/notch/AP uit de tussentappen via een gewogen mixer + analoge switches. Per stem = 1 mixer-opamp + switches → te veel voor 8-voud op 11×6.

Keuzes: vaste 4-pole LP per stem (v1), of pole-taps (OUT 1/2/3/4) naar headers/bus voor één **globale** mode-select over alle 8 stemmen, of 4-voud met volledige per-stem multimode.

---

## 8. Layout — 8-voud op 11 × 6 cm

- **Oppervlaktebudget:** 66 cm² / 8 ≈ 8,25 cm² per stem. Eén kanaal (SSOP-20 + ~20× 0603 + ½ SOIC-8) past ruim onder 4 cm² → 8-voud comfortabel, ook enkelzijdig-bestukt door JLC met jouw chips erbovenop.
- **Grid:** 2×4 (stroken ~5,5 × 1,5 cm) of 4×2 (cellen ~2,75 × 3 cm). Strookindeling houdt de per-kanaal routing kort en identiek — makkelijk te kopiëren in KiCad.
- **Handsoldeer-keep-out:** rond elke SSI2140 een vrije rand (~1,5–2 mm) zonder door-JLC-geplaatste onderdelen tegen de pins; verleng de IC-pads iets voor drag-solderen; pin-1 dot op silk.
- **Decoupling:** 100 nF zo dicht mogelijk op pin 11 en 20 van elke chip; stervormige of goed-vlak GND.
- **Matching:** houd de 4 integratie-caps per kanaal identiek (zelfde reel/tolerantie); zet ze kort bij de CAP-pins.
- **CV-in:** analoge CV-lijnen (cutoff + Q per stem) van de DAC direct naar de print; geen potmeters/jacks op deze print (die horen op het moederbord).

---

## Openstaande keuzes voor finalisatie
1. Rails: ±12 V aangenomen — klopt dat, of ±15 / ±5?
2. CV-bron: DAC-per-stem (dan firmware-tuning, tempco uit) — bevestigd?
3. Q-compensatie: input-gain (aanbevolen) of klassiek ongecompenseerd?
4. Multimode: vaste LP nu, of pole-taps naar headers voor globale mode-select?
