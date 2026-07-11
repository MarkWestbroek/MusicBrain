# MusicBrain POT8-FRONT — dom front, 8× RK097N verticaal

**Status**: rev 1.1 — ERC 0, netlijst pad-voor-pad geverifieerd, DRC 0/0. Bord 20×110 mm, 2 lagen.
**Model**: route 2 (2026-07-11): plat front-bord aan het paneel; elektronica zit
op de riser/kaart eronder. Dit bord is puur passief.

**v1.1 (2026-07-11)**: 3D-model van de socket staat nu óp de gatenrij
(canonieke geflipte footprint-vorm); silk-URL naar bordmidden (viel over de
rand); PCB-papier A3. Koper identiek aan v1.0.

## Geometrie (de front-standaard)

- **As-hartlijn = 8,0 mm van de westrand** — zelfde lijn als de Thonkiconns op
  jack8/jack4, zodat het paneel overal hetzelfde ritme heeft.
- 8× RK097N (9 mm, verticaal, M7-bus + moer) op **13,75 mm steek** (110/8).
- **J1 = 1×10 female socket op de ACHTERZIJDE** in de ooststrook (x 16,5),
  gecentreerd op halve bordhoogte. Contract: **1 = GND, 2..9 = W1..W8, 10 = +3V3**.
- Beugelsleuven zijn koperloos (NPTH): het front hangt aan de M7-moeren.

## ⚠️ Vóór paneel-fab: SHAFT_OFFSET meten

De footprint ankert op het **as-hart**; de pinnenrij ligt op `SHAFT_OFFSET` =
**4,5 mm** (aanname uit de datasheettekening: 6,5 − 2,0). **Meet dit aan een
fysieke pot** (afstand hart pinnenrij → hart as). Wijkt het af: pas
`SHAFT_OFFSET` in `hardware/kicad-generators/gen_pot8front.py` aan en
regenereer — de as-hartlijn (8,0) blijft dan kloppen.

## Elektrisch

Pin 3 (CW-eind) → +3V3, pin 1 (CCW) → GND, pin 2 (loper) → W-k: rechtsom
draaien = hogere spanning = hogere ADC-waarde. De MCP3208 zit op de pot-riser
(of gebruik de bestaande `musicbrain-pot8`-kaart als drager); 100 nF-reservoirs
per loper zitten dáár, niet op dit front.
