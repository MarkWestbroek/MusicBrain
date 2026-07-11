# MusicBrain GATE8 — 8× gate-uitgang (slotkaart)

**Status**: v1.1 — schema ERC-schoon; PCB volledig geroute (DRC 0 fouten,
0 unconnected). **Spec**: `doc/spi-bus-spec.md`. Bord: 35 mm breed ×
**80 mm hoog** (de standaard-kaarthoogte H, zodat één vlakke bovenplaat
alle kaarten dekt), 2 lagen.

## Wat het is

De simpelste kaart van de familie: 8 digitale gate/trigger-uitgangen (0–5V)
uit één **74HCT595 schuifregister**. Geen microcontroller nodig — SPI *is*
een schuifregisterprotocol, dus de 595 is zelf de ontvanger:

| 595-pin | Buslijn | Werking |
|---|---|---|
| SER (14) | MOSI | databits schuiven binnen |
| SRCLK (11) | SCLK | klok per bit |
| RCLK (12) | CS (slotpin 13) | **stijgende flank van CS** kopieert alle 8 bits tegelijk naar de uitgangen |
| ~OE (13) | GND | uitgangen altijd actief |
| ~SRCLR (10) | +5V | nooit hardware-clear |

Firmware: `SPI.beginTransaction(mode 0)` → CS laag → `SPI.transfer(bits)` →
CS hoog → alle acht gates staan er glitch-vrij en gelijktijdig op.
Bit 0 = QA = GATE1 … bit 7 = QH = GATE8.

## Ontwerpkeuzes

- **HCT-variant op 5V**: TTL-drempels, dus de 3,3V-bussignalen zijn ruim
  voldoende, terwijl de uitgangen echte 0–5V gates leveren (Eurorack-drempel
  ~1–2V). De 5V komt lokaal van een AMS1117-5.0 uit de +12V-rail.
- **1 kΩ serie per uitgang**: kortsluit-/kabelbescherming.
- Buspinnen MISO, LDAC, I2C, IRQ, SPARE's en −12V zijn bewust niet
  aangesloten (write-only kaart).
- SPI-mode 0 (de AD5754 gebruikt mode 1 — de Teensy wisselt per transactie
  via `SPISettings`, zie spec regel 4).

## Aansluitingen

- **J1** (haakse male 2×10, onderrand): het bus-slotcontract uit de spec.
  Pennen steken 6 mm onder de kaartrand uit, het slot-socket in.
- **J2** (haakse male 1×10, bovenrand): 1 = GND, 2–9 = GATE1..8, 10 = GND.
  Zelfde contract als de ADC8-kaart → één jack8-printje past op beide.
  J2 staat **recht boven het midden van J1** (spec-standaard), zodat de
  jack-strips van alle kaarten op de bovenplaat uitlijnen.

## PCB-notities (v1.1)

Signaalstroom van onder naar boven: J1 (bus) → 74HCT595 → weerstandsrij →
J2 (paneel). De Q-uitgangen verlaten de chip via een via-kolom en lopen als
L-paden over B.Cu (oost, dan noord) naar hun weerstand — exits en doelen
staan in dezelfde volgorde, dus dat is kruisingsvrij; QA komt van de
oostkolom en loopt bovenlangs om de "Q-wal" heen. SCLK en CS hebben elk
één B.Cu-hop om de aanvoer vanaf J1 te ontvlechten. De AMS1117 met C1–C3
zit in de zuidoosthoek; +5V loopt via één B.Cu-run (y=157,5) naar VCC,
~SRCLR en de condensatoren. GND via vlakken op beide lagen + stitching-via's.

## Uitbreidingsideeën (v2)

- LED + weerstand per gate (visuele feedback).
- TPIC6B595 i.p.v. HCT595 voor 10V-gates of zwaardere belasting.
- Tweede 595 in ketting (QH' → SER) voor 16 gates met dezelfde CS.
