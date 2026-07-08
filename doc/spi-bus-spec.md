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
| 8× gate out | SPI (write-only) | 74HCT595 @ +5V (lokale 78L05/AMS1117-5.0), 1 k serie-uit | **klaar (v1.1)**: `Images/schematics/musicbrain-gate8/` — 35×80 mm, haakse connectoren, volledig geroute; latch = CS↑, mode 0 |
| 8× ADC in | SPI + IRQ + CONVST | **AD7606** (16-bit, 8-ch, simultaan, ±10V direct, 1 MΩ) | **klaar (v1.1)**: `Images/schematics/musicbrain-adc8/` — 40×80 mm, haakse connectoren, volledig geroute; CS→CS, BUSY→IRQ, CONVST→SPARE1, RESET→SPARE2 (+100k pulldown), RANGE via JP1 (3V3=±10V / GND=±5V), OS0-2=GND, seriële mode (DOUTA→MISO, DB's→GND), VDRIVE=3V3, AVCC=5V lokaal, interne 2.5V-referentie; J2-contract identiek aan GATE8 (1=GND, 2-9=kanaal, 10=GND) |
| 8× CV out ("DAC8", 2× AD5754) | SPI + LDAC | 2× AD5754 (daisy-chain, 1 CS) + ADR421 | **klaar**: `Images/schematics/musicbrain-dac8/` — 50×80 mm, volledig geroute; LDAC = buslijn, offset binary, J2-contract identiek |
| 8× pot | SPI | MCP3208 + **RK097N** (9 mm, haaks) | **klaar**: `Images/schematics/musicbrain-pot8/` — 110×80 mm, potten op 13,5 mm steek met de assen door de bovenplaat; alleen +3V3; volledig geroute |
| 4× encoder/knop | I2C + IRQ | MCP23017 (0x20) + **Bourns PEC12R** haaks (met drukknop) | **klaar**: `Images/schematics/musicbrain-enc4/` — 70×80 mm, 4 encoders op 16,7 mm steek (beugels begrenzen; 8 paste niet), INT→IRQ; volledig geroute |
| 8× gate **in** | SPI (read-only) | 74HC165 + 74LVC1G125 (CS-gated tri-state MISO) + per kanaal 100k serie / 100k pulldown / BAT54S-clamp | **klaar**: `Images/schematics/musicbrain-gatein8/` — 40×80 mm; ~PL-latchpuls uit CS↓ via 220p/10k (fw wacht ≥5 µs); volledig geroute |
| jack8-printje | passief | 8× Thonkiconn (PJ398SM) + female socket onderzijde | **klaar**: `Images/schematics/musicbrain-jack8/` — prikt op J2 van GATE8/ADC8 (contract: 1=GND, 2-9=kanaal, 10=GND) |
| jack4-printje | passief | 4× Thonkiconn + female socket onderzijde | **klaar**: `Images/schematics/musicbrain-jack4/` — voor de oude AD5754-breakout via kabel (1=GND, 2-5=A-D) |

## Display

Twee sporen, beide **gerealiseerd op busboard v1.1**:

1. **I2C (traag, klein)** — **J12 "QWIIC"** (1×4, 2,54 mm): GND, 3V3, SDA,
   SCL — de Qwiic/StemmaQT-pinvolgorde. Soldeer er een JST-SH-pigtail of
   los 4-pins kabeltje aan; SSD1306/SH1106-OLED's en alle Qwiic-modules
   werken direct (pull-ups 2k2 zitten al op de bus).
2. **SPI (snel, groot TFT)** — **J11 "DISPLAY"** (1×9) op eigen SPI1, níet
   op de CV-bus (displayframes zouden het CV-verkeer blokkeren). Pinvolgorde
   = de standaard ILI9341-module (dupontkabel 1-op-1): 1 VCC(3V3), 2 GND,
   3 CS (Teensy 0), 4 RESET (25), 5 DC (24), 6 SDI/MOSI1 (26), 7 SCK1 (27),
   8 LED (3V3), 9 SDO (nc — readback ongebruikt). Nic's teensy-eurorack
   doet het ook zo (aparte TFT-lijnen).

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
  Beschikbare Serial-poorten: Serial3 (14/15), Serial4 (16/17), Serial5
  (20/21) — alle drie op de EXP-header — plus Serial8 (34/35, vrije pads).
  Serial1 (0/1) en Serial6 (24/25) zijn in v1.1 aan het display vergeven
  (CS/DC/RST); pin 1 is nog vrij.
- **Audio van delegates** gaat níet over SPI of UART maar via I2S/TDM naar
  het audiosysteem van de hoofd-Teensy, of analoog (som/mixer).

## Vrije Teensy-pinnen → EXP-header (busboard v1.1, gerealiseerd)

Bus gebruikt 2–13, 18, 19, 28–33, 40, 41; display (J11) gebruikt 0, 24–27.
**J10 "EXP"** (2×7) voert de acht overige DIP-pinnen uit + voeding:

| pad | net | pad | net |
|---|---|---|---|
| 1 | +3V3 | 2 | GND |
| 3 | +5V | 4 | GND |
| 5 | D15 | 6 | D14 |
| 7 | D17 | 8 | D16 |
| 9 | D21 | 10 | D20 |
| 11 | GND | 12 | D22 |
| 13 | D23 | 14 | GND |

D14–D17/D20–D23 zijn analoog-capabel (A0/A1/A6/A7/A3…) en dragen Serial3/4/5.
Daarnaast blijven **pin 1 (MISO1) en pins 34–39** (o.a. Serial8) vrij op de
Teensy zelf.

## Mechanica-standaard kaarten (besluit 2026-07-08/09, Alt-3-review)

**Assenstelsel** (definitief): **L** (lengte) = lange as van het busboard,
de richting waarin de kaarten naast elkaar staan (slotsteek 20 mm).
**B** (breedte) = diepte van het busboard; de slots en de kaartvlakken
lopen in deze richting. **H** (hoogte) = hoe hoog een kaart boven het
busboard uitsteekt.

Model: busboard ligt plat (L x B), kaarten staan verticaal, en boven alle
kaarten komt **een vlakke bovenplaat** waar jacks, potmeters en encoders
doorheen steken.

1. **H = 80 mm voor alle kaarten** - dit maakt de gedeelde bovenplaat
   mogelijk. (ADC8 is al 80; GATE8 groeit in v1.1 van 60 naar 80.)
2. **Busconnector = haakse (horizontal) male 2x10** aan de onderrand,
   pennen langs het kaartvlak omlaag het slot in.
   (v1.0 van GATE8/ADC8 heeft nog rechte headers - wordt v1.1.)
3. **Paneelconnector = haakse male** aan de **bovenrand** (tegenover de
   busrand), pennen langs het kaartvlak omhoog; hart **recht boven het
   midden van de slot-pinrij** - zodat alle jack-printjes op alle kaarten
   passen en de strips op de bovenplaat netjes uitlijnen.
4. **Jack-printjes** liggen horizontaal (parallel aan de bovenplaat),
   dragen een **rechte female socket aan de onderzijde**, header in het
   **midden van de strip**; de strip loopt in de B-richting en mag voor en
   achter de kaart uitsteken (de bovenplaat draagt de jacks via de
   Thonkiconn-moeren). TN-normalling via soldeerjumper (dicht = inputs,
   open = outputs!).

   Vuistregel: **per koppeling precies een haakse connector, altijd aan de
   kaartzijde (male)**; busboard-slots en jack-printjes hebben rechte
   female sockets. Elke kaart draagt dus twee haakse males (onder + boven).
5. **Silkscreen-link**: `musicbrain.nl/hw/<bord>` + rev. Kort, drukbaar en
   stabiel: het domein redirect naar de actuele documentatie. Richt op
   musicbrain.nl een redirect in per bord.

## Mechanica: dragen en geleiden

Hoe een kaart vastzit (drie niveaus, van onder naar boven):

1. **Het slot zelf**: de female 2×10-socket klemt de haakse pennen — dat
   geeft prima elektrisch contact en houdt de kaart op zijn plek, maar
   biedt weinig zijdelingse stijfheid (de kaart kan wiebelen).
2. **De bovenplaat**: elke kaart steekt zijn haakse paneelconnector in de
   female socket van een jack-strip, en die strip hangt met de
   Thonkiconn-moeren aan de bovenplaat. Zodra de plaat er op zit, is elke
   kaart dus **boven én onder vastgepakt** — dit is de primaire fixatie.
3. **Standoffs**: het busboard heeft 5× M3 (Ø3,2): drie aan de noordrand,
   twee aan de zuidrand — daarmee staat het geheel op afstandsbussen in
   een kast; de bovenplaat krijgt eigen standoffs naar het busboard op
   dezelfde gaten (lange bussen door alles heen, of aparte kolommen).

Aparte printgeleiders (rails zoals in 19"-racks) zijn daarmee **niet
nodig**; wie extra stijfheid wil bij zware kaarten (potmeterkaart) kan een
steunlat over de kaartenrij leggen die in de bovenhoeken van de kaarten
grijpt (kaart-v1.2: 2× M3-gat in de bovenhoeken reserveren).

## Open punten (v2-kandidaten)

- +5V ook naar de slots (nu alleen intern voor Teensy/LDO; gates gebruiken
  eigen 5V? → beslissen bij gate-kaartontwerp: optie is SPARE1 herbestemmen).
- Gebufferde bus (74LVC244/245 per segment) als er >6 kaarten of langere
  backplane nodig blijkt.
- Encoderkeuze voor het encoderbord: op specs kiezen — advies **Bourns
  PEC11R** (12 mm, 24 det., drukknop) of het 9 mm-zusje PEC09: degelijk,
  overal leverbaar, met datasheet; alternatief Alps EC11. Sluit aan op
  MCP23017 met 10k pull-ups + 100n ontdender per fase.
