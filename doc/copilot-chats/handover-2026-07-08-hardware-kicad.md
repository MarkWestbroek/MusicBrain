# Handover — MusicBrain hardware / KiCad (voor een nieuwe chat)

**Datum:** 8 juli 2026 · **Repo:** `d:\Git\Muziek\MusicBrain` · **Spoor:**
de *hardware*-kant (KiCad-borden rond de SPI-bus), níet de firmware/DSP-modules.
Voor dat andere spoor: zie `handover-2026-07-08-fable.md` (Teensy-firmware +
editor). Deze twee sporen lopen parallel in dezelfde repo.

Lees eerst je **auto-memory**: `MEMORY.md` + met name `spi-bus-architectuur.md`,
`kicad-workflow.md`, `ad5754-breakout-design.md`. Daar staat het gecomprimeerde
recept en de routing-regelbibliotheek. Dit document is de actuele *werkbon* en de
uitleg van de werkwijze.

De **leidende specificatie** is `doc/spi-bus-spec.md` — dat is de bron van
waarheid voor de bus-pinout, mechanica en de kaartenlijst. Elke kaart valideert
daartegen (net als de firmware-contract-keten).

---

## 1. Wat er staat (git-staat)

- **HEAD:** `9c806a4` "Fab-pakketten voor alle 10 borden".
- **Alle borden af, geroute (DRC 0/0), ERC-schoon, netlijst pad-voor-pad
  geverifieerd, én met een fab-pakket** in `Images/schematics/<bord>/fab/`:

| Bord | Kern | Maat | Bus |
|---|---|---|---|
| `ad5754r-breakout` | AD5754 quad-DAC + ADR421 | — | hub-kabel (2×5) |
| `musicbrain-busboard` | Teensy 4.1 backplane, 6 slots + 2 hubs | 200×115 | — |
| `musicbrain-gate8` | 74HCT595 → 8 gate-out | 35×80 | slot |
| `musicbrain-adc8` | AD7606 → 8 CV-in | 40×80 | slot |
| `musicbrain-dac8` | 2× AD5754 daisy → 8 CV-out | 50×80 | slot |
| `musicbrain-gatein8` | 74HC165 + LVC1G125 → 8 gate-in | 40×80 | slot |
| `musicbrain-pot8` | 8× RK097N + MCP3208 | 110×80 | slot |
| `musicbrain-enc4` | 4× PEC12R + MCP23017 | 70×80 | slot |
| `musicbrain-jack8` / `jack4` | passieve Thonkiconn-strips | — | paneel |

- **⚠️ Onafgemaakt / bekend:**
  - **AD5754-pinout — les geleerd (opgelost):** de AD5754 heeft ~LDAC op
    **pin 10** (pin 12/13 = NC), per Nic Newdigate's bewezen ontwerp
    (`D:/Git/Muziek/Nick/teensy-eurorack/.../teensy-eurorack-breakout-cache.lib`).
    De **breakout is correct** (pin 10 al aan GND). De nieuwe DAC8 had de
    pinout eerst verhaspeld (LDAC op 12); **gefixt** in commit `2e994df`
    (geverifieerd tegen Nick). **Altijd de chip-pinnummering tegen Nick's
    lib checken, niet uit het geheugen typen.**
  - **`.kicad_pro` ontbrak** op de generator-kaarten (dac8/pot8/gatein8/enc4) →
    niet als project in KiCad te openen. Opgelost door per kaart een projectbestand
    (kopie van de adc8-template) toe te voegen. **Nieuwe kaarten: vergeet de
    `.kicad_pro` niet** (kopieer er een en pas projectnaam + top-sheet-uuid aan).
  - **AD5754-datasheet-samenvatting** staat in `doc/data-sheets/AD5754BREZ data.md`
    (pinout 3× bevestigd, registers, ranges, BREZ = geen interne ref → ADR421).
    DAC8 kreeg ook de voorgeschreven 10 µF bulk op VREF (C14) naast C6.
  - **Cosmetisch:** op de vroegste borden (gate8/adc8) staan sommige 0805's
    90° gedraaid in de silk/fab door een generator-bug die later gefixt is
    (padvormen draaiden niet mee). Functioneel niets mis (DRC 0/0); alleen bij
    een herspin oppoetsen.
  - **DAC8** heeft niet-opeenvolgende cap-refs (C9/C11 ontbreken) — cosmetisch.

---

## 2. De werkwijze: KiCad zónder GUI

Er is **geen KiCad-GUI gebruikt**. Alles is machine-gegenereerd en
machine-geverifieerd via `kicad-cli` (10.0, staat op PATH). De kernloop per
bord:

1. **Genereer** `.kicad_sch` + `.kicad_pcb` met een Python-generator
   (v8-sexpr, `version 20240108`).
2. **ERC:** `kicad-cli sch erc --severity-error --exit-code-violations`.
3. **Netlijst-check:** exporteer `--format kicadsexpr` en vergelijk **pad-voor-pad**
   de schema-netten met de PCB-pad-netten (de `netcheck()`-helper). Dit vangt
   verkeerde footprint-pinmaps die ERC en DRC beide missen.
4. **DRC:** `kicad-cli pcb drc --severity-error --refill-zones --format json`.
   Herhaal tot `violations: 0, unconnected: 0`.
5. PDF's exporteren (sch + board) en committen (README per bord).

### De gedeelde generator-toolkit (in `scratchpad/`)

- **`cardlib.py`** — `Board`-klasse: footprint-loader die systeem-`.kicad_mod`'s
  inleest, v10-only tokens str4ipt, per pad `(net ..)` injecteert, en de
  **pad-absolute posities** teruggeeft in `board.P[ref][padnum]` zodat de
  routing exact op pads kan mikken. Plus `netcheck()` en de zone/board-emitter.
  **Belangrijk:** de loader draait óók de pad-hoek mee bij een geroteerde
  footprint — dat *niet* doen was de 90°-bug (zie §4).
- **`schlib.py`** — `Sch`-klasse + herbruikbare symbolen (`box_symbol` voor
  IC's met links/rechts-pinlijsten, `conn_symbol`/`conn1_symbol`, R/C/pot,
  power/flag). Genereert v8-schema's.
- **`gen_<bord>.py`** — per bord één generator die `schlib`+`cardlib` gebruikt.
  De busboard/ADC8/DAC8 hebben oudere standalone generators (`gen_bus_*.py`,
  `gen_adc_pcb_v11.py`, `gen_dac8.py`).
- **`make_fab.sh`** — genereert voor álle borden gerbers + Excellon-drill + CPL
  + JLCPCB-BOM; python-zip erachteraan. Zie `Images/schematics/FABRICATION.md`.

Deze bestanden staan in de **scratchpad** (niet in de repo). Als je verder
bouwt, hergebruik ze; ze zijn de facto de "bibliotheek".

---

## 3. De mechanische standaard (definitief, in de spec)

Assenstelsel: **L** = busboard-lengte (kaartenrij), **B** = busboard-breedte
(kaartvlak-richting), **H** = kaarthoogte boven het busboard.

- **H = 80 mm voor álle slotkaarten** → één vlakke **bovenplaat** draagt alle
  jacks/potten/encoders (assen + Thonkiconn-moeren door de plaat = de kaart zit
  boven én onder vast).
- **Busconnector = haakse male 2×10** aan de **onderrand** (pennen het slot in).
- **Paneelconnector = haakse male** aan de **bovenrand**, gecentreerd **recht
  boven het midden van de slot-pinrij** — zo lijnen alle jack-strips uit.
- Vuistregel: **precies één haakse connector per koppeling, altijd kaart-zijde
  (male)**; busboard-slots en jack-strips zijn rechte female sockets.
- Silk-link: `musicbrain.nl/hw/<bord>` + rev.

Kaartmodel in de generators: `x` = B-richting, `y` = H (busrand onder = grote
y, paneelrand boven = kleine y). J1 = `PinHeader_2x10_Horizontal` rot 270 op
`(CX+11.43, BY1-6.58)`; J2 = `PinHeader_1x10_Horizontal` rot 90 op
`(CX-11.43, BY0+6.58)`.

---

## 4. Problemen die we tegenkwamen (en de fix)

Dit is de belangrijkste sectie voor een verse chat — dit is met bloed betaald.

**Footprint / geometrie**
- **90°-padbug:** bij een geroteerde footprint moet je niet alleen de pad-
  *positie* meedraaien maar ook de pad-*hoek* (de hoek in het `.kicad_mod` is
  absoluut). Niet doen → oblong pads staan dwars → DRC-clearances kloppen niet.
  Fix zit nu in `cardlib.Board.fp`.
- **Pad-nummers die dubbel voorkomen** (SOT-223 tab = pad "2" twee keer;
  SOT-23-dual) → de loader hangt er een `b`-suffix aan (`'2'`, `'2b'`);
  gebruik de juiste in de routing (tab vs pin).
- **PinHeader_*_Horizontal**: pad 1 = rect, pennen steken naar −y; courtyard is
  klein maar de F.Fab-omtrek loopt tot y≈24 (de horizontale pennen).
- **PEC12R (haakse encoder):** as wijst naar lokale −x; brede SH-montagebeugels
  (3,4×2,9, asymmetrisch) → dwingen ~16,7 mm steek af, dáárom paste 8 niet en
  werd het ENC4 (4 stuks). RK097N idem: beugels → 13,5 mm steek.

**Routing (blind, zonder GUI)**
- **Manhattan-regel voor volgorde-omkeringen** (bv. chip-uitgang V1..V8 →
  connector IN1..IN8 gespiegeld): F.Cu alleen verticalen, B.Cu alleen
  horizontale lanes → niets kruist op dezelfde laag. Zo is de ADC8-routing
  gelukt die eerder twee keer vastliep.
- **Lane-nesting:** als lane_j over verticaal_i heen moet, moet lane_j dieper
  (verder van de chip) liggen dan lane_i. Strikt nesten = kruisingsvrij.
- **Westkolom-entries:** "diepste entry → oostelijkste verticaal" (idem oost
  gespiegeld). Kruisingsvrije waaier de fijne 0,5/0,65 mm-pinrijen in.
- **B-verticalen + B-lanes vanaf THT-pads zijn vialoos** (het THT-pad zit al op
  beide lagen). Scheelt via's bij connectors.
- **Via kan nooit binnen 0,5 mm van een kruisende 0,5-pitch spoorrij** — reserveer
  ≥0,8 mm vrije rijen rond via-landingen.
- **Zone-eilanden** (afgesloten GND-stukjes) vind je via
  `drc --save-board` + de filled_polygon-bboxes uitlezen; bond ze met een GND-via
  of gebruik `island_removal_mode`.

**KiCad-bestandsformaat**
- Lokale labels krijgen een `/`-padprefix; **meng nooit tekstlabels en
  power-symbolen voor dezelfde rail** in een schema (→ los net). Rails altijd via
  power-symbolen, signalen via labels.
- Net-namen met `/` worden als `{slash}` opgeslagen; de netcheck canoniseert dat.
- v10-only tokens (`duplicate_pad_numbers_are_jumpers`, `embedded_fonts`,
  `tenting`, `zone_layer_connections`) strippen bij het inladen van system-
  footprints, anders opent KiCad 8/de cli het niet.

**Workflow**
- **PowerShell/bash-quoting:** grote Python-patches via een `python - <<'EOF'`
  heredoc in bash mislukken vaak op quotes → schrijf een `patch_<x>.py`-bestand
  met de Write-tool en draai dat. (Meermaals gebeurd.)
- **`.history/`-mappen zijn geneste git-repo's** → nooit `git add -A` of hele
  mappen; altijd **expliciete bestandslijsten**. Er staan ook uncommitted
  bestanden van de firmware/editor-sessie in de tree — **die nooit committen.**

---

## 5. Volgende stappen (open)

1. ~~AD5754-breakout v2.1~~ — bleek een misdiagnose; de breakout was al goed,
   de fout zat in DAC8 (pinout), inmiddels gefixt (`2e994df`). Niks meer te doen.
2. **Firmware-drivers per kaart** — **alle zes klaar** in
   `firmware/lib/mb-bus-cards/` (host-drivers, `namespace mb`, header-only,
   compileert schoon met clang++ maar **nog niet op hardware getest**): MbBus,
   MbGate8, MbGateIn8, MbPot8, MbDac8, MbAdc8, MbEnc4. MbDac8/MbAdc8 zijn
   geadapteerd van Nick's bewezen `ad5754.h` + `input_output_spi.cpp`. Bring-up-
   punten in de lib-README (o.a. **AD7606-SPI-mode nog verifiëren** — staat als
   MODE2-TODO). **Architectuur-let-op (openstaand):** `firmware/breakouts/`
   beschrijft een ander, ouder transport (slimme SPI-slave-breakouts + frame-
   protocol, ADR 0004/0006/0008) — reconcilieer dat met de spec-kaarten of kies
   expliciet. Mapping-tabellen staan in de per-bord README's:
   - GATE8: bit0=QA=GATE1..bit7=GATE8, latch op CS↑, mode 0.
   - GATEIN8: bitvolgorde IN6 IN5 IN4 IN3 IN1 IN2 IN7 IN8; **fw wacht ≥5 µs na
     CS-laag** (RC-latchpuls).
   - DAC8: daisy MOSI→U1→U2→MISO, 48-bit frames, 1 CS; LDAC = buslijn; offset
     binary; kanaal→DAC-tabel in de README.
   - POT8: MCP3208, mode 0, ratiometrisch (VREF=VDD=3V3).
   - ENC4: MCP23017 @0x20, GPPU-pull-ups aan, INTA/INTB-mirror → IRQ; GPIO-map
     in de README.
3. **Bestellen:** fab-pakketten zijn klaar; alleen de LCSC-kolom in de BOM's
   invullen (zie `FABRICATION.md`) en de rotaties checken bij de assembly-upload.
4. **Mogelijke extra's:** 8×CV-out is er (DAC8); een quad-variant per slot,
   MIDI/CV-brug, of een tweede busboard-rev met gebufferde bus als er >6 kaarten
   komen.

---

## 6. Stijl / omgang

- De user is **Mark**, Nederlandstalig, hobby-elektronica, leert KiCad. Houdt van
  "doe het gewoon / ik laat me verrassen" → mag autonoom doorbouwen en tussendoor
  committen. Rapporteer met een korte, leesbare samenvatting per stap.
- **Alleen je eigen werk committen** met een beschrijvende NL-commit + de
  `Co-Authored-By: Claude Fable 5`-trailer. Nooit de firmware/editor-bestanden
  van de parallelle sessie.
- Wees eerlijk over wat wel/niet geverifieerd is. "Geroute" betekent hier:
  ERC 0 + netlijst-check OK + DRC 0/0 — niet fysiek gebouwd/getest.
- Een chat exporteren: `python scripts/export-claude-chats.py --latest --title <onderwerp>`
  (schrijft naar `doc/copilot-chats/exports/`).

---

## Update 2026-07-09 — mechanica/paneel vastgelegd + riser gebouwd

**Mechanisch model (definitief, Eurorack 3U):** L = busboard-lengte 200 (= paneelbreedte);
B = 110 (busboard-diepte = Eurorack-PCB-maxhoogte); H = kaarthoogte = **80 mm** (blijft
80; DAC8 is de drukste en heeft ~67 mm nodig — de ~15% besparing weegt niet op tegen
4 werkende kaarten herspinnen). Frontplaat = 200 × 128,5 mm (3U). Concept: `doc/mechanics/
frontpanel-v1.svg` (genereren: `scratchpad/gen_panel.py`).

**Paneel-v1 (akkoord):** links een *brain-console* (display + 4 soft-knoppen + 2 druk-
encoders + MIDI 2×IN/1×UIT + USB-host); midden 6 performance-kaarten op 20 mm:
ADC8 · GATEIN8 · POT8 · **ENC5** (5 enc + 2 knop) · DAC8 · GATE8; audio NIET op het
hoofdpaneel maar als losse strips (2×N IDC-lint): audio-in (6 + gat + TUNE-IN) + audio-uit (8).

**Twee-PCB-model voor bediening (pot/enc):** de paneelcomponenten zitten NIET op de
verticale kaart maar op een horizontaal *front-bord*; daartussen een **generieke riser**.
- **`musicbrain-riser`** is GEBOUWD (DRC 0/0, ERC 0, netcheck OK): een dunne verticale
  print die de VOLLEDIGE 2×10-slotbus 1-op-1 omhoog draagt (J1 haaks in het slot, J2 haaks
  naar het front). Front-koppel-pinout (J2 x-gematcht t.o.v. J1) staat in de riser-README.
- Front-borden gebruiken hun eigen deel: **POT8 = SPI** (MCP3208), **ENC = I2C** (MCP23017).
  Eén riser past onder elk front.

**Beslissingen deze sessie:** ENC = 5 encoders + 2 knopjes (A+B → 12 GPIO, 1× MCP23017);
ADC8 → **v1.1 recht-toe-bedrading + firmware-remap** (kanaalvolgorde in `MbAdc8`, niet in
koper); MIDI = **2× IN + 1× UIT** (geen thru) op het busboard, Serial8 (34/35) + 1 UART-RX
erbij, kabels naar paneel-DIN's; USB-host via de dedicated Teensy-poort; TUNE-IN = losse
jack op de audio-in-strip + DAC8-sweep om VCO's te ijken; audio-codec **CS42448** via de
Teensy Audio-library **TDM (I2S1 = pinnen 7,8,20,21,23)** — botst met bus-CS4/CS5 + EXP,
dus vergt een **pin-herplan** (of I2S2/SAI2); I2C-control op 18/19.

**Nog te bouwen (prioriteit):**
1. **POT8-front** (horizontaal, 8 pots RK09K + MCP3208 + 2×10 female riser-socket). LET OP:
   8 pots in één kolom op 20 mm → de 8 wipers moeten vanuit één x-kolom naar de MCP
   waaieren; dat vergt een nette **8-baans-fan** (B.Cu-lanes in de west-gap x 100–105,
   pin3/+3V3 en pin1/GND apart afvoeren). Generator-aanzet: `scratchpad/gen_pot8front.py`
   (routete nog niet schoon — floorplan herzien). Gebruik `Potentiometer_Alps_RK09K_Single_
   Vertical` (heeft 3D-model).
2. **ENC5-front** (5 enc + 2 knop + MCP23017 + 2×10 socket) — zelfde patroon.
3. **ADC8 v1.1** (recht-toe + `MbAdc8`-remaptabel).
4. **Silk-fixes** op dac8/gatein8/gate8 (URL-positie) — kan ik niet blind verifiëren zonder
   de render; doen mét de user erbij.
5. **Busboard-v2**: MIDI-DIN-blok (2×IN/1×UIT), TUNE-IN-timerpin, codec-I2S-pinreserve.

### ⚠️ Front-borden geblokkeerd op een besluit (2026-07-09, nacht)

Bij het bouwen van POT8-front bleek de mechanische envelope te strak voor de naïeve
aanpak: **RK09K-courtyard 13,3 mm** (steek ≥13,3), **pot-body vult ~15 mm van de 20 mm
breedte** (routekanaal ~4,6 mm), en **bruikbare kolomhoogte ≈110 mm achter de rails** —
te kort voor 8 pots + MCP + een **2×10 board-mount socket** in serie (≈129 mm).

→ Volledige analyse + de twee opties (A: generieke riser + slim front met subset-connector;
B: slim buskaart + passief front met centrale connector — **aanbevolen**) staan in
**`doc/mechanics/front-board-constraints.md`**. Dit is een architectuurkeuze voor Mark;
niet blind dichtgerouteerd. De generator-aanzet staat in `scratchpad/gen_pot8front.py`.
De rest van de bouwlijst (ADC8 v1.1, silk-fixes, busboard-v2) staat hierboven ongewijzigd.
