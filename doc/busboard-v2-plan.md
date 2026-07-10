# Busboard v2 — pin-herplan + nieuwe blokken (ontwerpdocument)

**Datum:** 2026-07-11 · **Status:** ontwerp gestart (besluit Mark: "ja, graag busboard v2")
**Basis:** `doc/spi-bus-spec.md` (v1.1) + besluiten 2026-07-09 (MIDI, codec, TUNE-IN)
+ besluit 2026-07-11 (CS/IRQ-uitbreiding zodat een tweede busboard-segment kan).

## Waarom v2

1. **Uitbreidbaarheid**: v1 heeft 6 slots + 2 hubs, elk met een eigen Teensy-pin voor
   CS en IRQ (14 pinnen totaal). Daarmee is de bus vol. v2 decodeert CS met een
   74HC154 (5 pinnen → 16 CS) en verzamelt IRQ's met 74HC165-schuifregisters
   (0 extra pinnen — uitgelezen via de SPI-bus zelf). Dat maakt 6 extra CS/IRQ-lijnen
   vrij voor een **expansieheader** naar een tweede busboard-segment.
2. **De codec dwingt toch al een pin-herplan af**: CS42448 via Teensy Audio TDM
   (I2S1 = pinnen 7, 8, 20, 21, 23) botst met CS3/CS4 en de EXP-header van v1.1.
   De pinnen die de CS-decoder vrijspeelt zijn precies deze.
3. **MIDI (2×IN/1×UIT), CAN, TUNE-IN en delegate-UART-poorten** stonden al op de
   v2-lijst.

**Kaarten veranderen NIET**: de slot-pinout (2×10) blijft identiek; een kaart ziet
zijn CS nog steeds op pin 13 en zijn IRQ op pin 16 — alleen komt CS nu uit een
decoder en gaat IRQ een schuifregister in. Alles wat af is, kan besteld worden.

## Teensy 4.1 pintoewijzing v2

| Pin | v1.1 | **v2** | | Pin | v1.1 | **v2** |
|---|---|---|---|---|---|---|
| 0 | display CS | display CS | | 22 | EXP | vrij → EXP (CTX1-optie) |
| 1 | vrij | **TUNE_IN** (capture) | | 23 | EXP | **I2S1 MCLK1** (codec) |
| 2 | LDAC | LDAC | | 24 | display DC | display DC |
| 3 | CS8 | **CSA0** (decoder A0) | | 25 | display RST | display RST |
| 4 | CS7 | **CSA1** | | 26 | MOSI1 | display MOSI1 |
| 5 | CS6 | **CSA2** | | 27 | SCK1 | display SCK1 |
| 6 | CS5 | **CSA3** | | 28 | IRQ1 | **MIDI IN2** (RX7) |
| 7 | CS4 | **I2S1 OUT1A** (codec) | | 29 | IRQ2 | vrij → EXP (TX7) |
| 8 | CS3 | **I2S1 IN1** (codec) | | 30 | IRQ3 | **CAN3 CRX3** |
| 9 | CS2 | **CS_EN** (decoder /E0) | | 31 | IRQ4 | **CAN3 CTX3** |
| 10 | CS1 | vrij → EXP (native CS0) | | 32 | IRQ5 | vrij → EXP |
| 11 | MOSI | MOSI | | 33 | IRQ6 | **CODEC_RST** (naar J17) |
| 12 | MISO | MISO | | 34 | vrij pad | **MIDI IN1** (RX8) |
| 13 | SCLK | SCLK | | 35 | vrij pad | **MIDI OUT** (TX8) |
| 14/15 | EXP (Serial3) | **DLG1** delegate-UART | | 36–39 | vrij pads | vrij → EXP |
| 16/17 | EXP (Serial4) | **DLG2** delegate-UART | | 40 | CONVST | CONVST |
| 18/19 | SDA/SCL | SDA/SCL | | 41 | ADC_RESET | ADC_RESET |
| 20 | EXP | **I2S1 LRCLK1** (codec) | | 21 | EXP | **I2S1 BCLK1** (codec) |

## Nieuwe blokken

### CS-decoder (74HC154, SOIC-24, @3V3)
- A0–A3 = pins 3/4/5/6; /E0 = pin 9 (strobe), /E1 = GND.
- Firmware: adres zetten → /E0 laag → SPI-transactie → /E0 hoog. Outputs zijn
  actief-laag; met /E0 hoog zijn álle CS hoog (rust). Slechts één CS tegelijk
  mogelijk — precies de SPI-semantiek.
- Toewijzing: Y0–Y5 = CS1–CS6 (slots), Y6/Y7 = CS7/CS8 (hubs), Y8–Y13 = CS9–CS14
  (expansieheader), **Y14 = IRQSTAT** (leest de 165-keten), Y15 = ongebruikt (parkeer).

### IRQ-aggregatie (2× 74HC165 + 74LVC1G125, gatein8-recept)
- 16 ingangen: IRQ1–IRQ6 (slots), IRQ7–IRQ12 (expansie), 2 reserve aan GND.
  100k pulldown per gebruikte ingang (ongeplaatst slot leest 0).
- Uitlezen: decoder Y14 laag → 1G125 zet QH op MISO, /PL-latchpuls uit de
  Y14-neerflank via RC (220 pF/10 k, fw wacht ≥5 µs) → 16 bits klokken, mode 0.
  Omdat de decoder maar één output laag maakt, kan dit nooit met een kaart botsen.
- Latency: 1 kHz-tick pollt het statuswoord (16 bit ≈ 4 µs) — ruim voldoende;
  er is geen aparte IRQ_ANY-lijn (polariteit verschilt per kaart, OR is zinloos).

### Expansieheader J21 (2×13, IDC-baar) — het tweede segment
- Draagt: SCLK_X, MOSI_X, LDAC_X, CONVST_X, ADCRST_X (gebufferd door 74LVC245,
  richting vast, altijd aan, eigen 33 Ω serie), MISO (direct — kaarten tri-staten
  zelf, net als lokaal), CS9–CS14, IRQ7–IRQ12, SDA/SCL, rest GND.
- **Geen voeding over de kabel**: het tweede segment krijgt een eigen
  Eurorack-entry + eigen 3V3-regelaar (zelfde recept als v1).
- Het tweede-segment-bord ("busboard-x") is een latere, veel simpelere kaart:
  6 slots + deze header, geen Teensy, geen decoder.

### MIDI (2× IN + 1× UIT, DIN's op het paneel via kabel)
- IN ×2: H11L1-schmitt-opto + 220 Ω + 1N4148-clamp, pull-up 1k naar 3V3
  (open-collector-uitgang) → RX8 (34) en RX7 (28). Headers J13/J14 (1×3:
  DIN-4, DIN-5, afscherming-nc).
- UIT ×1: TX8 (35) → 74LVC1G17-buffer → 33R+10R per 3V3-MIDI-spec → J15 (1×3:
  DIN-5, DIN-4 via 10R naar 3V3, GND).

### CAN (satellieten-koppeling)
- SN65HVD230 (3V3) op CAN3 (CRX3=30, CTX3=31; CAN-FD-capabel).
- J16 (1×4): CANH, CANL, GND, **+12V** (voedt kleine satellieten mee).
- 120 Ω terminatie via soldeerjumper JP2 (dicht = dit uiteinde termineren).

### Codec-header J17 (2×7) — CS42448-bord komt later, apart
- +12V, −12V, GND, +5V, +3V3, GND, MCLK1(23), BCLK1(21), LRCLK1(20),
  OUT1A(7), IN1(8), CODEC_RST(33), SDA, SCL.
- TDM: 8 out / 6 in via de Teensy Audio-lib; audio-jacks op losse strips.

### TUNE-IN (VCO-ijking)
- J18 (1×2: TUNE, GND) vanaf de audio-in-strip; conditionering op het busboard:
  100k serie + BAT54S-clamp naar 3V3/GND + 100k pulldown + 74LVC1G17-schmitt →
  pin 1 (FlexPWM-capture; FreqMeasureMulti).

### Delegate-UART-poorten (Teensy-satellieten, besluit 07-08: níet op SPI)
- J19 "DLG1" (1×4): GND, TX3(14), RX3(15), GND · J20 "DLG2" (1×4): GND, TX4(16),
  RX4(17), GND. Kabel kruist TX/RX. Voeding niet over deze link.
- Nu 1 delegate (Elements); meer delegates later via CAN of het tweede segment.

### EXP-header J10 v2 (2×7)
- +3V3, GND, +5V, GND, D10, D22, D29, D32, D36, D37, D38, D39, GND, GND.
  (D10 = native CS0, D22 = CTX1-optie, D29 = TX7 — maakt Serial7 compleet
  als MIDI IN2 ongebruikt blijft.)

## Ongewijzigd t.o.v. v1.1

Slots J1–J6, hubs J7/J8, power-entry J9 + R-78E5.0 + LDO-recept, display J11
(SPI1), Qwiic J12, 33 Ω serie in SCLK/MOSI bij de Teensy, 200×115 mm, M3-gaten.

## Firmware-impact (MbBus)

- `select(n)`: adres op 3/4/5/6, /E0 (9) laag ipv digitalWrite(CSx).
- IRQ's: geen attachInterrupt per slot meer; per tick IRQSTAT lezen (Y14).
- Nieuw: MIDI op Serial7/8, CAN3 (FlexCAN_T4), codec via Audio-lib TDM.
