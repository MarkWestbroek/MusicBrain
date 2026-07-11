# KiCad-generators (GUI-loze workflow)

De borden in `Images/schematics/` zijn machine-gegenereerd met deze Python-
generators (v8-sexpr) en machine-geverifieerd met `kicad-cli` 10.0:

    generate -> `sch erc --severity-error` -> netlijst + pad-voor-pad netcheck
    -> `pcb drc --severity-error --refill-zones` tot 0/0

Kern:
- `cardlib.py` — Board-klasse: footprint-loader (leest systeem-.kicad_mod's,
  stript v10-tokens, injecteert netten, draait pad-hoeken mee bij rotatie),
  pad-absolute posities in `board.P[ref][pad]`, `netcheck()`, zone-emitter.
- `schlib.py` — Sch-klasse + herbruikbare symbolen (box_symbol, conn_symbol,
  R/C/pot/power).
- `gen_<bord>*.py` — één generator per bord. De busboard heeft aparte
  sch/pcb-generators (label-gebaseerd, eigen router).
- `make_fab.sh` — gerbers + Excellon + CPL + JLCPCB-BOM voor alle borden.

Status busboard-v2: `gen_bus2_sch.py` af (ERC 0); `gen_bus2_pcb.py` moet nog
— zie doc/busboard-v2-plan.md §PCB-aanpak voor het floorplan en de al
genomen deelbeslissingen.

Historie: deze bestanden leefden eerst in sessie-scratchpads (zie de
handover-docs); vanaf 2026-07-11 is deze map de bron.
