# VCF8-kern — overdracht Windows-desktop → Mac-laptop (2026-07-24)

Mark werkt de komende weken op de **Mac-laptop** verder i.p.v. de Windows-
desktop. Deze commit draagt de VCF8-kern-routeersessie over. Lees eerst
**`doc/plans/vcf8kern-handover.md`** (volledige stand + het genummerde
restklusje) en **`hardware/kicad-generators/WERKWIJZE.md` §"Dichte borden:
de vcf8kern-lessen"** (het routeer-recept + alle valkuilen). Dit document
voegt alléén de **machine-specifieke** dingen toe.

## Waar het bord staat (samenvatting)

`musicbrain-vcf8kern` is volledig gerouteerd: ERC 0, netcheck OK en een verse
volledige generatorrun gevolgd door KiCad DRC geeft **0 violations +
0 unconnected** (2026-07-31). De laatste routes zijn als definitieve
`b.T(...)`/`b.V(...)`-handroutes in `gen_vcf8kern.py` opgenomen; er is geen
pcbnew-GUI-handwerk meer nodig om het resultaat te reproduceren.

## Reproduceren vanaf de generator (Mac)

De board-bestanden staan in git, maar het bord is óók volledig reproduceer-
baar uit de generator + drie ingecommite invoerbestanden:

- `hardware/schematics/musicbrain-vcf8kern/musicbrain-vcf8kern.ses`
  (freerouting-uitvoer, wordt door `seslib.apply_ses` ingebakken)
- `.../gnd_stitch.json` (GND-hechtvia's, door `gnd_stitch.py`/`gnd_bridge.py`)
- `.../gnd_orphans.json` (cumulatieve wees-pad-lijst voor `force_gnd_via`)

`python gen_vcf8kern.py` leest die drie en produceert het `.kicad_pcb`
identiek. **Zonder** deze drie zou je freerouting + de hele afmaakketen
opnieuw moeten draaien (uren). Ze zijn dus generator-INVOER, geen wegwerp-
tussenstap — vandaar meegecommit.

## Mac-toolpaden (t.o.v. de Windows-werkwijze)

De WERKWIJZE.md-commando's noemen Windows-paden. Mac-equivalenten:

| Ding | Windows (huidige WERKWIJZE) | Mac |
|---|---|---|
| `kicad-cli` | op PATH | op PATH na KiCad-install, of `/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli` |
| pcbnew-python | `"C:/Program Files/KiCad/10.0/bin/python.exe"` + `PYTHONPATH .../bin/Lib/site-packages` | `/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/bin/python3`; pcbnew zit in het KiCad-app-bundel (`.../site-packages`) — `import pcbnew` werkt met die python zonder PYTHONPATH-getruc |
| Docker-mount | `MSYS_NO_PATHCONV=1 docker run ... -v "D:/…:/work"` | gewoon `docker run ... -v "$PWD:/work"` — geen MSYS-prefix nodig |
| freerouting-jar | `C:/Users/User/.kicad-mcp/freerouting-2.2.4.jar` | jar meenemen/opnieuw downloaden (freerouting v2.2.4 release); mount z'n map als `/jar`. **Java 25 nodig** (`eclipse-temurin:25-jre`) |
| scratchpad | Windows temp | eigen sessie-scratchpad |

De meeste Python in `hardware/kicad-generators/` draait ongewijzigd op Mac.
De twee oorspronkelijke Windows-ismen in het footprint-laadpad zijn op
2026-07-31 platformonafhankelijk gemaakt:

1. **`FP_DIR`** in `cardlib.py` kiest per platform de KiCad-footprintmap.
2. **Backslash-separators** worden door `cardlib.fp()` genormaliseerd en het
  pad wordt met `os.path.join` opgebouwd.

## Wat NIET meegecommit is (bewust)

- `drc-gate*.rpt` / `drc-fin*.json` — 49 werk-tussenrapporten, regenereerbaar
  met één `kicad-cli pcb drc`-commando. Verwijderd om de commit schoon te
  houden.
- `hardware/tools/proto dev board/*.jpg` — ~20 MB foto's van 23-07, los van
  deze taak; laat Mark zelf beslissen of die de repo in moeten.
- `publish_board.py` / `publish_release.py` / `publish_software.py` +
  een chat-export-`.md` — Marks eigen losse WIP van 23-07, **niet** door
  deze sessie aangeraakt; staan nog als lokale wijziging op de Windows-
  desktop (dus die reizen NIET mee tenzij Mark ze apart commit vóór vertrek).

## Wanneer je klaar bent (DRC 0/0)

De hand-fixes staan inmiddels in `gen_vcf8kern.py`. Draai vanuit
`hardware/kicad-generators/` eerst `python3 gen_vcf8kern.py` en daarna
`kicad-cli pcb drc --severity-error --exit-code-violations --refill-zones`;
de gevalideerde uitkomst is 0/0. Vervolgens `bash make_fab.sh
"musicbrain-vcf8kern"` (doet 4-laags automatisch). Rot-check alle SMD in de
JLC-preview (nieuwe placement, dubbelzijdig!) vóór PCBA; AD5754 pas op een
gevalideerd board (Route B).
