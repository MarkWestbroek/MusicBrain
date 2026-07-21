# Overdracht: musicbrain-matrix routen (rev 0.2 herontwerp)

> ✅ **AFGEROND 2026-07-21** (vervolgsessie): §5-fix gebouwd (tussenkanaal-
> plaatsing), 4-laags geroute met freerouting best-of-3 (`-oit 30`, run B:
> 0 signaalnetten kapot), GND gedicht (stitch + bridge + 2 handmatige
> pad-teen-via's bij U9/U10 pin 13), **ERC 0 / netcheck OK / DRC 0/0**,
> fab-pakket ververst (incl. In1/In2-gerbers — make_fab.sh detecteert nu
> 4-laags), MODULES.md → bestelbaar, firmware-mapping →
> `doc/plans/analog-patch-matrix.md`. Dit doc is alleen nog historie.
>
> ⚠️ Correctie op §5-nuance hieronder: "bus JUIT1 hangt aan álle 8 chips"
> is elektrisch te sterk gezegd — elk net is 2-punts (headerpin k+1 ↔ chip
> Uk); chips delen niets behalve control/voeding. Wat blijft: één header =
> één bus × 8 stemmen (jack8-contract), dus een header hoort bij geen enkele
> chip en zijn 8 signaalpinnen waaieren naar 8 verschillende chips.

**Datum:** 2026-07-21 · **Doel van dit doc:** een verse chat laat naadloos verder
gaan met het routen van de patchmatrix. Leidend voor de werkwijze:
`hardware/kicad-generators/WERKWIJZE.md`. Bordstatus: `hardware/schematics/MODULES.md`.

---

## 1. De opdracht (oorspronkelijk)

> Route de `musicbrain-matrix` (audio-patchmatrix) volgens de freerouting-pijplijn
> in WERKWIJZE.md. Generator = `gen_matrix.py`. Doel: **DRC 0/0 + fab-pakket
> (`make_fab.sh "matrix"`) + MODULES.md bijwerken**. Let op: **MT8816's + DIP-40
> sockets zijn eigen voorraad van Mark → NIET in BOM/CPL matchen** (uitsluiten).

Het bord: 8-stemmige audio-patchmatrix, 8× MT8816 (DIP-40, in sockets), 8 IN-bussen
× 16 UIT-bussen, elk 8 stemmen breed (jack8-contract 1×10). Sturing via 2× 74AHCT595
aan de buskabel-SPI. Voeding VDD +6 / VEE −6 / V5 logic.

---

## 2. Waarom dit een herontwerp werd (belangrijkste context)

De originele plaatsing (alle headers noord/zuid, chips ertussen, vaste pin-volgorde)
**liet zich niet routen**:

- **2 lagen**: freerouting bleef op **~83 van de ~380 verbindingen** hangen (rip-up-
  storm, geen convergentie). 2 signaallagen zijn te weinig voor deze dichte
  THT-crossbar.
- **4 lagen (alle 4 signaal)**: kwam tot **~9 onverbonden** maar oscilleerde
  eindeloos (9–26) — freerouting's bekende "eeuwige lus". Met de `-oit`-vlag stopt-ie
  wél, maar dan is de SES **onvolledig** (~22 netten half-gerouteerd). Zie §6 voor
  de freerouting-lessen.

Conclusie (WERKWIJZE-regel): *convergeert structureel niet → ontwerp aanpassen, niet
blijven rerunnen.* Samen met Mark een beter ontwerp bedacht (§3).

**`cardlib.py` is uitgebreid naar 4 lagen** (achterwaarts compatibel): `b.copper =
['F.Cu','In1.Cu','In2.Cu','B.Cu']` en `b.gnd_zone_layers`. Default blijft 2-laags
(F/B) — alle andere borden ongewijzigd (vca8 regressie-getest, OK). Deze wijziging
staat al in `cardlib.py` (git: modified, nog niet gecommit).

---

## 3. Het herontwerp — besluiten met Mark (bekrachtigd)

### Per-chip CS i.p.v. broadcast (de kern)
- **Was**: alle CS → VDD, alle chips zelfde adres = broadcast. Probleem: gespiegelde
  chips moeten identiek bedraad zijn → onvermijdelijke kruisingen.
- **Nu**: elke chip een **eigen CS**, gedreven door een **74HC238** (3-naar-8 decoder,
  actief-hoog). MT8816-CS is actief-hoog en **poort STROBE**: alleen de chip met CS
  hoog latcht. AX/AY/DATA/STROBE/RESET blijven gedeeld (broadcast).
- Winst: elke chip mag z'n **eigen pin→bus-mapping** hebben → gespiegelde chips
  krijgen gespiegelde mapping, kruisingsvrij. Bonus: **per stem onafhankelijk
  schakelen** (selling point: 8 stemmen splitsen in 2×4 met eigen routing).
- Kosten (geaccepteerd): 1 decoder-chip + langere writes. Patchen gebeurt zelden
  (tussen presets, vgl. Reflex) → snelheid geen bezwaar.
- **Firmware-adres wordt**: `<groep: 3 bits><y: 3 bits><x: 4 bits>` (10 bits).
  G2G1G0 = groep; 238.Y(groep) → CS(groep+1) → chip U(groep+1).

### Floorplan
- **Verticale chips** (rot 0, lange as verticaal). MT8816-geometrie: X-pinnen (16)
  in het verticale **midden** → verlaten O/W; Y-pinnen (8) aan de **uiteinden** →
  verlaten N/Z.
- **2 groepen van 4 (2×2)**, gespiegeld links/rechts, **sturing + voeding + buskabel
  centraal**.
- **16 UIT/X-headers**: west + oost. **8 IN/Y-headers**: noord + zuid.

### Auto per-chip pin→bus-mapping
- Na plaatsing berekent de generator per chip een **Hungarian-matching** (min.
  draadlengte) tussen z'n 16 X-pads en de 16 UIT-headers (target = headerpad voor
  stem k), idem 8 Y-pads ↔ 8 IN-headers. Deterministisch. De mappingtabel staat in de
  generator-docstring én wordt geprint → **firmware moet die per groep gebruiken**
  (elke chip anders!).

---

## 4. Huidige staat (wat werkt)

`gen_matrix.py` is herschreven naar **rev 0.2** met bovenstaande architectuur. Alles
valideert:

- **ERC 0** · **netcheck OK** (pad-voor-pad) · **DRC 0 echte fouten** · **0 courtyard-
  overlaps** · **4 koperlagen** (F/In1/In2/B). Alleen ratsnest onverbonden (nog niet
  gerouteerd) — verwacht.
- Bord **175 × 142 mm**, landscape, `paper=A3`. `.kicad_pro` aanwezig (van
  gate8-template — nodig voor freerouting-netclass).
- Render: `hardware/schematics/musicbrain-matrix/render-top.png` (klopt met floorplan).
- 74HC238 = U14; 595's = U9/U10; regs = U11(7806)/U12(7906)/U13(78L05); bus = J1.
- **NOG NIET GEROUTEERD.** Geen fab.

Generator draaien:
```
"C:/Program Files/KiCad/10.0/bin/python.exe" hardware/kicad-generators/gen_matrix.py
```

---

## 5. OPEN PUNT — waarom deze overdracht (hier verder!)

Mark zag een terechte zwakte in de plaatsing: in een 2×2-groep zitten de **binnenste
chips (U2, U4 links; U5, U7 rechts) *achter* de buitenste** t.o.v. hun nabije
headers. De UIT-headers staan nu allemaal op de **buitenrand** (per rand 2
subkolommen van 4). Dus de nabije-lijnen van de binnenchips **kruisen over de
buitenchips** — een *vermijdbare* kruising, bovenop de onvermijdelijke crossbar.

> ⚠️ Nuance die klopt: headers zijn **gedeeld** (elke UIT-header hangt aan álle 8
> chips), dus een header kan niet "naast één chip". De vérre verbindingen (linker
> chips → oostelijke headers) zijn inherent aan de crossbar. Maar de vermijdbare
> binnen-chip-kruisingen kunnen weg.

**Voorgestelde fix (Marks voorkeur, nog te bouwen):** de binnenste header-subkolom
**van de rand naar het kanaal tússen de twee chipkolommen** verplaatsen. Dan heeft
elke chip headers direct naast zich:

```
   [4 headers]  U1 U3  [4 headers]  U2 U4  │ sturing │  ...spiegelbeeld rechts
    buitenrand         tussenkanaal
```
- U1/U3 (buiten): rand-headers links + tussenkanaal rechts — beide dichtbij.
- U2/U4 (binnen): tussenkanaal links — dichtbij, **geen kruising over U1/U3 meer**.
- Vergt: chipkolommen iets verder uit elkaar (kanaal ~een 1×10-header + courtyard
  breed) + de binnenste UIT-subkolom herplaatsen in dat kanaal. Symmetrisch rechts.

**Twee routes, keuze aan Mark:**
1. **Placement eerst verbeteren** (tussenkanaal-headers), dán routen — schoonst,
   Marks voorkeur.
2. **Huidige eerst routen als baseline** — kijken of 4 lagen de kruisingen slikt; zo
   niet, alsnog route 1.

De plaatsing zit in `gen_matrix.py`: constanten `CHIP_XY`, `UIT_XY`, `IN_XY`
(rond regel 150-170). De auto-mapping past zich automatisch aan de nieuwe posities
aan (Hungarian) — je hoeft alleen de coördinaten te verzetten.

---

## 6. Routing-recept (freerouting) — geleerde lessen deze sessie

Volg WERKWIJZE.md §"freerouting-pijplijn", plus deze matrix-specifieke punten:

1. **4-laags DSN correct exporteren**: genereer eerst het 4-laags bord, dan MCP
   `open_project` → `export_dsn` (KiCad maakt een correcte 4-laags DSN met via-
   padstacks op alle lagen). **NIET zelf lagen in de DSN injecteren** — dat gaf een
   vuile SES (63 shorts). Daarna `git checkout` de `.kicad_pro`-ruis niet nodig
   (matrix `.kicad_pro` is untracked).
2. `python prep_dsn.py musicbrain-matrix.dsn` (strip GND-planes, krimp boundary 0,6mm).
   Voor 4 signaallagen géén `--route-gnd` nodig — maar hou 'm achter de hand als
   losse GND-pads de zone niet bereiken (vca8-les).
3. **freerouting met `-oit`** om te laten termineren (zonder stopt-ie nooit; `-mp`
   wordt genegeerd in v2.1). LET OP: `-oit 1` stopt te vroeg → onvolledige SES.
   Hogere `-oit` (10-100) = completer maar langer. **Meet de SES-compleetheid altijd
   met echte KiCad-DRC** (`--refill-zones`), niet met freerouting's "unrouted"-getal
   (die loog: zei 3, KiCad zag 22).
4. Best-of-N parallel via Docker (zie WERKWIJZE); commando:
   ```
   MSYS_NO_PATHCONV=1 docker run --rm --name fr-X -v "D:/.../musicbrain-matrix:/work" \
     -v "C:/Users/User/.kicad-mcp:/jar" eclipse-temurin:21-jre java -jar \
     /jar/freerouting.jar -de /work/musicbrain-matrix.dsn -do /work/X.ses -oit 30
   ```
5. SES toepassen: generator leest `musicbrain-matrix.ses` (kopieer de beste run
   ernaartoe), bakt native in via `seslib.apply_ses` + `snap_stubs`. Dan netcheck +
   DRC. `snap_stubs` ving hier 0 (THT-pads) — gaten >1,4mm zijn echte unroutes, geen
   endpoint-tekort.
6. **GND op 4 lagen**: alle I/O is THT → GND-pinnen prikken door alle lagen → de
   fill rijgt vanzelf goed aan elkaar (veel tie-points; heel anders dan vca8's
   SMD-only geval). GND-zones staan al op alle 4 lagen (cardlib default via
   `b.copper`). Hoek/rand-hechtvia's staan in de generator.
7. Verwachting na het herontwerp: **veel schoner** dan de ~9-vastloper, omdat de
   pin-exit-richtingen nu matchen (X→O/W, Y→N/Z) én de mapping optimaal is. Als het
   nog niet 0 haalt → placement verbeteren (§5), niet blijven rerunnen.

**Meetcommando (SES → echte connectiviteit):**
```
cp <beste>.ses musicbrain-matrix.ses
python gen_matrix.py
kicad-cli pcb drc --severity-error --refill-zones --format json -o drc.json musicbrain-matrix.kicad_pcb
# tel unconnected, splits GND-frags vs echte signalen (zie vca8-sessie voor het script-patroon)
```

---

## 7. Afronding (na DRC 0/0)

1. **`make_fab.sh "matrix"`** (matrix staat al in de BOARDS-lijst).
2. **MT8816 + DIP-40 sockets UITSLUITEN** uit BOM/CPL (Marks eigen voorraad). Check
   `jlc_fix.py`: MT8816 mag géén LCSC krijgen; DIP-40-socket ook niet. Evt.
   `exclude_from_pos_files` / geen LCSC-match. 74HC238 + 595's + regs = wél
   normale parts (rot checken vóór PCBA: SOIC-16 heeft al ROT_FIX 270).
3. **MODULES.md**: matrix-regel op *bestelbaar* (nu: "in ontwerp"). Rev 0.2 vermelden.
4. **Firmware-contract**: de per-chip AX/AY→bus-mappingtabel (in gen_matrix.py
   docstring) moet naar de firmware/plan-doc — elke chip heeft z'n eigen mapping.
   Adresformaat `<groep:3><y:3><x:4>`. Zie ook `doc/plans/analog-patch-matrix.md`.
5. Commit-regel: bordbestanden pas bij ERC 0 + netcheck OK + DRC 0/0.

---

## 8. Sleutelbestanden

| Bestand | Wat |
|---|---|
| `hardware/kicad-generators/gen_matrix.py` | de generator (rev 0.2, mappingtabel in docstring) |
| `hardware/kicad-generators/cardlib.py` | 4-laags support (`b.copper`), git-modified |
| `hardware/kicad-generators/WERKWIJZE.md` | dé werkwijze (freerouting-pijplijn, GND, fab) |
| `hardware/kicad-generators/prep_dsn.py` / `seslib.py` / `jlc_fix.py` | pijplijn-tools |
| `hardware/schematics/musicbrain-matrix/` | board-bestanden + `render-top.png` |
| `doc/plans/analog-patch-matrix.md` | oorspronkelijk matrix-plan |
| memory `poly-analog-spoor` | projectgeheugen (matrix + vca8 context) |

**Kort samengevat voor de verse chat:** *De matrix is architectuur-technisch
opnieuw ontworpen (per-chip CS via 74HC238, auto pin-mapping) en de plaatsing (rev
0.2) valideert schoon maar is nog niet gerouteerd. Eerst beslissen: placement
verbeteren (headers in tussenkanalen — §5) of huidige routen als baseline. Dan
routen (§6, 4-laags, `-oit`), GND, DRC 0/0, fab (§7, MT8816+sockets uitsluiten),
MODULES.md.*
