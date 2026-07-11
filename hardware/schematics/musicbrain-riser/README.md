# MusicBrain RISER — generieke slot-verlenger

**Status**: schema ERC-schoon + netlist geverifieerd; PCB DRC 0/0.
**Spec**: `doc/spi-bus-spec.md`. Bord: ~31 mm × 80 mm (H-standaard), 2 lagen.

## Wat het is

Een dun verticaal printje dat **de volledige 2×10-bus van een busboard-slot
1-op-1 omhoog draagt** naar een horizontaal *front-bord* op paneelhoogte. Zo
kunnen de bediening-front-borden (POT8, ENC, …) plat aan de bovenplaat/​het
paneel liggen terwijl de elektronica (chip) op het front-bord zit.

- **J1** (haakse male 2×10, onderrand): in het busboard-slot — de standaard
  slotpinout (zie spec).
- **J2** (haakse male 2×10, bovenrand): naar het front-bord — draagt **alle**
  buslijnen mee (power + SPI + CS + LDAC + I2C + IRQ + SPARE).

Eén riser past onder **elk** front-bord: POT8 gebruikt de SPI-lijnen
(MCP3208), ENC de I2C-lijnen (MCP23017), enz. Ongebruikte lijnen liggen stil —
precies zoals een gewone kaart niet alle buslijnen gebruikt.

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
