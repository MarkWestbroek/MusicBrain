# MusicBrain SPI-bus specificatie (busboard + expansiekaarten)

**Status**: voorstel v1.0 — 2026-07-07
**KiCad-referentie**: `Images/schematics/musicbrain-busboard/musicbrain-busboard.kicad_sch`

Dit document is de leidende definitie voor de backplane ("busboard") en alle
expansiekaarten. Elke nieuwe kaart wordt tegen deze pinout en designregels
ontworpen — zelfde principe als de firmware-contract-keten: één bron van
waarheid, alles valideert daartegen.

## Architectuur

```
Eurorack PSU ──► busboard (Teensy 4.1 + 3V3/5V regeling)
                    │ 6 verticale slots (2x10)  +  2 hub-headers (2x5, IDC-kabel)
                    ├── slot 1..6: expansiekaarten (CV-out, gate, ADC-in, ...)
                    └── hub 1..2: bestaande breakouts (o.a. AD5754 rev 2.0)
```

- **Eén gedeelde SPI-bus** (SCLK/MOSI/MISO), CS per slot ("geografische
  adressering": elke kaart ziet zijn CS op dezelfde connectorpin; het slot
  bepaalt wélke CS dat is). Kaarten zijn dus slot-onafhankelijk en jumpervrij.
- **MISO is gedeeld**: SPI-slaves laten MISO los (tri-state) als hun CS hoog
  is. Er is géén aparte "in-bus" nodig; input- en outputkaarten delen dezelfde
  drie lijnen.
- **LDAC als buslijn**: alle DAC-kaarten laden hun registers, één LDAC-puls
  zet alle CV-uitgangen tegelijk om (sample-synchroon over kaarten heen).
- **I2C (3V3)** voor traag spul: potmeters, encoders, displays.
- **IRQ per slot** (zelfde geografische truc) voor data-ready/encoder-events.

## Slot-pinout (2×10, 2.54 mm — J1..J6 op busboard)

| Pin | Functie | Pin | Functie |
|----:|---------|----:|---------|
|  1  | GND     |  2  | +12V    |
|  3  | GND     |  4  | −12V    |
|  5  | GND     |  6  | +3V3    |
|  7  | SCLK    |  8  | GND     |
|  9  | MOSI    | 10  | GND     |
| 11  | MISO    | 12  | GND     |
| 13  | **CS** (geografisch) | 14 | GND |
| 15  | LDAC    | 16  | **IRQ** (geografisch) |
| 17  | SDA     | 18  | SCL     |
| 19  | SPARE1 (= CONVST) | 20  | SPARE2  |

SPARE1 is gereserveerd als **CONVST**: busbrede "sample nu"-strobe voor
ADC-kaarten — het spiegelbeeld van LDAC. Alle DAC's updaten synchroon op
LDAC, alle ADC's samplen synchroon op CONVST. SPARE2 is gereserveerd als
**ADC_RESET** (AD7606 wil een resetpuls na power-up; firmware-gestuurd,
busbreed, 100k pulldown op elke ADC-kaart).

Connector op busboard: **PinSocket 2×10** (female); op de kaart: male pin
header 2×10 aan de onderrand. Mechanisch aanvullen met M3-afstandsbus of
kaartgeleider.

## Hub-headers (2×5 IDC — J7..J8, compatibel met AD5754-breakout J1)

| Pin | Functie | Pin | Functie |
|----:|---------|----:|---------|
| 1 | GND  | 2  | SYNC (= CS7/CS8) |
| 3 | SDO (MISO) | 4 | SDIN (MOSI) |
| 5 | SCLK | 6  | GND  |
| 7 | +3V3 | 8  | GND  |
| 9 | −12V | 10 | +12V |

## Teensy 4.1 pintoewijzing

| Functie | Teensy-pin | | Functie | Teensy-pin |
|---|---|---|---|---|
| SCLK (SPI0 SCK) | 13 | | CS1..CS6 (slots) | 10, 9, 8, 7, 6, 5 |
| MOSI (SPI0) | 11 | | CS7..CS8 (hubs) | 4, 3 |
| MISO (SPI0) | 12 | | LDAC | 2 |
| SDA (Wire) | 18 | | IRQ1..IRQ6 | 28, 29, 30, 31, 32, 33 |
| SCL (Wire) | 19 | | SPARE1, SPARE2 | 40, 41 |

## Voeding

- Bus draagt **+12V, −12V, GND** (Eurorack, 10-pens entry: 1-2 = −12V met
  rode streep, 3-8 = GND, 9-10 = +12V) plus **+3V3** voor logica.
- **+3V3 komt van een eigen regelaar op het busboard** (R-78E5.0 buck
  12→5 V, daarna LDO 5→3.3 V) — níet van de Teensy-regulator (te weinig
  reserve) en níet parallel daaraan (twee regelaars op één net = verboden).
- Teensy VIN hangt aan de +5V-rail. **Let op**: als USB tegelijk met
  busvoeding gebruikt wordt, de VUSB/VIN-brug op de Teensy doorsnijden
  (standaard PJRC-advies) of een diode plaatsen.
- Elke kaart ontkoppelt lokaal (100 nF per IC + 10 µF per rail).

## Designregels (bus-integriteit)

1. Backplane ≤ 20 cm, GND-vlak onder de buslijnen, GND naast elke snelle lijn.
2. 33 Ω serieweerstand in SCLK en MOSI **bij de Teensy** (zit op busboard).
3. SPI-klok: start op 2–4 MHz; pas opvoeren als alles werkt. (8×16-bit CV op
   1 kHz ≈ 1,5 Mbit/s — snelheid is geen bottleneck.)
4. Eén SPI-transactie per CS; SPI-mode mag per kaart verschillen
   (`SPISettings` per device in firmware). AD5754 = mode 1 (via SYNC↑),
   74HC(T)595 = mode 0 (latch op CS↑).
5. Kaarten die MISO niet gebruiken laten pin 11 onaangesloten (nooit hard aan
   GND/3V3 knopen).
6. Hot-pluggen van kaarten: niet doen (geen buffered backplane in v1).

## Geplande kaarten

| Kaart | Interface | Kernonderdelen | Status |
|---|---|---|---|
| 4× CV out (breakout) | SPI via hub | AD5754BREZ + ADR421 | **klaar**: `Images/schematics/ad5754r-breakout/` (sch + geroute PCB) |
| 8× gate out | SPI (write-only) | 74HCT595 @ +5V (lokale 78L05/AMS1117-5.0), 1 k serie-uit | **klaar**: `Images/schematics/musicbrain-gate8/` (sch + geroute PCB); latch = CS↑, mode 0 |
| 8× ADC in | SPI + IRQ + CONVST | **AD7606** (16-bit, 8-ch, simultaan, ±10V direct, 1 MΩ) | **sch klaar, PCB geplaatst**: `Images/schematics/musicbrain-adc8/`; CS→CS, BUSY→IRQ, CONVST→SPARE1, RESET→SPARE2 (+100k pulldown), RANGE via JP1 (3V3=±10V / GND=±5V), OS0-2=GND, seriële mode (DOUTA→MISO, DB's→GND), VDRIVE=3V3, AVCC=5V lokaal, interne 2.5V-referentie; J2-contract identiek aan GATE8 (1=GND, 2-9=kanaal, 10=GND) |
| 8× CV out (2× AD5754) | SPI + LDAC | 2× AD5754 + ADR421 | ontwerp volgt (zelfde recept als breakout) |
| 8× pot | SPI | MCP3208 (12-bit, 8-ch, tri-state MISO) | gewone buskaart met geografische CS; gepland |
| 8× encoder/knop | I2C + IRQ | MCP23017 | interrupt-gedreven; encoders zijn groter → 8 als het past, anders 4; gepland |
| 8× gate **in** | SPI (read-only) | 74HC165 + 74HC125-buffer (¼, CS-gated, voor tri-state MISO) + per kanaal 100k serie / 100k pulldown / BAT54S-clamp naar 3V3 | latch op CS↓, dan 8 bits klokken; gepland |
| jack8-printje | passief | 8× Thonkiconn (PJ398SM) + male 1×10 | prikt op J2 van GATE8/ADC8 (contract: 1=GND, 2-9=kanaal, 10=GND); gepland |
| jack4-printje | passief | 4× Thonkiconn + male 1×5 | prikt op J2 van AD5754-breakout (1=GND, 2-5=A-D); gepland |

## Display

Twee sporen, allebei voorzien op het busboard (v1.1):

1. **I2C (traag, klein)**: SSD1306/SH1106-OLED direct op de bus-I2C. Aanrader:
   een **Qwiic/StemmaQT-connector** (JST-SH 4-pens: GND, 3V3, SDA, SCL) op het
   busboard — de-facto standaard, honderden modules pluggen direct in.
2. **SPI (snel, groot TFT)**: níet op de CV-bus (displayframes blokkeren het
   CV-verkeer), maar op een **eigen SPI-poort van de Teensy** (SPI1: pin 26 =
   MOSI1, 27 = SCK1 — nu ongebruikt). Dedicated 2×5 display-header: 3V3, 5V
   (backlight), GND, SCK1, MOSI1, D/C, CS, RST. Nic's teensy-eurorack doet
   het ook zo (aparte TFT_SCK/TFT_MOSI/TFT_DC/TFT_CS-lijnen).

De AD7606-keuze scheelt een compleet opamp-frontend per kanaal: ±10V mag
rechtstreeks de chip in (interne clamps, 1 MΩ). Serieel uitlezen: na CONVST↓↑
gaat BUSY hoog (~4 µs), op BUSY↓ (IRQ) 8×16 bit klokken via MISO.

## Delegated modules (2e Teensy / FPGA's)

Besluit 2026-07-08:
- **FPGA-kaarten mogen op de hoofdbus**: een FPGA is een gedisciplineerde
  SPI-slave (snel, deterministisch, tri-state MISO). Voorwaarde: korte
  transacties (≤ ~10 µs), anders blokkeren ze de CV-timing.
- **Teensy-delegates (bijv. 5×Elements) NIET op de SPI-bus**: Teensy als
  SPI-slave is onbetrouwbaar/vertragend. Besturing loopt per delegate over
  een **eigen UART-link** (point-to-point, DMA-vriendelijk, tot 6 Mbaud).
  De hoofd-Teensy heeft 6 vrije Serial-poorten: Serial1 (0/1), Serial3
  (14/15), Serial4 (16/17), Serial5 (20/21), Serial6 (24/25), Serial8 (34/35).
- **Audio van delegates** gaat níet over SPI of UART maar via I2S/TDM naar
  het audiosysteem van de hoofd-Teensy, of analoog (som/mixer).

## Vrije Teensy-pinnen → EXP-header (busboard v1.1)

Gebruikt: 2–13, 18, 19, 28–33, 40, 41. **Vrij: 0, 1, 14–17, 20–27, 34–39**
(20 stuks, incl. SPI1 op 26/27/1/0, zes UART's en analoge ingangen A0–A3).
Busboard v1.1 krijgt een EXP-header (2×13) die deze pinnen + 3V3/GND
uitvoert voor experimenten met insteekkabeltjes.

## Mechanica-standaard kaarten (besluit 2026-07-08, Alt-3-review)

1. **Busconnector = haakse (horizontal) male 2×10** aan de onderrand van de
   kaart, pennen wijzen langs het kaartvlak naar beneden het slot in.
   (v1.0 van GATE8/ADC8 heeft nog rechte headers — wordt v1.1.)
2. **Frontconnector = haakse female** aan de frontrand (de rand haaks op de
   busrand, aan de paneelzijde), hart op **44 mm boven de busrand** — zodat
   alle jack-printjes op alle kaarten passen.
3. **Jack-printjes** dragen een rechte female socket op de *achterzijde*
   en prikken parallel aan het paneel op de frontconnector. TN-normalling
   via soldeerjumper (dicht = inputs, open = outputs!).
4. **Silkscreen-link**: `musicbrain.nl/hw/<bord>` + rev. Kort, drukbaar en
   stabiel: het domein redirect naar de actuele documentatie (GitHub-pad
   kan wijzigen; een redirect is één regel). Richt op musicbrain.nl een
   redirect in per bord.
5. Kaartdiepte mag per kaart verschillen; wie een steunrail over de
   kaartenrij wil, standaardiseert op 80 mm (ADC8-maat).

## Mechanica

- **Busboard v1.1**: 4–6 × M3-montagegat (Ø3,2, 5 mm van de rand).
- **Slotkaarten**: 2 × M3-gat in de bovenhoeken; optioneel een gemeen-
  schappelijke steunrail/afstandsbussen over de kaartenrij.
- **Jack-printjes = frontpaneeldragers**: de Thonkiconn-bussen steken door
  het paneel en de moeren klemmen paneel + printje samen — het paneel
  draagt dus het printje (standaard Eurorack-DIY-constructie). Haakse
  female header naar de kaart. Maat: 3U-hoogte; jack8 ≈ 1 kolom van 8 op
  ~14 mm steek, jack4 half zo hoog of zelfde paneel half gevuld.

## Open punten (v2-kandidaten)

- Aux-header op busboard voor ongebruikte Teensy-pins (audio, USB-host, SD).
- +5V ook naar de slots (nu alleen intern voor Teensy/LDO; gates gebruiken
  eigen 5V? → beslissen bij gate-kaartontwerp: optie is SPARE1 herbestemmen).
- Gebufferde bus (74LVC244/245 per segment) als er >6 kaarten of langere
  backplane nodig blijkt.
- Teensy-footprint op busboard-PCB (socket 2×24) — symbool bestaat al in het
  KiCad-schema; footprint volgt bij de PCB-stap.
