# Fabricage — MusicBrain-borden

Per bord staat een `fab/`-map met een compleet productiepakket. Gegenereerd
met `kicad-cli` 10.0 uit de gecommitte `.kicad_pcb` / `.kicad_sch` (zones
opnieuw gevuld bij export). Regenereren: `kicad-generators/make_fab.sh`
(zie [Regenereren](#regenereren)).

## Inhoud van elke `fab/`-map

| Bestand | Waarvoor |
|---|---|
| `<bord>-gerbers.zip` | **upload dit** bij de PCB-fab (gerbers + Excellon-drill, PTH/NPTH apart, met drill-maps) |
| `gerbers/` | dezelfde bestanden los (voor inzien/CAM-check) |
| `<bord>-bom.csv` | stuklijst in JLCPCB-kolomvolgorde: Comment, Designator, Footprint, Qty, LCSC Part # |
| `<bord>-cpl.csv` | plaatsingsbestand (Ref, Val, Package, PosX, PosY, Rot, Side) in mm |

Alle borden zijn **2-laags, 1,6 mm**, standaard instellingen (min. spoor
0,25 mm / via 0,5 mm-0,3 mm) — valt binnen elk goedkoop-PCB-proces.

## BOM: LCSC-kolom (auto-gevuld door de parts-library)

De `LCSC Part #`-kolom wordt **automatisch gevuld** door
`kicad-generators/jlc_fix.py` uit een gedeelde parts-library
(`LCSC_PASSIVE` + `LCSC_DEVICE`). Zo hoeft de BOM bij het uploaden niet meer
handmatig gematcht te worden, en voorkom je JLCPCB's tekst-gok die anders
gevaarlijke false matches oplevert — echt gebeurd: comment `RANGE` → een
NPN-transistor, `DISPLAY` → een LCD-module, `100n` → 4,7 µF.

Regels van de library:

- **SMD → krijgt een LCSC-nummer** (JLCPCB plaatst het): 0805-R/C, SOIC/
  TSSOP/SOT-223/SOT-23-IC's, diodes, enz.
- **Handwerk → blijft leeg** (leeg = "unmatched"/DNP bij JLCPCB): pin-
  headers/sockets/IDC, solder-jumpers, Thonkiconn-jacks, RK097N-potmeters,
  encoders, elco's (`CP_Elec`), en THT-delen (RECOM R-78E5.0, H11L1 DIP-6,
  Teensy 4.1).
- Passieven matchen op **comment én footprint** — bv. `10u` op `C_0805` =
  ceramic → nummer, maar `10u` op `CP_Elec` = elco → blijft leeg.
- Een adres-suffix in de comment (bv. `MCP23017-E/ML (0x20)`) wordt genegeerd.
- Staat er een expliciet `LCSC`-veld op het schema-symbool, dan wint dat.

### Nieuw onderdeel toevoegen

Eén regel in `LCSC_PASSIVE` (passief, key = waarde) of `LCSC_DEVICE`
(actief, key = comment) in `jlc_fix.py`, met een **geverifieerd** C-nummer —
check package én voorraad in de JLCPCB-zoekbalk vóór je 'm vastlegt. Kies bij
voorkeur ruime voorraad; reel-suffixen (`-REEL7`, TI `…M96`) zijn dezelfde
die en vaak beter leverbaar dan de tube-variant.

### Regenereren

Draai **`kicad-generators/make_fab.sh`** — die exporteert de BOM vers uit
KiCad (lege LCSC-kolom) en laat `jlc_fix.py` 'm daarna vullen.

> **Let op:** een kále `python jlc_fix.py` op een *al-gevulde* CSV laat
> bestaande waarden staan (de "expliciet-wint"-regel). Library-wijzigingen
> pik je dus alleen op via een **verse export** (make_fab.sh), niet door
> jlc_fix nog eens over een bestaande BOM te draaien.

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
