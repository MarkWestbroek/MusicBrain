# VCF8-kern — overdracht naar verse chat (2026-07-21, bijgewerkt na de routeersessie)

## EINDSTAND (2026-07-31) — ROUTING AF

Het bord is volledig gerouteerd. Een verse volledige run van
`gen_vcf8kern.py` schrijft het PCB opnieuw; aansluitend geeft KiCad 10.0.4
met opnieuw gevulde zones **0 violations + 0 unconnected**. Schema blijft
geldig: **ERC 0 + NETCHECK OK**. Renders: `render-top.png` /
`render-bottom.png`.

**Het recept dat won** (details: WERKWIJZE.md §"Dichte borden"):
net-bewuste plaatsing (elk passief naast zijn pin) → freerouting v2.2.4
(`-mp 20`, wordt gerespecteerd, SES gegarandeerd) → `finish_routes.py`
(nieuwe deterministische afmaker) → gnd_stitch/bridge → chirurgische
GND-via-ankers (`force_gnd_via` + cumulatieve `gnd_orphans.json`).

**Afgeronde restklus** — de oude punten uit `drc-fin16.json` waren:
1. kruising MOUT7 × OUT48 op F.Cu bij (196.9, 130.3) — één van beide
   verleggen (kort stukje);
2. MODE0: U18 pin 11 (200.9, 157.0) hangt los van het MODE0-B-spoor op
   (199.2, 157.0) — 1,7 mm dichten + 3 hangende MODE0-via's opruimen;
3. MODE1: 0,6 mm-gaatje bij J1 pin 18 (148.7–149.4, 188.6);
4. AOUT3: J3 pin 4 (178.2, 102.0) los van het AOUT3-B-spoor — stukje bij
   de audiorand;
5. dangles verwijderen: FB7 (196.4, 140.7), AOUT2 (175.0, 102.8),
   AIN7 (134.4, 102.0);
6. GND-eilandjes: C905.2 (154.5, 143.0), U2.10 (109.4, 172.9 — pin zit
   gevangen in de IN12-wikkel; IN12 lokaal verleggen), U18.8 (195.1,
   158.3) + 3 zone-fragmentjes — korte stubs/via's met de hand.

Alle punten hierboven zijn opgelost in `gen_vcf8kern.py`: MOUT7 gaat lokaal
via In1.Cu onder OUT48 door, MODE0/MODE1/AOUT3 zijn gesloten en de laatste
GND-eilanden hebben reproduceerbare handroutes/via's. De tussenmeldingen
`MISLUKT (1): ['GND']` en `NIET: ['C905.2', 'U18.8', 'U2.10']` tijdens een
generatorrun zijn verwacht: de definitieve handroutes staan na de algemene
afmaker en lossen de resterende gevallen alsnog op.

Eindcontrole:
```
kicad-cli pcb drc --severity-error --exit-code-violations --refill-zones \
  hardware/schematics/musicbrain-vcf8kern/musicbrain-vcf8kern.kicad_pcb
```
Resultaat op 2026-07-31: **0 violations / 0 unconnected**. Volgende stap:
`bash make_fab.sh "musicbrain-vcf8kern"` en de JLC-preview controleren.

---

*Oorspronkelijke handover hieronder (deels achterhaald door bovenstaande).*

Volledige stand van `musicbrain-vcf8kern` (rev 0.1) + testadapter na een lange
sessie. Lees ook de memory's **[[ssi2140-vcf8kern]]** en **[[poly-analog-spoor]]**
en **hardware/kicad-generators/WERKWIJZE.md**.

## Wat af is (gevalideerd)

- **Schema = hiërarchisch + BEDRAAD**: root + `in-uit-DACs` + 8 stem-pagina's
  (`gen_vcf8kern.py` + `schlib_hier.py`). Elke stem toont de SSI2140 met echte
  draadjes naar zijn subcircuits; tap-bus (AINB/OUT1..4) via globale labels.
  **ERC 0 + netcheck OK.** Globale labels = KALE PCB-netnamen (geen `/`-prefix).
- **Logisch stem-doc** (opamp-driehoeken, SSI-chip): `gen_vcf8kern_voicedoc.py`
  → `musicbrain-vcf8kern-voicedoc.kicad_sch`. Losse leestekening (niet in de
  netlist). Cascade nog wat dicht; optie: 1 trap + "×4".
- **Opamp-mapping**: `opa_pair_nm(v1,v2)` — **1 TL074 = 2 naburige stemmen**
  (elk in-buffer + uit-buffer). U21=(1,2) U22=(3,4) U23=(5,6) U24=(7,8), U25=aux.
- **Tile-plaatsing (Marks sketch, goedgekeurd)**: 2 gespiegelde helften van 4
  stemmen om een **midden-DAC-spine**; kolom = SSI/4051/074/4051/SSI (074 tussen
  2 stemmen, 4051 tussen SSI en 074). AD5754 #1→helft-L, #2→helft-R. SPI van de
  kernslot (onder) omhoog de spine in. Passieven per-stem geclusterd
  (`take_region`). Bord **110×92**, ERC 0 / netcheck OK / 0 courtyard-overlap.
  Sketch: `doc/sketches/VCF core board layout sketch.jpg`.
- **4-laags** (Marks OK): `b.copper=['F.Cu','In1.Cu','In2.Cu','B.Cu']` +
  `b.gnd_zone_layers=['In1.Cu','In2.Cu']` → In1/In2 = massieve GND-planes,
  F/B vrij (scheiding + aarding voor audio). `make_fab.sh` doet al 4-laags.
- **testadapter** (`gen_vcf8kern_testadapter.py`): passief buskabel→kernslot,
  ERC 0 / netcheck OK / 0 overlap — nog 2-laags, routing triviaal.

## De routing-doorbraak + het openstaande knelpunt

- ⚠️ **freerouting v2.1 is STUK op dit bord** (NPE-crash-loop → 0 voortgang).
  De eerdere "100 GB memory explosion" was een MISLEZING: dat is cumulatieve
  GC-alloc; live-RSS was ~1,5 GB. Niet OOM — gewoon kapot.
- **freerouting v2.2.4 ROUTEERT WEL** (vereist **Java 25**):
  ```
  docker run --rm -v "<borddir>:/work" -v "C:/Users/User/.kicad-mcp:/jar" \
    eclipse-temurin:25-jre java -jar /jar/freerouting-2.2.4.jar \
    -de /work/musicbrain-vcf8kern.dsn -do /work/out.ses -mp 100
  ```
  jar ligt in `C:/Users/User/.kicad-mcp/freerouting-2.2.4.jar`.
- **DSN-prep**: `python prep_dsn.py <bord.dsn> --keep-gnd` (nieuwe vlag: In1/In2
  → type `power` zodat freerouting er geen signaal op legt; GND-net + planes
  blijven; GND valt naar de binnenvlakken). Alleen boundary krimpt.
- **Resultaat**: 676 → **~130 unrouted** (81% geroute), daarna **plateau** (het
  oscilleert 130–142). De rest zit vast in de dichte per-stem-tiles (**37 0603's
  per stem**). Zelfs 4-laags + v2.2.4 komt er niet doorheen. Geen SES geschreven
  (freerouting schrijft alleen bij natuurlijke terminatie).

## ~~OPEN BESLUIT~~ → BESLOTEN (Mark, 2026-07-21): **DUBBELZIJDIG**

8 stemmen/kaart blijft (32/backbone, B6/B7 intact, bord 110×92). De
4-stems-split is van tafel. Implementatie (zelfde dag):

- **cardlib.fp() `flip=True`**: canonieke pcbnew-flip naar B.Cu (lagen F↔B,
  lokale y gespiegeld, tekst `justify mirror`); alleen rot 0 (genoeg voor 0603).
- **Split per stem** (44 passieven): cascade-kern **R01–R18 + C01–C04 (22) top**
  bij de SSI; **pole-mix-ster R30–R44 + buffer-steun R19–R22 + ontkoppeling
  C05–C07 (22) bottom**, recht onder de eigen tile (`CELLS_T`/`CELLS_B`,
  THT-connectors blokkeren beide zijden). Shared ontkoppel-100n's → B onder de
  spine; R901–R903/C915 + CP-elco's top.
- **TODO 1 (mux-mapping) gedaan**: `tune_nm()` geografisch — linker Y-pinnen =
  helft-L, rechter = helft-R. Firmware-tabel TSEL-code n (=Yn) → stem:
  0→6, 1→7, 2→5, 3→8, 4→1, 5→4, 6→3, 7→2 (staat ook in de bord-README).
- ERC 0 + netcheck OK + renders gecheckt; fab-keten was al dubbelzijdig-proof
  (`pos --side both`, CPL-`Layer`-kolom; 0603 rotatie-ongevoelig).

## TODO's voor de volgende chat (na het besluit)

1. **Mux-mapping optimaliseren voor routing** (Mark vroeg ernaar; nog NIET
   gedaan). mode→Y en TSEL→stem zijn firmware-flexibel, dus herorden de
   FYSIEKE Y-pinnen: nabije stemmen → nabije mux-pinnen (bv. tune-mux: helft-L
   → linker Y's, helft-R → rechter Y's i.p.v. interleaved). `mux_nm`/`tune_nm`
   in gen_vcf8kern.py. Marginaal maar echt.
2. **Kies + implementeer** dubbelzijdig (passieven-placer: helft naar B.Cu,
   `b.fp(... 'B.Cu-flip' ...)` / bottom-side footprints) OF 4-stemskaart
   (halveer de generator; chain-out-connector toevoegen; kernslot-daisy).
3. **Route** met v2.2.4 (recept boven) → apply_ses (`seslib`) + `snap_stubs()`
   + evt. **hybride narun** (WERKWIJZE: protect het geroute, geef alleen de
   missende netten aan freerouting). Hook zit al in gen_vcf8kern.py.
4. **DRC 0/0** (`kicad-cli pcb drc --severity-error --refill-zones`) + render +
   **fab** (`bash make_fab.sh "musicbrain-vcf8kern"` — doet 4-laags automatisch).
5. **rot-check** alle SMD in de JLC-preview (SSOP-20, TSSOP-14/16, HTSSOP-24,
   SOIC-8, SOT-23); AD5754 pas op gevalideerd board (Route B).
6. ⚠️ **Verticale audio-plug** (1×10) is ~15–20 mm; kaart-gap is ~20 mm → krap.
   Bij de backbone/mechanica meenemen (kortere connector of andere audio-route).

## Kernfeiten (niet opnieuw uitzoeken)

- SSI2140-pinout: buildspec §1 had pins 1–6 FOUT; correcte pinout + Fig-3-
  waarden (15k/15k/200Ω/1nF, EXPO 54.9k+1k, Q 13k, comp 16.2k/1k) staan in
  [[ssi2140-vcf8kern]] + de gen_vcf8kern.py-docstring/`ssi_nm`.
- Pole-mixing: AN701 Table 1, R_ref=75k, passieve som-ster → 4051; 8-mode menu
  (4LP/3LP/2LP/1LP/2HP/BP2/BP4/NOTCH) = `MODES` in gen_vcf8kern.py.
- Kernslot-contract v1.1 = `KERNSLOT` dict; audio = jack8-contract 1×10.
- Netcheck-recept: kale netnamen beide kanten (globale labels ↔ PCB zonder `/`).
