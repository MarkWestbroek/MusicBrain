# Concepten — schema's zonder PCB

Ideeën die ver genoeg zijn voor een schema, maar (nog) niet voor een print.
Een conceptmap heeft een `.kicad_sch` + `.kicad_pro`, ERC-rapport, PDF en
een README met het idee, de open punten en wat er nog geverifieerd moet
worden. **Geen** `.kicad_pcb`, geen `fab/`, niet in `make_fab.sh`, niet in de
bestelbare tabel van `MODULES.md` (wel in de sectie "Concepten" daar).

Revisienummers eindigen op `c` (bv. `0.1c`). Wordt een concept een echt
bord, dan verhuist het naar `hardware/schematics/musicbrain-<naam>/` met een
gewone revisie en krijgt het de volledige lus (netcheck, DRC, fab).

Generators: `hardware/kicad-generators/gen_<naam>.py`; die draaien zelf ERC
en de PDF-export.

| Concept | Rev | Idee | Plan |
|---|---|---|---|
| [musicbrain-consoleeq](musicbrain-consoleeq/) | 0.1c | analoge 1073-stijl kanaal-EQ, gains via VCA (dCV), frequentiekeuze via muxen; "dom" (DAC + 595, geen MCU) | `doc/plans/analoge-fx-verkenning.md` §1 |
| [musicbrain-compkaart](musicbrain-compkaart/) | 0.1c | hybride compressor: analoog gain-element op een dochterprint, detector (mmb_dsp) op een sub-brain-module | `doc/plans/analoge-fx-verkenning.md` §4 |
