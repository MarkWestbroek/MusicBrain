# KiCad-borden genereren zonder GUI — werkwijze & geleerde lessen

Instructie voor (parallelle) chats die borden ontwerpen in dit repo
(MusicBrain, Effect Switcher, …). Stand: 2026-07-12, na 13 borden waarvan
alle op DRC 0/0. Leidende spec voor de bus: `doc/spi-bus-spec.md`;
bordstatus: `hardware/schematics/MODULES.md`.

## TL;DR — de vaste lus

```
Python-generator (gen_*.py)  →  .kicad_sch + .kicad_pcb + .kicad_pro
  → kicad-cli sch erc --severity-error --exit-code-violations
  → kicad-cli sch export netlist  →  cardlib.netcheck(netlist, pcb)   ← pad-voor-pad!
  → kicad-cli pcb drc --severity-error --exit-code-violations --refill-zones
  → kicad-cli pcb render --side top/bottom   ← visuele check (3D-modellen, silk!)
  → bash make_fab.sh "<bord>"   → fab/<bord>-gerbers.zip + BOM/CPL (JLC-formaat)
```

**Commit-regel**: bordbestanden pas committen bij ERC 0 + netcheck OK + DRC 0/0.
Generators mogen eerder (WIP-koper expliciet benoemen). Nooit `git add -A`.

## Gereedschap: wat waarvoor

| Tool | Waarvoor | Waarvoor NIET |
|---|---|---|
| **Eigen generators** (`cardlib.py`/`schlib.py`/`seslib.py`) | Alles wat het bord IS: placement, netten, footprints, zones, handroutes. Deterministisch, diff-baar, reproduceerbaar. | — |
| **kicad-cli** (10.0, op PATH) | ERC/DRC/netlist/gerbers/PDF én `pcb render` (snelle 3D-png's — dé manier om silk/3D-fouten zelf te zien vóór de gebruiker ze ziet). | — |
| **KiCAD-MCP-server** (`.mcp.json` in de repo-root) | Vrijwel alleen `open_project` + `export_dsn` (Specctra-export voor freerouting). | `import_ses` (pcbnew-hersave breekt netcheck!), `autoroute` (30s client-timeout), bord-edits (de generator is de bron van waarheid). Let op: `open_project` "verrijkt" het .kicad_pro met defaults — die werkkopie-ruis terugdraaien met `git checkout --`. |
| **Freerouting v2.1** (Docker, jar in `C:/Users/User/.kicad-mcp/`) | Signaalkoper voor drukke borden. | GND (gaat via vlakken), voedingssporen breder dan tussen-pad-gaten. |
| **pcbnew-python** (`"C:/Program Files/KiCad/10.0/bin/python.exe"` + PYTHONPATH `.../bin/Lib/site-packages`) | Waarheidsmetingen: cluster-/connectiviteitsanalyse, zone-fill-inspectie, `gnd_stitch.py`/`gnd_bridge.py`. | Bordbestanden schrijven (hersave ≠ generatoruitvoer). |

## De freerouting-pijplijn (het recept)

1. Generator draaien **zonder** SES (placement + netten + evt. seeds + GND-via's).
2. MCP: `open_project` → `export_dsn`.
3. **DSN prepareren** (script-matig, haakjes-balans-parser):
   - `(plane GND …)`-blokken en het `(net GND …)`-blok strippen, GND uit de
     class-lijsten en alle wiring-regels met `(net GND)` weg. *Anders ziet
     freerouting geen routeerruimte of gaat het GND routeren.*
   - **Boundary 0,6 mm inkrimpen** (anders plakt hij tegen de bordrand →
     copper_edge_clearance-fouten).
   - Evt. `(clearance 200)` → `160`: **zet dan óók de Default-netclass op
     0,15 in het .kicad_pro**, anders keurt KiCad de uitkomst af (enc5front).
   - Voedingsnetten in een eigen class: **breedte moet tussen de THT-padgaten
     passen**: 2,54-steek ⇒ gat 0,84 ⇒ max ≈ 0,84 − 2×clearance. 0,35 mm werkt;
     0,5 mm maakt de zaak onrouteerbaar → eindeloze rip-up-stormen (4 uur/53 passes).
4. `MSYS_NO_PATHCONV=1 docker run --rm --name fr-X -v "D:/…/bord:/work" -v
   "C:/Users/User/.kicad-mcp:/jar" eclipse-temurin:21-jre java -jar
   /jar/freerouting.jar -de /work/X.dsn -do /work/X.ses -mp 300 -da`
   (achtergrond; voortgang via `docker logs`).
5. Generator opnieuw: `seslib.apply_ses()` bakt de SES **native** in de
   pcb-uitvoer (skip/only-filters beschikbaar). Daarna netcheck + DRC.

### Freerouting-gedrag (v2.1.0) — belangrijk

- **`-mp` wordt genegeerd**; hij stopt pas bij 0 unrouted + 0 violations, of
  bij "geen vooruitgang". **Vaste conflicten in de input** (bijv. component
  buiten de bordrand — de courtyard-DRC vangt dat níét!) geven eeuwige
  "violations" → hij stopt nooit. Eerst input schoon, dan routen.
- **SIGTERM/docker stop = resultaat weg** (SES wordt alleen bij natuurlijke
  terminatie geschreven). Nooit killen als je de uitkomst wilt.
- **Runs zijn stochastisch** (multithreaded): draai een **best-of-N-lus** en
  beoordeel elke run met een échte connectiviteitsmeting (zie hieronder) —
  freeroutings eigen "N unrouted" wijkt af van wat KiCad ziet.
- **`(type protect)`-seeds**: werkt voor een handvol korte handroutes en voor
  de **hybride narun** (bijna-af bord → alles protected, alleen de missende
  netten hun wiring-regels uit de DSN halen → hij legt alleen die). Grote
  seed-bundels averechts: ze blokkeren zijn eigen corridors.
- Route-uiteinden stoppen soms 0,1–1,3 mm vóór een fijn (QFN-)pad
  (padbenadering verschilt) → `cardlib.snap_stubs()` dicht dat generiek.
- Convergeert hij structureel niet op een handvol netten: **niet blijven
  rerunnen maar het ontwerp aanpassen** — pinvolgorde/GPIO-toewijzing naar de
  geografie (enc5front: U1 noord = E1-E4, U2 zuid = E5+knoppen), blokkerende
  ontkoppel-C's verplaatsen, of het bord breder maken.
- **Protected handroutes kunnen een muur vormen** (gswitch-loop8): een bundel
  parallelle B-lanes + hun verticalen sloot de router volledig op → vast op
  N unrouted vanaf pass 1, eeuwige lus. Oplossing: de drive-netten óók aan
  freerouting geven i.p.v. hand-lanen. En bij gescheiden zones (AGND/GND):
  **keepout over het analoge deel** in de DSN zetten, anders zwerft de router
  door het gestripte-plane-gebied.
- gnd_stitch.py **overschrijft** gnd_stitch.json, gnd_bridge.py **appendt**:
  volgorde = stitch → regen → bridge → regen → stoppen. Niet nogmaals
  stitchen op een bord dat de via's al heeft (json wordt dan leeg).
  gnd_bridge zoekt alleen B-hoofdvlak-onder-F-fragment; het spiegelbeeld
  (F-hoofdvlak boven B-fragment) handmatig met een via/stub oplossen.
- **SES-echo's van handroutes** (gswitch-brain): protected wiring komt terug
  in de SES. Wijzig je daarna een handroute, dan legt `apply_ses` de oude
  echo er alsnog naast → kruisingen met jezelf. Elk volledig hand-geroute
  net **permanent in de skip-set** van `apply_ses` zetten.
- **Auto-skip-voorronde** (gswitch-brain): na het verleggen van hand-lanen
  botsen oude SES-routes van ándere netten met de nieuwe corridors. Vóór
  `apply_ses` de SES parsen (seslib.load_ses), elke corridor als
  laag+bbox beschrijven en elk SES-net dat er met een segment doorheen
  loopt (sample om de 0,4 mm) aan de skiplijst toevoegen — die netten
  routeert de volgende freerouting-ronde opnieuw om de corridors heen.
- **USB-C 16-pins (HRO-M-12)**: DP/DM/VBUS-padparen liggen geïnterleaved op
  0,5 mm steek — dat haalt freerouting nooit. Recept: eigen `usb`-netclass
  (clearance 0,1/spoor 0,15; bordminimum `min_track_width` 0,127 in het
  .kicad_pro), padparen met korte F-bondlusjes koppelen **ná**
  `snap_stubs()` (anders maakt snap er pad-op-pad-shorts van), en let op:
  de VBUS-bondlus omsluit de DP-uitgang — de oostzijde van die lus op B
  leggen (2 vias) zodat DP/DM op F oostwaarts kunnen ontsnappen.

### Waarheidsmeting (niet op DRC-teksten of freerouting vertrouwen)

- `cardlib.netcheck(netlist, pcb)` — pad-voor-pad netten vergelijken (altijd).
- **Cluster-analyse** met pcbnew-python (union-find over pads/sporen/vias per
  net, zones vullen met `ZONE_FILLER`): vertelt exact wélke netten in hoeveel
  stukken liggen. kicad-cli's "unconnected"-teksten husselen netlabels.
- `kicad-cli pcb render` na elke ronde: 3D-modellen op de gatenrij? Silk vrij?

## GND-vlakken

- Twee zones (F+B), `connect_pads yes`, **géén `island_removal_mode 1`**
  (= eilanden BEHOUDEN — twee keer op stukgelopen; weglaten = verwijderen).
- Na het routen fragmenteert het F-vlak. Automatisch dichten:
  1. `gnd_stitch.py <bord.kicad_pcb>` — zoekt per losliggend F-fragment een
     via-plek ≥0,45 mm van vreemd koper → `gnd_stitch.json` (generator leest in).
  2. `gnd_bridge.py <bord.kicad_pcb>` — vindt F+B-fragmentgroepen die wél
     onderling maar niet met het hoofdvlak verbonden zijn en zet een brugvia
     waar het B-hóófdvlak onder het F-fragment ligt.
  3. Herhaal 1×: de vlakvorm verandert door elke via.

## Placement-lessen

- **Courtyards uit de echte bestanden lezen** (fp-bestand of gegenereerd bord),
  niet schatten — twee volle iteratierondes verspild aan gis-courtyards.
- De courtyard-check dekt **niet**: bordrand (copper_edge_clearance apart
  checken!), silk, en 3D-botsingen. Renders maken.
- B-zijde-THT-footprints **canoniek geflipt** emitten: `(at x y 180)` + lokale
  y genegeerd + pad-rot 180 (zoals pcbnew zelf flipt). Koper is anders ook
  goed, maar het 3D-model klapt om het anker → "connector naast de gaten".
- 3D-modellen van lib-connectors op de **B-zijde**: offset (0,0,0) laat het
  model náást de gaten vallen (pads in neg. kwadrant door de canonieke flip,
  model in pos.). **Fix: model-offset `(-W, +0.1)`**, W = kolomspan =
  `2.54*(cols-1)`. X = -kolomspan (centreert loodrecht op de pin-rijen),
  Y = +0.1 (tikkie langs de rij). Zo: J1 1x10 = `(0, +0.1)`, J2 2x8 =
  `(-2.6, +0.1)`. (`rotate 180` schiet door — niet gebruiken.) **As-mapping bij
  handmatig nudgen** (verwarrend door de flip): **Y = links/rechts** (+Y rechts),
  **X = op/neer** (+X weg van de lange rand). Raakt alleen de render, niet de
  fab. Enc5front J1/J2, 2026-07-14.
- Lange borden: `b.paper = "A3"` (cardlib) — 110+ mm valt van A4-landscape af.
- Silk-URL/labels: center-justified! Anker = midden van de tekst. Labels van
  geroteerde headers via een `REF_AT`-tabel boven de body zetten (teksthoek 0
  blijft horizontaal renderen).
- Vaste maten die overal terugkomen: THT 2,54-steek ⇒ padgat-corridor 0,84 mm
  breed (0,25-spoor past met 0,29 marge); front-koppel-standaard socket
  x=16,5 / pin 1 op 43,57 van de bovenrand; hartlijn 8,0 van de westrand.

## Richting JLCPCB

- `bash make_fab.sh "<bord1>,<bord2>"` doet alles: gerbers (`--no-protel-ext
  --check-zones`), excellon + map, CPL (`pos --side both`), BOM via
  `sch export bom` met LCSC-veld, dan `jlc_fix.py` (kolomnamen naar
  JLC-formaat, designator-reeksen uitvouwen, LCSC-matching via de
  parts-library) en de **zip-stap** (zit sinds cc-2026-07-11 in het script).
- Upload: `fab/<bord>-gerbers.zip` + `-bom.csv` + `-cpl.csv`. **JLC "ververst"
  niet**: cart-item verwijderen en de nieuwe zip opnieuw uploaden; check in
  hun gerber-viewer de rev-tekst op de silk.
- Capabilities 2-laags: 0,127/0,127 kan, wij ontwerpen op 0,2/0,2 (of 0,15 —
  dan expliciet als netclass in het .kicad_pro, gedocumenteerd in de README
  van het bord). Via 0,6/0,3 standaard, 0,5/0,3 mag.
- **Parts-database** (`~/.kicad-mcp/data/jlcpcb_parts.db`, sinds 2026-07-12
  gevuld: 616k in-stock parts uit de cdfer-bron): zoeken via MCP
  `search_jlcpcb_parts`. Twee valkuilen: (1) de download-tool loopt tegen de
  30s-MCP-timeout — de 1,6 GB cache-file landt wél, daarna de import zelf
  doen (ATTACH + INSERT…SELECT uit `jlcparts_cache/cdfer.sqlite3` en FTS
  `rebuild`); (2) de FTS-zoekopdracht verslikt zich in **streepjes**: zoek
  "ESP32 S3 WROOM 1U", niet "ESP32-S3-WROOM-1U". (3) FTS is een **AND van alle
  tokens, exact**: te veel/te specifieke tokens = 0 hits. Vermijd `2.54mm` als
  losse token (breekt de query) en gebruik de echte omschrijving-tokens: male =
  `Pin Header` (pincount mét x: `2x10P`), IDC = `IDC Header`, female =
  `Female Header`, haaks = `Right Angle` (of Chinees `弯插`). Werkt bv.
  `2x10P Pin Header` / `Right Angle Pin Header`; faalt `header 2x10 2.54mm`.
- SMT-assemblage: BOM heeft een `LCSC`-veld per symbool nodig (of `jlc_fix.py`'s
  parts-library vult 'm). **CPL-rotaties wijken bij JLC per package af** van
  KiCad — `jlc_fix.py` corrigeert dat automatisch via `ROT_FIX` (per footprint)
  + `ROT_FIX_VAL` (per part-waarde; zelfde package kan per chip verschillen, bv.
  74LVC1G125 vs 74LVC1G17). **Alleen SMD corrigeren** (machine plaatst blind);
  **THT blijft raw** (mens volgt de gaten/silk → 90/270 in de preview is het
  3D-model, niet de echte plaatsing). Offsets aflezen in JLC's
  Component-Placements-preview; zie `hardware/schematics/FABRICATION.md`.
- **THT-beleid (gewijzigd 2026-07-21, besluit Mark)**: headers en sockets
  worden **wél door JLC bestukt** (LCSC-nummers per footprint in
  `jlc_fix.py` LCSC_CONN). **Economic PCBA kan dat gewoon** (THT gaat via
  de Manual-Assembly/hand-soldering-fee, ~€20-25/order); **Standard PCBA is
  alleen nodig als een part "Standard Only" is** (bv. de ESP32-S3-module op
  de axon) — les busboard-order 2026-07-21.
  Blijft handwerk: pots/encoders/Thonkiconn-jacks (fit-kritisch of niet in
  catalogus), moduul-parts (Teensy, R-78E, SSI/AS-chips, ESP32-modules) en
  solderjumpers (koper-only). B-zijde-THT (Socket_1x10_backside e.d.):
  vóór de order checken of JLC die zijde meeneemt. Onderdeel-index:
  `hardware/schematics/PARTS.md` (gegenereerd door `parts_index.py`).
- Groot bord (busboard ~200×115) valt buiten het prototype-tarief; fronts en
  slotkaarten (≤100×110) zijn goedkoop — reken daarmee bij paneelkeuzes.

## Praktische valkuilen (Windows/omgeving)

- Multiline-patches op generators: **Edit-tool of per-regel Python-`io`**,
  nooit bash-heredoc-sed (backslashes/CRLF eten patches op — herhaaldelijk
  misgegaan).
- Windows-Python begrijpt geen `/d/Git/...`-paden — altijd `d:/Git/...` in
  Python-argumenten; Git Bash zelf wil juist `/d/`.
- Docker in Git Bash: `MSYS_NO_PATHCONV=1` anders worden `/jar`-paden gemangeld.
- KiCad houdt bestanden gelockt (ook stale `~*.lck`) — mapoperaties pas na
  het sluiten van KiCad; stale locks mogen weg.
- pcbnew-python: zones éérst vullen (`ZONE_FILLER`), `IsOnLayer` checken vóór
  `GetFilledPolysList` (assert), `GetParentFootprint()` i.p.v. `GetParent()`.

## Release-archief per bord

Bij een site-release wordt de stand van elk bord bevroren in een submap
`<bord>/rel-vX.Y/` (KiCad-bronnen, README, overzicht, widget-json, pinouts,
bom/cpl — gerbers zijn regenereerbaar). Repo-breed markeert een **slash-tag**
(`hw/vX.Y`) dezelfde stand; fw/web taggen onafhankelijk (`fw/vX.Y`, `web/vX.Y`).
Een git-tag kan niet op een submap slaan — de slash-prefix is de conventie
(zoals Go-monorepo's en Nx; filteren met `git tag -l 'hw/*'`).
De site bewaart zijn kant al per versie (`/api/assets/<component>/<versie>/`).

## Startpunt voor een nieuw bord

Kopieer het dichtstbijzijnde `gen_*.py` (slotkaart: `gen_gatein.py`; front:
`gen_pot8front.py`; riser: `gen_i2criser.py`; groot/complex: `gen_bus2_pcb.py`
+ los schema-script). Nieuwe bordmap onder `hardware/schematics/musicbrain-<naam>/`,
bord in `make_fab.sh`-lijst, README met status/contract/firmware-mapping,
regel in `MODULES.md`.

## Documentatie-graphics (aansluitoverzichten)

Geannoteerde 3D-overzichten ("gswitch-brain-stijl") zijn volledig scriptbaar
met **`board_overview.py`** — geen KiCad-GUI nodig:

    python board_overview.py <bord.kicad_pcb> <overzicht.json> [uit.svg]

- 3D-render via `kicad-cli pcb render --background transparent` (op wit
  gecomposit met PIL), automatisch strak bijgesneden.
- Het bord wordt in de PNG **teruggevonden** (achtergrond-scan) zodat
  callouts in gewone **bord-mm** worden opgegeven; mm→pixel gaat vanzelf.
- Spec = json naast het bord (titel, voetnoot, `bbox_mm` = Edge.Cuts, en
  callouts met `label`/`mm`/`kant` links|rechts|boven|onder). Labels per
  kant worden overlapvrij gespreid. Voorbeeld:
  `musicbrain-busboard-v2/musicbrain-busboard-v2-overzicht.json`.
- Zelf visueel checken: rasteriseer de SVG met headless Chrome
  (`chrome.exe --headless --screenshot=... --window-size=... file:///...svg`,
  met `MSYS_NO_PATHCONV=1` in Git Bash) en bekijk de PNG.
- Render-varianten: `--side bottom` voor achterzijde-overzichten; kicad-cli
  kent ook `--rotate`/`--zoom`/`--perspective` voor sfeerplaatjes (maar de
  mm→pixel-mapping klopt alleen bij de rechte top/bottom-view).
- **`--auto`**: schrijft een json-skelet uit het bord zelf (bbox uit
  Edge.Cuts, titel + rev uit het title_block, callouts = alle J*-connectors
  met value als label, kant = dichtstbijzijnde rand) en rendert meteen.
  Bestaat de json al, dan blijft die leidend — dus polijsten mag.
- **Missende 3D-modellen** (custom footprints renderen als kale pads):
  (1) lib-STEP van een gelijkende connector hergebruiken en de offset op de
  render ijken (RJ45 → `RJ45_Amphenol_RJHSE538X.step`, ander pinraster maar
  zelfde behuizing); (2) simpele WRL-dozen genereren met `gen_3dshapes.py`
  → `schematics/3dshapes/`, ref via `${KIPRJMOD}/../3dshapes/…` (let op:
  1 VRML-eenheid = 2,54 mm, y = −bord-y); (3) lib-model met nét andere naam
  checken: `ESP32-S3-WROOM-1U.step` bestaat niet, `…-1.step` wél.

**Pinout-diagrammen per connector** met **`pinout_svg.py`**:

    python pinout_svg.py <bord.kicad_pcb> J9          # één connector
    python pinout_svg.py <bord.kicad_pcb> --alle      # alle J* (>=4 pins)
                                                      # -> <bordmap>/pinouts/

Leest pads + netten **rechtstreeks uit het bordbestand** (beide formaten:
generator `(net idx "naam")` én pcbnew-hersave `(net "naam")`) — kan dus
nooit uit de pas lopen met het ontwerp. Bovenaanzicht, pin 1 = vierkant,
IDC-shroud met nok (oneven-pinnen-zijde), kleuren: GND grijs, +voeding
rood, −voeding blauw, signaal geel, nc licht. 1×3's e.d. vallen buiten
`--alle` — die per ref genereren.

SVG's embedden gewoon in de bord-README's (`![...](x.svg)`) — GitHub
rendert ze; de render zit als data-URI ín de SVG dus er is geen externe
resource die geblokkeerd wordt.
