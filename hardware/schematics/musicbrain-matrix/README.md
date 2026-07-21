# MusicBrain MATRIX — 8-stemmige audio-patchmatrix

**Praktisch:** de analoge patchkast van de poly-synth. 8 IN-bussen × 16
OUT-bussen, elk 8 stemmen breed — een patch is een druk op de knop, opgeslagen
en teruggeroepen door de Brain. Per stem schakelbaar: 8 stemmen zijn ook te
splitsen in 2×4 met eigen routing. OUT-bus 16 is gereserveerd als meetbus naar
de adc8, zodat de Brain niveaus en gains automatisch kan ijken.

**Status**: rev 0.2 — ERC 0, netlijst pad-voor-pad geverifieerd, DRC 0/0,
4-laags. Bord **175 × 142 mm**. Er is ook een center-variant (rev 0.3c,
`musicbrain-matrix-c`) met 34% kortere audiobanen — één van de twee bestellen.

## Wat het is

8× MT8816 (8×16 analoge crosspoint-switch, DIP-40 in een socket), chip k =
stem k van alle bussen. Elk audionet is 2-punts: headerpin k+1 ↔ één pad van
chip k — de chips delen alleen besturing en voeding. Adres/data/strobe/reset
zijn gedeeld (broadcast); **CS is per chip**, gedreven door een 74HC238
(3-naar-8 decoder). Alleen de chip met CS hoog latcht op STROBE — zo krijgt
elke chip zijn eigen, routing-geoptimaliseerde pin→bus-toewijzing én kan de
firmware per stem onafhankelijk schakelen.

## Besturing

Twee 74AHCT595's aan de buskabel-SPI (RCLK = CS-flank) leveren AX0-3, AY0-2,
DATA, STROBE, RESET en de 3-bits groepsselectie + enable voor de 74HC238.
Firmware-adres: `<groep:3><y:3><x:4>` (10 bits); groep g → chip U(g+1) =
stem g+1. De per-chip AX/AY→bus-mappingtabel staat in de docstring van
`gen_matrix.py` en in `doc/plans/analog-patch-matrix.md` — elke chip anders,
en per plaatsingsvariant anders.

## Voeding en audio

L7806 (+6 V, VDD) en L7906 (−6 V, VEE) uit de ±12V-bus; 78L05 voor de logica.
Audio ±5 V nominaal (MT8816-totaal ≤ 13,2 V). Geen buffers in v0.x: bronnen
zijn opamp-uitgangen, bestemmingen ≥10 kΩ, Ron ≈ 45 Ω is daarop
verwaarloosbaar. Crosstalk wordt op rev 0.x gemeten vóór er buffers komen.

## Aansluitingen

Jack8-contract per bus: 1×10-header, pin 1 = GND, pins 2-9 = stem 1-8,
pin 10 = GND. 8 IN-headers (JIN1-8) en 16 OUT-headers (JOUT1-16); buskabel
op J1 (PinSocket 2×12, slotcontract — GND/±12V/SPI gebruikt).

## Plaatsing (rev 0.2 "tussenkanaal")

2 groepen van 4 chips, gespiegeld om de centrale control-strook. Per zijde
staat de binnenste OUT-headerkolom in het kanaal tussen de twee chipkolommen,
zodat elke chip aan beide zijden een headerkolom naast zich heeft. De
pin→bus-toewijzing per chip wordt door de generator optimaal berekend
(Hungarian, minimale draadlengte) — gemiddelde audiobaan 90 mm.
