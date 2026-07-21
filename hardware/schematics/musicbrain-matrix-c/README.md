# MusicBrain MATRIX-C — 8-stemmige audio-patchmatrix (center-variant)

**Praktisch:** identiek aan `musicbrain-matrix` (zelfde schema, BOM en
firmware-model), maar met de "gedistribueerd midden"-plaatsing: alle
headers tussen de chips in plaats van aan de randen. Resultaat: **34%
kortere audiobanen** (gemiddeld 59 mm i.p.v. 90; langste net 154 mm i.p.v.
230) op een kleiner bord. Eén van de twee varianten bestellen.

**Status**: rev 0.3c — ERC 0, netlijst pad-voor-pad geverifieerd, DRC 0/0,
4-laags. Bord **154 × 133 mm**.

## Wat het is

Zie `musicbrain-matrix`: 8× MT8816 in sockets (chip k = stem k), per-chip CS
via 74HC238, 2× 74AHCT595 aan de buskabel-SPI, firmware-adres
`<groep:3><y:3><x:4>`, jack8-contract per bus, OUT-bus 16 = meetbus.

**Let op:** de per-chip AX/AY→bus-mappingtabel verschilt van de
edge-variant — beide tabellen staan in `doc/plans/analog-patch-matrix.md`
(en in de uitvoer van `gen_matrix.py center`).

## Plaatsing (rev 0.3c "gedistribueerd midden")

4 chipkolommen × 2 rijen. De 16 OUT-headers staan in de verticale kanalen
tussen de kolommen (4-8-4, midden dubbel); de 8 IN-headers liggen in twee
horizontale rijen in de middengap; logica en buskabel op de weststrook.
Elke chip raakt zo elke header binnen ~2 kolombreedtes — de
rechthoek-vriendelijke benadering van een circulaire opstelling (een echte
cirkel is doorgerekend en verliest: lange chips duwen zichzelf van het
midden weg).
