# MusicBrain-borden — status & bestellingen

Actuele stand per bord. **Bestelbaar** = ERC 0 + netcheck OK + DRC 0/0 +
fab-pakket (`<bord>/fab/…-gerbers.zip` + BOM/CPL in JLC-formaat) ververst.
Vul zelf *aantal besteld* en *besteldatum* in bij het bestellen.

| Module | Versie | Status | Opmerkingen | Todo (rot/fab) | Aantal besteld | Prijs | Besteldatum |
|---|---|---|---|---|---|---|---|
| ad5754r-breakout | 1.0 | bestelbaar | 4× CV-uit breakout (AD5754 + ADR421) | rot checken vóór PCBA: AD5754 (HTSSOP), ADR421 (SOIC-8) | | | |
| musicbrain-adc8 | 1.2 | bestelbaar | recht-toe-bedrading; fw-spiegel zit in `MbAdc8` | rot checken: AD7606 (LQFP-64, niet gekalibreerd) | 5 | 110 | |
| musicbrain-dac8 | 1.0 | bestelbaar | silk-URL verplaatst 2026-07-11 (koper gelijk) | rot checken: AD5754 (HTSSOP), ADR421 (SOIC-8, ander chip) | 5 (2 pcbc) | 160 | |
| musicbrain-gate8 | 1.1 | bestelbaar | | rot checken: 74HCT595 (SOIC-16, ander chip dan ijking) | 20 | 31 | |
| musicbrain-gatein8 | 1.0 | bestelbaar | silk-URL verplaatst 2026-07-11 (koper gelijk) | rot ✅ (matcht busboard-ijking) | 30 | 40 | |
| musicbrain-jack8 | 1.2 | bestelbaar | socket op front-koppel-standaard (x16,5 / pin1 43,57) | — (PCB-only) | 30 | 10 | |
| musicbrain-jack4 | 1.2 | bestelbaar | idem; alleen nodig voor kabel-breakout | — (PCB-only) | 30 | 7,50 | |
| musicbrain-riser | 1.0 | bestelbaar | generieke slot-verlenger (prototyping/toekomstige fronts) | — (PCB-only) | 30 | 10 | |
| musicbrain-pot8front | 1.1 | bestelbaar | ⚠️ SHAFT_OFFSET (4,5 aanname) aan fysieke pot meten vóór paneel-fab | — (geen SMD) | 30 | 10 | |
| musicbrain-potriser | 1.0 | bestelbaar | MCP3208-riser onder pot8front; pin-1-passing checken | rot checken: MCP3208 (SOIC-16, ander chip) | 10 | 46 | |
| musicbrain-enc5front | 2.0 | bestelbaar | 30 mm breed, uiterst links/rechts; ⚠️ QFN-pinout checken vóór assemblage | 3D-model J1/J2 nudge (render, cosmetisch); rot QFN ✅ | 10 | 53 | |
| musicbrain-i2criser | 1.0 | bestelbaar | domme I²C-riser onder enc5front | — (PCB-only) | 30 | 10 | |
| musicbrain-busboard-v2 | 2.0 | bestelbaar | DRC 0/0 2026-07-11 avond; 16×CS/12×IRQ + expansie/MIDI/CAN/codec/TUNE | rot ✅ (SMD gecorr., THT raw); connectoren J1-9/J21 + oriëntatie afronden | | | |
| ~~musicbrain-busboard~~ | 1.1 | deprecated | vervangen door v2 (16×CS/12×IRQ + expansie) — in `deprecated/` | — | | | |
| ~~musicbrain-enc4~~ | 1.0 | deprecated | vervangen door enc5front + i2criser — in `deprecated/` | — | | | |
| ~~musicbrain-pot8~~ | 1.0 | deprecated | vervangen door pot8front + potriser — in `deprecated/` | — | | | |

> **Todo-kolom:** *"rot checken"* = dat SMD-part in de JLCPCB Component-Placements-preview verifiëren (ander chip/package dan de busboard-ijking in `ROT_FIX`). Klopt niet → graden aan mij doorgeven → ik pas `ROT_FIX` aan → jij draait `make_fab.sh "<bord>"` opnieuw. Zie [FABRICATION.md](FABRICATION.md#rotatie-correctie).

## Samenhang (wat heb je samen nodig)

- **CV in**: adc8 (slot) + jack8 (front)
- **CV uit**: dac8 (slot) + ad5754r-breakout óf direct + jack8 (front)
- **Gates uit/in**: gate8 / gatein8 (slot) + jack8 (front)
- **Potten**: potriser (slot) + pot8front (front)
- **Encoders/knoppen**: i2criser (slot) + enc5front (front, uiterst links/rechts)
- **Alles**: busboard (v2, zodra af) + Teensy 4.1

Silk-URL's zijn cosmetisch: dac8/gatein8-zips van vóór 2026-07-11 zijn
elektrisch identiek; alleen opnieuw downloaden als je de nette silk wilt.

## Guitar Effect Switcher (apart project — spec: doc/guitar-switcher-spec.md)

| Module | Versie | Status | Opmerkingen | Aantal besteld | Prijs | Besteldatum |
|---|---|---|---|---|---|---|
| gswitch-loop8 | 0.1 | geroute (ERC 0/netcheck/DRC 0/0) | 8× relaisloop; vóór fab: jack-doorpiep + LCSC-match — NIET bestellen | | | |
| gswitch-brain | 0.1 | geroute (ERC 0/netcheck/DRC 0/0) | ESP32-S3-WROOM-1U, 100×70; vóór fab: LCSC-match + fab-pakket — NIET bestellen | | | |
