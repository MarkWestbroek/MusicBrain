# KiCad-generators (GUI-loze workflow)

> **Nieuw hier (of parallelle chat)? Lees eerst [`WERKWIJZE.md`](WERKWIJZE.md)**
> — het volledige recept incl. freerouting-pijplijn, GND-vlakken, placement-
> lessen, JLCPCB-checklist en alle valkuilen.

De borden in `hardware/schematics/` zijn machine-gegenereerd met deze Python-
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

## Publiceren naar de Imprint-site (board-docs)

De site in `../../../imprint-engine/` heeft een write-API waar de
borddocumentatie naartoe gaat (het protocol staat in
`imprint-engine/docs/mmb-ingest-guide.md`). Je stuurt niets met de hand: er zijn
twee scripts, die je allebei gewoon vanuit deze map in de terminal draait.

Voor één enkel bord is er `publish_board.py`. Dat rendert de top-view vers uit
het `.kicad_pcb` met `kicad-cli`, leest de connectors rechtstreeks uit het bord
en de pinouts uit `pinouts/`, en post het component plus de board-spec. Het
vraagt dus wel Python (`requests` + `Pillow`) en een geïnstalleerde `kicad-cli`:

    python publish_board.py <bord.kicad_pcb> --component <slug> --version <vX.Y>

Voor een hele productlijn in één keer is er `publish_product.mjs`. Dat loopt de
volledige keten af — per bord het component en de board-spec (met render-,
overzicht- en pinout-assets), daarna het product eraan koppelen, en tot slot een
release die het product aan de gepubliceerde componentversies verbindt. Het
koppelen gebeurt read-modify-post, zodat de bestaande productteksten blijven
staan, en de hele run is idempotent én referentie-veilig: opnieuw draaien maakt
alleen nieuwe bitemporale versies, en de volgorde (component → board-spec →
product → release) is precies wat de API afdwingt.

Het script draait op kale Node (≥ 20) — geen kicad-cli of Python nodig, want het
hergebruikt de al gegenereerde assets. Per bord leest het `<bord>-widget.json`
(de hotspots plus de pin-tabellen, waaruit het de connectors afleidt),
`<bord>-overzicht.svg` en de losse `pinouts/<ref>.svg`. De render-PNG zoekt het
eerst repo-lokaal (`<bord>/<bord>.png`) en anders in de map achter `--assets-dir`
(default: de `public/boards/` van Imprint). De component-slug is de mapnaam
zonder `musicbrain-`-prefix, en de versie en naam komen uit de widget-titel
(`… rev X.Y`).

Een typische sessie: eerst een dry-run om de payloads te zien, dan echt posten.

    # token uit de Imprint-deployomgeving (of je lokale .env)
    export INGEST_TOKEN=…   IMPRINT_BASE=http://localhost:3000

    # controleren zonder te posten
    node publish_product.mjs --product cortex --dry

    # de hele modulaire cortex-set + een release. Zonder --boards pakt het
    # de default-set: alle hardware/schematics/musicbrain-* (excl. deprecated)
    # plus ad5754r-breakout.
    node publish_product.mjs --product cortex --release modular-mb@v0.2 --date 2026-07-11

    # een andere lijn met een expliciete boardset, bv. de guitar-switcher:
    node publish_product.mjs --product reflex \
      --boards gswitch-brain,gswitch-loop8 --release guitar-switcher@v0.1

`--boards` neemt de mapnamen zoals ze in `hardware/schematics/` staan (dus mét
`gswitch-`- of `musicbrain-`-prefix); alleen de afgeleide component-slug laat de
`musicbrain-`-prefix vallen. Laat je `--release` weg, dan koppelt het de borden
wel aan het product maar post het geen release; laat je `--product` weg, dan
post het alleen de componenten en board-specs.

> Let op: de versie komt uit de widget-titel. Wijkt die af van
> [`../schematics/MODULES.md`](../schematics/MODULES.md) — ad5754r-breakout zegt
> bijvoorbeeld "rev 2.0" in de widget maar 1.0 in MODULES — dan wint de widget.
> Check dus even dat de titels kloppen vóór een echte publicatie.

Status busboard-v2: `gen_bus2_sch.py` af (ERC 0); `gen_bus2_pcb.py` moet nog
— zie doc/busboard-v2-plan.md §PCB-aanpak voor het floorplan en de al
genomen deelbeslissingen.

Historie: deze bestanden leefden eerst in sessie-scratchpads (zie de
handover-docs); vanaf 2026-07-11 is deze map de bron.
