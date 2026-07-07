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
LDAC, alle ADC's samplen synchroon op CONVST.

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
| 8× ADC in | SPI + IRQ + CONVST | **AD7606** (16-bit, 8-ch, simultaan, ±10V direct, 1 MΩ) | gekozen (naar Nic Newdigate's teensy-eurorack-breakout); CS→CS, BUSY→IRQ, CONVST→SPARE1, RANGE via jumper, VDRIVE=3V3, AVCC=5V lokaal, interne referentie |
| 8× CV out (2× AD5754) | SPI + LDAC | 2× AD5754 + ADR421 | ontwerp volgt (zelfde recept als breakout) |
| 8× pot/encoder | I2C (+IRQ) | MCP23017 / ADS7830 | traag verkeer hoort op I2C |

De AD7606-keuze scheelt een compleet opamp-frontend per kanaal: ±10V mag
rechtstreeks de chip in (interne clamps, 1 MΩ). Serieel uitlezen: na CONVST↓↑
gaat BUSY hoog (~4 µs), op BUSY↓ (IRQ) 8×16 bit klokken via MISO.

## Open punten (v2-kandidaten)

- Aux-header op busboard voor ongebruikte Teensy-pins (audio, USB-host, SD).
- +5V ook naar de slots (nu alleen intern voor Teensy/LDO; gates gebruiken
  eigen 5V? → beslissen bij gate-kaartontwerp: optie is SPARE1 herbestemmen).
- Gebufferde bus (74LVC244/245 per segment) als er >6 kaarten of langere
  backplane nodig blijkt.
- Teensy-footprint op busboard-PCB (socket 2×24) — symbool bestaat al in het
  KiCad-schema; footprint volgt bij de PCB-stap.
