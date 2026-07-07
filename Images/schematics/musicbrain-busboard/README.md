# MusicBrain busboard — Teensy 4.1 backplane

**Status**: schema ERC-schoon; PCB volledig geroute (DRC 0 fouten, 0 unconnected).
**Leidende spec**: `doc/spi-bus-spec.md`. Bestanden: `.kicad_sch` / `.kicad_pcb`, PDF's ernaast.

## Wat het is

De ruggengraat van het systeem: een 200×115 mm backplane met een Teensy 4.1
(op twee 1×24 socketstrips), **6 verticale kaartslots** (2×10 pinsocket) en
**2 hub-headers** (2×5 IDC) waar bestaande breakouts via lintkabel op
aansluiten. Voeding komt binnen als Eurorack ±12V; het bord maakt daar zelf
+5V (R-78E5.0 buck) en +3V3 (AMS1117) van.

## Signaalarchitectuur

| Groep | Lijnen | Teensy-pin | Toelichting |
|---|---|---|---|
| SPI | SCLK / MOSI / MISO | 13 / 11 / 12 | gedeeld door alle slots + hubs; slaves laten MISO los als hun CS hoog is |
| Chip-selects | CS1..CS6 → slot 1..6 | 10, 9, 8, 7, 6, 5 | **directe GPIO's**, één per slot ("geografisch": elke kaart ziet zijn CS op connectorpin 13) |
| | CS7, CS8 → hub 1, 2 | 4, 3 | vast bedraad naar pin 2 (SYNC) van de hub-headers |
| Interrupts | IRQ1..IRQ6 → slot 1..6 | 28..33 | directe GPIO-ingangen, interrupt-capable; kaart meldt "data klaar" op connectorpin 16 |
| Sync-strobes | LDAC | 2 | alle DAC-kaarten updaten hun uitgangen tegelijk op LDAC↓ |
| | SPARE1 (= CONVST) | 40 | alle ADC-kaarten samplen tegelijk (spiegelbeeld van LDAC) |
| | SPARE2 (= ADC_RESET) | 41 | busbrede reset voor AD7606-kaarten; vrij voor andere kaarten |
| I2C | SDA / SCL | 18 / 19 | voor trage kaarten (pots/encoders/OLED); pull-ups 2k2 op het busboard |
| Voeding | +12V / −12V / +3V3 | — | +3V3 komt van de AMS1117, **niet** van de Teensy-regulator |

Signaalintegriteit: **33 Ω serieweerstanden (R1/R2) in SCLK en MOSI**, direct
bij de Teensy — serieterminatie die reflecties op de multidrop-bus dempt.
Start de firmware op 2–4 MHz SPI; opvoeren kan daarna.

## PCB-opbouw (hoe de routing in elkaar zit)

- **B.Cu (onderlaag): 28 horizontale "buslanen"** op y = 68…104,5 mm — van
  boven naar beneden: LDAC, MOSI, MISO, SCLK, SDA, SCL, SPARE1, SPARE2,
  +3V3 (0,5 mm), +12V en −12V (0,8 mm), +5V, dan CS1..CS8 en IRQ1..IRQ6.
  CS/IRQ-lanen lopen alleen zo ver oostwaarts als hun slot — daar zie je de
  "trappetjes" in de PDF.
- **F.Cu (bovenlaag): verticale aftakkingen.** Elk slot heeft rechts een eigen
  kanaal (13 sporen op 1 mm steek) dat de connectorpinnen via een via op de
  juiste laan prikt. De Teensy heeft links zijn eigen fan-out (26 signalen);
  de volgorde van de verticalen is zo gekozen dat niets elkaar kruist.
- **Hubs**: J7 (noord) waaiert naar beneden zijn lanen op, J8 (zuid) naar
  boven; J8 zit bewust onder de lanenbundel — zo blijft alles kruisingsvrij.
- **Voeding**: de ±12V van J9 steekt op F.Cu tussen de Teensy-padrijen door
  ("mid-rij-oversteek") naar de +12V/−12V-lanen; de +5V loopt als aparte laan
  van Teensy-VIN en de R-78E naar de ontkoppelrij (C1–C8, onderrand).
- **GND**: geen sporen — massieve vlakken op beide lagen (solid connect),
  15 stitching-via's.

## Aandachtspunten

- **Teensy VIN hangt aan de +5V-rail.** Wil je USB en busvoeding tegelijk:
  snij de VUSB/VIN-brug op de Teensy door (standaard PJRC-advies).
- De Teensy-footprint is custom (`MusicBrain:Teensy41_THT`): 48 THT-pads,
  0,6" rijafstand, nummering tegen de klok in — pin 1 linksboven bij de USB.
- Slots zijn PinSocket 2×10 (female); kaarten hebben male headers. Let op:
  de socket-footprint spiegelt kolom 2 naar links.
- Hot-pluggen van kaarten: niet doen (ongebufferde bus).
