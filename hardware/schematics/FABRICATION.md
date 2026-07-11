# Fabricage — MusicBrain-borden

Per bord staat een `fab/`-map met een compleet productiepakket. Gegenereerd
met `kicad-cli` 10.0 uit de gecommitte `.kicad_pcb` / `.kicad_sch` (zones
opnieuw gevuld bij export). Regenereren: `scratchpad/make_fab.sh`.

## Inhoud van elke `fab/`-map

| Bestand | Waarvoor |
|---|---|
| `<bord>-gerbers.zip` | **upload dit** bij de PCB-fab (gerbers + Excellon-drill, PTH/NPTH apart, met drill-maps) |
| `gerbers/` | dezelfde bestanden los (voor inzien/CAM-check) |
| `<bord>-bom.csv` | stuklijst in JLCPCB-kolomvolgorde: Comment, Designator, Footprint, Qty, LCSC Part # |
| `<bord>-cpl.csv` | plaatsingsbestand (Ref, Val, Package, PosX, PosY, Rot, Side) in mm |

Alle borden zijn **2-laags, 1,6 mm**, standaard instellingen (min. spoor
0,25 mm / via 0,5 mm-0,3 mm) — valt binnen elk goedkoop-PCB-proces.

## BOM: LCSC-kolom nog invullen

De `LCSC Part #`-kolom is leeg — vul die met de artikelnummers die je wilt
laten plaatsen. Wat je waar bestelt:

- **SMD, laat plaatsen** (JLCPCB-assembly zinvol): 0805-R/C, SOIC/TSSOP/
  SOT-223-IC's (74HCT595, MCP3208, MCP23017, AD7606, AD5754, ADR421,
  AMS1117), SOT-23 (BAT54S, 74LVC1G125).
- **THT, zelf solderen** (niet door de assembly-service): de haakse
  pin-headers/sockets, Thonkiconn-jacks, **RK097N-potmeters**,
  **PEC12R-encoders**, de **RECOM R-78E5.0** en de **Teensy 4.1** (via
  sockets). Zet die desnoods op "Do Not Populate" in de assembly-stap.

## Rotatie-let-op (assembly)

Het CPL-bestand gebruikt de KiCad-rotatieconventie. JLCPCB hanteert voor
sommige packages (SOT-23, SOT-223, elco's, TSSOP) een eigen 0°-referentie —
controleer bij het uploaden de preview en corrigeer per part als er iets
90°/180° verdraaid staat. Dit raakt alleen geplaatste SMD-delen.

## Custom footprints

`MusicBrain:RK097N_Horizontal`, `MusicBrain:Teensy41_THT` en de haakse
headers zijn hand-plaatsdelen; hun exacte pad-stack staat in de
`.kicad_pcb`. Controleer bij de eerste bestelling de boormaten in de
drill-map tegen de fysieke onderdelen.
