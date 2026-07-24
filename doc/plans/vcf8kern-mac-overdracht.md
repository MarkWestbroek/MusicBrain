# VCF8-kern — overdracht Windows-desktop → Mac-laptop (2026-07-24)

Mark werkt de komende weken op de **Mac-laptop** verder i.p.v. de Windows-
desktop. Deze commit draagt de VCF8-kern-routeersessie over. Lees eerst
**`doc/plans/vcf8kern-handover.md`** (volledige stand + het genummerde
restklusje) en **`hardware/kicad-generators/WERKWIJZE.md` §"Dichte borden:
de vcf8kern-lessen"** (het routeer-recept + alle valkuilen). Dit document
voegt alléén de **machine-specifieke** dingen toe.

## Waar het bord staat (samenvatting)

`musicbrain-vcf8kern` is **99 % geroute**: ERC 0, netcheck OK, alle signalen
+ voedingen liggen erin. Laatste DRC-stand: **1 violation + 9 unconnected**
(6 daarvan GND-zone-eilandjes). Het **restklusje** (±20–30 min, exacte
coördinaten in `vcf8kern-handover.md` §RESTKLUSJE) is het laatste stapje
naar DRC 0/0, en is **handwerk in de pcbnew-GUI** — niet nóg een
generator-iteratie (dat is bewust afgekapt; zie WERKWIJZE §5 "rip-cascades"
en de weld-fixpoint-val).

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

De meeste Python in `hardware/kicad-generators/` draait ongewijzigd op Mac,
maar er zitten **twee Windows-ismen in het footprint-laadpad** die je eerst
moet fixen, anders faalt elke `b.fp(...)`:

1. **`FP_DIR`** in `cardlib.py` (regel 10) = absoluut Windows-pad
   `C:\Program Files\KiCad\10.0\share\kicad\footprints`. Zet naar de Mac-
   locatie (bv. `/Applications/KiCad/KiCad.app/Contents/SharedSupport/footprints`).
2. **Backslash-separators**: `cardlib.fp()` doet `FP_DIR + '\\' + relpath`
   (regel ~139) en de `FP`-dicts in de generators geven relpaths met `\\`
   (bv. `'Package_SO.pretty\\SSOP-20….kicad_mod'`). Op Mac breekt dat.
   Simpelste fix: in `cardlib.fp()` het pad bouwen met `os.path.join` en
   inkomende `relpath.replace('\\\\', os.sep)` normaliseren — dan hoeven de
   generator-dicts niet aangepast.

Zoek eventueel op de andere borden of `cardlib` al een Mac-tak had; zo niet,
maak `FP_DIR` OS-afhankelijk (`platform.system()`) zodat het bord ook op de
Windows-desktop blijft bouwen als Mark terugkomt.

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

Na het restklusje in de GUI: hand-fixes als `b.T(...)`/`b.V(...)`-regels
terug in `gen_vcf8kern.py` zetten (coördinaten uit het bordbestand) **of**
het bord bevriezen en de generator alleen nog voor documentatie gebruiken —
de generator blijft anders bij de volgende run de handroutes overschrijven.
Dan `kicad-cli pcb drc --severity-error --exit-code-violations
--refill-zones` → 0/0 → `bash make_fab.sh "musicbrain-vcf8kern"` (doet
4-laags automatisch). Rot-check alle SMD in de JLC-preview (nieuwe placement,
dubbelzijdig!) vóór PCBA; AD5754 pas op een gevalideerd board (Route B).
