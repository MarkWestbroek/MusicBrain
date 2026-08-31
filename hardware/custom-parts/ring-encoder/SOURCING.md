# Sourcing — RingEncoder

Prijzen indicatief (aug 2026), kleine aantallen.

## Displays
| Onderdeel | Bron | Prijs | Opmerking |
|---|---|---|---|
| 1,28" GC9A01 240×240 rond, kale module | AliExpress: "GC9A01 1.28 round LCD" (TZT, Hiletgo) | €3–4 | Kaal = paneel + flex, dít inbouwen |
| idem, breakout | AliExpress / Waveshare "1.28inch LCD Module" (ook TinyTronics, Kiwi Electronics NL) | €5–12 | Voor firmware-ontwikkeling op breadboard |
| idem, premium | Adafruit 6178 (GC9A01A, EYESPI) via Mouser/Digikey | ~€20 | Beste paneel, prototype-luxe |
| idem, serie | DisplayModule DM-TFTR128-446 | op aanvraag | 400 nits, STEP-file beschikbaar |
| 0,71" GC9D01 160×160 rond, kaal | AliExpress: "0.71 inch round TFT 160x160" (TZT) | ~€3 | Voor 42/34 mm-variant; chin-maat nameten |
| 0,96" rond 240×198 ST7789 | MSP0962/0963 (lcdwiki) | €4–6 | LET OP: beeld onderaan afgeplat, niet vol-rond |

## Mechanisch
| Onderdeel | Bron | Prijs | Opmerking |
|---|---|---|---|
| Lager 6807-2RS (35×47×7) | Kogellagerdirect.nl, Kugellager-Express.de | €2–4 | 53 mm-variant; 2RS, vet uitwassen |
| Lager 6805-2RS (25×37×7) | idem | €2–3 | 42 mm-variant |
| Lager 6704 (20×27×4) | idem | €2–3 | 34 mm-variant; ook 6 mm-hoge 6807's in omloop — maat checken |
| Ringmagneet Ø48/41×3 diametraal | AliExpress "ring magnet diametrically magnetized"; Supermagnete.de | €1–3 | Supermagnete garandeert magnetisatierichting; axiaal = onbruikbaar |
| Ringmagneet Ø38/32×2,5 diametraal | idem | €1–2 | 42 mm-variant |
| Pilaar + ring | zelf printen (PETG/ASA) of frezen | €0,50 | STL uit FreeCAD-macro |

## Elektronica
| Onderdeel | Bron | Prijs | Opmerking |
|---|---|---|---|
| MT6701 (hall, SSI/I²C) | LCSC, AliExpress | ~€1 | Voorkeur: SSI = CS per stuk, geen adresconflict |
| AS5600 breakout | AliExpress | ~€1 | Alternatief; vast I²C-adres → mux (TCA9548A) of analoge OUT naar ADC |
| FPC-connector 0,5 mm (FH12-achtig, 12/18-pins) | LCSC | €0,30 | Pitch/pins afstemmen op geleverde display-flex |
| ESP32-S3 module (WROOM-1 / Stamp) | LCSC, Mouser | ~€6 | Per bank van 8 |
| RP2040 | idem | ~€1–4 | Alternatief per bank (PIO-multi-SPI) |
| PCB's (knop + bank) | JLCPCB; Aisler (EU, eerder al gebruikt) | €8–12/bank-aandeel | JLC-assembly optioneel €15–25/bank |
| Frontpaneel alu | JLCPCB (alu-PCB-truc) of Schaeffer/Front Panel Express | €20–35 | |

## Referenties
- M5Stack Dial v1.1 ($34,90) — testbed/referentie; schema's: github.com/m5stack/M5_Hardware (SKU K130) en M5-Schematic repo; docs.m5stack.com → Dial v1.1
- Waveshare ESP32-S3-Knob-Touch-LCD-1.8 (~€30–35) — makkelijk vindbaar alternatief testbed
- SmartKnob (github scottbez1/smartknob) — referentie voor gemotoriseerde v2
- Roendi (github MitkoDyakov/Roendi) — STM32-referentie-implementatie
- lcdwiki MSP0962/0963 spec-PDF — paneelmaten kleine ronde displays
- upiir/arduino_round_lcd_display — GC9A01 UI-voorbeelden
