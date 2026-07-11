# MusicBrain POT-RISER — MCP3208-riser voor het POT8-FRONT

**Status**: ERC 0, netlijst pad-voor-pad geverifieerd, DRC 0/0. Bord 28×80 mm, 2 lagen.
**Model**: route 2 — het domme POT8-FRONT ligt plat aan het paneel; deze smalle
riser staat eronder in het busboard-slot en draagt de elektronica.

## Connectoren

- **J1** (haakse male 2×10, onderrand): het busboard-slot in. Gebruikt alleen
  GND / +3V3 / SCLK / MOSI / MISO / CS; de rest (±12V, LDAC, IRQ, I2C, SPARE)
  is onaangesloten.
- **J2** (haakse male 1×10, bovenrand): het POT8-FRONT in.
  **Contract: 1 = GND, 2..9 = W1..W8 (lopers), 10 = +3V3.**
  ⚠️ Pin-1-oriëntatie t.o.v. de front-socket bij de eerste passing verifiëren
  (front-socket zit op de achterzijde); klopt de volgorde niet, dan de
  J2-map in `gen_potriser.py` spiegelen en regenereren.

## Elektrisch

- MCP3208 (SOIC-16), SPI mode 0, ratiometrisch (VREF = VDD = +3V3).
- CH0..CH7 = W1..W8 = paneel boven→onder.
- 100 nF-laadreservoir per loper (C1–C8) direct achter J2, 100 nF ontkoppeling (C9).
- Firmware: bestaande `MbPot8`-driver werkt ongewijzigd (zelfde chip + mapping).

## Waarom dit bord

De pot8-slotkaart (110×80, met haakse pots erop) is geen drager voor het
front-model: pots zitten in de weg, geen frontconnector en onnodig breed
(besluit 2026-07-11). Deze riser vervangt hem in het pot-spoor; de pot8-kaart
blijft bruikbaar als losstaand alternatief zonder front.
