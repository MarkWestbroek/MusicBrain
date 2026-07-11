# MusicBrain-borden — status & bestellingen

Actuele stand per bord. **Bestelbaar** = ERC 0 + netcheck OK + DRC 0/0 +
fab-pakket (`<bord>/fab/…-gerbers.zip` + BOM/CPL in JLC-formaat) ververst.
Vul zelf *aantal besteld* en *besteldatum* in bij het bestellen.

| Module | Versie | Status | Opmerkingen | Aantal besteld | Besteldatum |
|---|---|---|---|---|---|
| ad5754r-breakout | 1.0 | bestelbaar | 4× CV-uit breakout (AD5754 + ADR421) | | |
| musicbrain-adc8 | 1.2 | bestelbaar | recht-toe-bedrading; fw-spiegel zit in `MbAdc8` | | |
| musicbrain-dac8 | 1.0 | bestelbaar | silk-URL verplaatst 2026-07-11 (koper gelijk) | | |
| musicbrain-gate8 | 1.1 | bestelbaar | | | |
| musicbrain-gatein8 | 1.0 | bestelbaar | silk-URL verplaatst 2026-07-11 (koper gelijk) | | |
| musicbrain-jack8 | 1.2 | bestelbaar | socket op front-koppel-standaard (x16,5 / pin1 43,57) | | |
| musicbrain-jack4 | 1.2 | bestelbaar | idem; alleen nodig voor kabel-breakout | | |
| musicbrain-riser | 1.0 | bestelbaar | generieke slot-verlenger (prototyping/toekomstige fronts) | | |
| musicbrain-pot8front | 1.1 | bestelbaar | ⚠️ SHAFT_OFFSET (4,5 aanname) aan fysieke pot meten vóór paneel-fab | | |
| musicbrain-potriser | 1.0 | bestelbaar | MCP3208-riser onder pot8front; pin-1-passing checken | | |
| musicbrain-enc5front | 2.0 | bestelbaar | 30 mm breed, uiterst links/rechts; ⚠️ QFN-pinout checken vóór assemblage | | |
| musicbrain-i2criser | 1.0 | bestelbaar | domme I²C-riser onder enc5front | | |
| musicbrain-busboard-v2 | 2.0 | in aanbouw | schema af (ERC 0); PCB-koper nog niet klaar — NIET bestellen | | |
| ~~musicbrain-busboard~~ | 1.1 | deprecated | vervangen door v2 (16×CS/12×IRQ + expansie) — in `deprecated/` | | |
| ~~musicbrain-enc4~~ | 1.0 | deprecated | vervangen door enc5front + i2criser — in `deprecated/` | | |
| ~~musicbrain-pot8~~ | 1.0 | deprecated | vervangen door pot8front + potriser — in `deprecated/` | | |

## Samenhang (wat heb je samen nodig)

- **CV in**: adc8 (slot) + jack8 (front)
- **CV uit**: dac8 (slot) + ad5754r-breakout óf direct + jack8 (front)
- **Gates uit/in**: gate8 / gatein8 (slot) + jack8 (front)
- **Potten**: potriser (slot) + pot8front (front)
- **Encoders/knoppen**: i2criser (slot) + enc5front (front, uiterst links/rechts)
- **Alles**: busboard (v2, zodra af) + Teensy 4.1

Silk-URL's zijn cosmetisch: dac8/gatein8-zips van vóór 2026-07-11 zijn
elektrisch identiek; alleen opnieuw downloaden als je de nette silk wilt.
