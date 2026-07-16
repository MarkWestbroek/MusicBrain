# MusicBrain-borden — status & bestellingen

Actuele stand per bord. **Bestelbaar** = ERC 0 + netcheck OK + DRC 0/0 +
fab-pakket (`<bord>/fab/…-gerbers.zip` + BOM/CPL in JLC-formaat) ververst.
Vul zelf *aantal besteld* en *besteldatum* in bij het bestellen.

| Module | Versie | Status | Opmerkingen | Todo (rot/fab) | Aantal besteld | Prijs | Besteldatum |
|---|---|---|---|---|---|---|---|
| ad5754r-breakout | 1.0 | bestelbaar (gen 1: hub-kabel, geen slot) | 4× CV-uit breakout (AD5754 + ADR421) | rot checken vóór PCBA: AD5754 (HTSSOP), ADR421 (SOIC-8) | | | |
| musicbrain-adc8 | 2.0 | bestelbaar | gen 2: 65×45, slot 2×12, RESET lokaal (RC), CONVST=pin 19; fw-spiegel `MbAdc8` | rot checken: AD7606 (LQFP-64) | | | |
| musicbrain-dac8 | 2.0 | bestelbaar | gen 2: 60×45, slot 2×12; daisy/LDAC/J2-contract gelijk | rot checken: AD5754 (HTSSOP), ADR421 (SOIC-8) | | | |
| musicbrain-gate8 | 2.0 | bestelbaar | gen 2: 55×45, slot 2×12; bitvolgorde gelijk | rot checken: 74HCT595 (SOIC-16) | | | |
| musicbrain-gatein8 | 2.0 | bestelbaar | gen 2: 50×45, slot 2×12; D_OF_IN-contract gelijk | rot ✅ | | | |
| musicbrain-jack8 | 2.0 | bestelbaar | gen 2: 20×110 (past tussen de rails), 8 @13,75, socket gecentreerd | — (PCB-only) | | | |
| musicbrain-jack4 | 2.0 | bestelbaar | gen 2: 20×60, 4 @13,75; kabel-breakout hub-DAC | — (PCB-only) | | | |
| musicbrain-riser | 2.0 | bestelbaar | gen 2: 40×45, 2×12 vólledige bus incl. audio (dev-bord delegates) | — (PCB-only) | | | |
| musicbrain-pot8front | 1.1 | bestelbaar | ⚠️ SHAFT_OFFSET (4,5 aanname) aan fysieke pot meten vóór paneel-fab | — (geen SMD) | 30 | 10 | |
| musicbrain-potriser | 2.0 | bestelbaar | gen 2: 40×45, slot 2×12; pin-1-passing checken | rot checken: MCP3208 (SOIC-16) | | | |
| musicbrain-enc5front | 2.0 | bestelbaar | 30 mm breed, uiterst links/rechts; ⚠️ QFN-pinout checken vóór assemblage | 3D-model J1/J2 nudge (render, cosmetisch); rot QFN ✅ | 10 | 53 | |
| musicbrain-i2criser | 2.0 | bestelbaar | gen 2: 40×45, slot 2×12 | — (PCB-only) | | | |
| musicbrain-busboard | 3.0 | bestelbaar | gen 2: 203,2×128,5 (40 HP), slots 2×12 gecentreerd, audio + J24-hub, MIDI 2×2, USB-host, 1A-regelaar | rot checken (nieuwe placement); connectoren + oriëntatie nalopen | | | |
| ~~musicbrain-busboard-v2~~ | 2.0 | vervangen | gen-1-stand bevroren in `musicbrain-busboard-v2/rel-v0.2/`; nooit besteld | — | | | |
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
- **Alles**: busboard (rev 3.0, gen 2) + Teensy 4.1

**Gen 2 (2026-07-16)**: systeembrede renovatie — slots 2×12 met audio-lijnen,
H=45, 4 HP-steek, slots gecentreerd. Gen-1-zips in oude JLC-mandjes NIET meer
bestellen; alle fab-pakketten zijn ververst. Gen-1-stand per bord bevroren in
`<bord>/rel-v0.2/` (tag `hw/v0.2`).

## Guitar Effect Switcher (apart project — spec: doc/guitar-switcher-spec.md)

| Module | Versie | Status | Opmerkingen | Aantal besteld | Prijs | Besteldatum |
|---|---|---|---|---|---|---|
| gswitch-loop8 | 0.1 | geroute (ERC 0/netcheck/DRC 0/0) | 8× relaisloop; vóór fab: jack-doorpiep + LCSC-match — NIET bestellen | | | |
| gswitch-loop8sh | 0.1 | geroute (ERC 0/netcheck/DRC 0/0) | klem-variant (Sander van Herk), 150×44; geen normalling — lege loop niet activeren; vóór fab: LCSC-match — NIET bestellen | | | |
| gswitch-brain | 0.1 | geroute (ERC 0/netcheck/DRC 0/0) | ESP32-S3-WROOM-1U, 100×70; vóór fab: LCSC-match + fab-pakket — NIET bestellen | | | |
