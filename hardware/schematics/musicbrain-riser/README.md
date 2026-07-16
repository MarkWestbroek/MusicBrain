# MusicBrain RISER — generieke slot-verlenger

**Status**: rev 2.0 — ERC 0, netlijst pad-voor-pad geverifieerd, DRC 0/0.
**Spec**: `doc/spi-bus-spec.md` v2.0. Bord **40 × 45 mm** (H=45), 2 lagen.

## Gen 2 (rev 2.0, 2026-07-16)

- Slot **2×12** (was 2×10): draagt nu de **volledige** gen-2-bus omhoog,
  inclusief de audio-lijnen (MCLK/BCLK/LRCLK/I2SD) — dit is het
  ontwikkelbord voor een gedelegeerde Teensy-/FPGA-kaart.
- H 80 → 45; bord 40 breed (2×12 spant 27,94).
- Paneelheader-inzet gecorrigeerd (volle 6 mm paarpin; vondst Mark).

De schakelingbeschrijving hieronder is ongewijzigd; waar de lopende
tekst nog gen-1-maten of 2×10 noemt, geldt bovenstaande. Overzicht en
pinouts hieronder zijn gen-2-gegenereerd.

## Wat het is

Een dun verticaal printje dat **de volledige 2×10-bus van een busboard-slot
1-op-1 omhoog draagt** naar een horizontaal *front-bord* op paneelhoogte. Zo
kunnen de bediening-front-borden (POT8, ENC, …) plat aan de bovenplaat/​het
paneel liggen terwijl de elektronica (chip) op het front-bord zit.

- **J1** (haakse male 2×10, onderrand): in het busboard-slot — de standaard
  slotpinout (zie spec).
- **J2** (haakse male 2×10, bovenrand): naar het front-bord — draagt **alle**
  buslijnen mee (power + SPI + CS + LDAC + I2C + IRQ + SPARE).

Eén riser past onder **elk** front-bord dat de volledige 2×10-bus wil zien.
Let op (stand 2026-07-11): de twee bestaande front-sporen gebruiken inmiddels
**eigen smalle risers** — het pot-spoor de `musicbrain-potriser` (MCP3208 op
de riser, 1×10 naar het front) en het enc-spoor de `musicbrain-i2criser`
(domme I2C-doorlus, 1×10 naar het front). De generieke riser blijft nuttig
als slot-verlenger voor prototyping en voor toekomstige fronts die meer
buslijnen nodig hebben.

## Front-koppel-pinout (J2)

J2 (rot 90) spiegelt J1 (rot 270) in x, dus de nets zijn via **x-matching**
toegekend zodat alle doorverbindingen **recht** lopen (oneven rij op F.Cu recht,
even rij op F.Cu met 1,27 mm offset; GND via het vlak — geen via's, geen
kruisingen). Het front-bord moet dus J2's **fysieke** pinout volgen (niet de
slot-nummering): J2-pin *q* draagt de bus-functie van slot-pin (20−q) [oneven]
of (22−q) [even]. De front-generatoren gebruiken diezelfde afbeelding, dus dat
komt vanzelf goed.

## Mechanisch

Bus onder, front boven; hoogte H = 80 mm (gelijk aan de signaalkaarten, zodat
alle front-borden coplanair zijn). Dun in de slot-steek-richting (PCB-dikte),
past ruim binnen de 20 mm slotafstand.

## Aansluitoverzicht

![aansluitoverzicht](musicbrain-riser-overzicht.svg)

### Pinouts

Bovenaanzicht van het bord (kijkend op de pinnen); pin 1 = vierkant. Gegenereerd uit het bordbestand met `hardware/kicad-generators/pinout_svg.py`.

![J1](pinouts/J1.svg)
![J2](pinouts/J2.svg)
