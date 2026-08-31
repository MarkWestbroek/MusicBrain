# RingEncoder — overdracht naar MusicBrain

Datum: 2026-08-31 · Status: concept gereviewd, haalbaarheid nog experimenteel te valideren
Bestanden: `RingEncoder.FCMacro` (53 mm), `RingEncoder_42mm.FCMacro` (42 mm), `SOURCING.md`, `COSTS.md`, `POSITIONING.md`

Vervolg en acceptatiecriteria: [`PROTOTYPE-PLAN.md`](PROTOTYPE-PLAN.md). De huidige
macro's zijn referentiemodellen, geen maakklare CAD: magneet en lager overlappen in
beide stapelingen 0,3 mm en lagerborging, displaypassing en off-axis hoekmeting zijn
nog niet gevalideerd.

## 1. Wat dit is

Een "display-in-knop" encoder: een vast rond TFT-display in het midden, met daaromheen
een vrij draaiende ring op een kogellager. Label + waarde + waardeboog staan *op* de
knop zelf (Range Rover/Mercedes-klimaatknop-principe). Doel: bouwsteen voor een
MIDI/eurorack-controller à la Melbourne Roto Control, maar open, modulair en zonder
motoren — tegen ~€15/knop i.p.v. €35 (M5Dial) of ~€60/knop (Roto).

## 2. Kerninzichten uit het onderzoek

### Markt
- De categorie "per-knop schermpje" is vrijwel leeg. Bestaande aanpakken:
  - **Roto Control** (~€500, 8 knoppen): gemotoriseerd + DAW-sync (Ableton/Bitwig/Logic).
    De prijs zit in motoren en host-integratie, niet in de displays.
  - **Faderfox EC4** (~€350): 16 encoders, één centraal LCD met alle labels. De
    standaard-aanrader als "Roto zonder motoren".
  - **Electra One MkII** (~€400): 12 encoders rond één groot touchscreen; labels naast
    de knoppen. Bewijst dat één groot paneel goedkoper is dan veel kleine — maar
    label en knop zijn niet co-located (Marks bezwaar: cerebraal i.p.v. intuïtief).
  - **M5Stack Dial v1.1** ($34,90): ESP32-S3 + 1,28" rond touch + encoder-ring. Exact
    ons concept als kant-en-klaar devkit, maar elke Dial is een zelfstandige computer
    (WiFi, RFID, RTC) — te duur en te dik voor een multi-knop paneel. Wel: ideaal
    testbed voor UI-graphics (zelfde GC9A01-paneel) en referentie-schema
    (M5_Hardware repo, SKU K130).
  - **Roendi** (Crowd Supply, ~$135/knop, STM32): bewijst de vraag, faalt op prijs.
  - **SmartKnob** (scottbez1, open source): BLDC + haptische detents, ~€60–80/knop
    zelfbouw. Referentie-repo voor een eventuele gemotoriseerde v2.
  - **Guition/Viewe knob-modules**: OEM-versies van het M5Dial-recept, hoge MOQ;
    losse stuks via AliExpress-listings ("ESP32-S3 knob touch LCD").
- **MCU (Mackie Control)** is de-facto maar niet formeel open; reverse-engineered
  docs zijn overal. Beperking: 8 strips, 2×56 tekens LCD → 7 tekens per label.
  Bruikbaar als compatibiliteitslaag, niet als architectuur.
- Host-integratie (parameternamen uit de DAW naar de schermpjes) is 80% van het werk
  van een Roto-achtig product. Aanpak: eerst generieke MIDI-controller bouwen; DAW-
  integratie (Remote Script / Bitwig extension / eigen SysEx) als aparte fase.

### Mechanisch ontwerp (zie macro's)
- **Stapel** (van PCB omhoog): hall-sensor op PCB → luchtspleet ~1,8 mm → diametrale
  ringmagneet (verlijmd in ring) → kogellager (binnenring op pilaar) → bedieningsring
  om lager+magneet → frontplaat met vrijloopgat → display verzonken bovenin de pilaar.
- **Pilaar** heeft een verbrede kop boven het lager (`head_d = paneel-lengte + 3`),
  want het D-vormige paneel is breder dan de lagerboring. Kop moet binnen de
  ring-vrijloop blijven (console-print in macro checkt dit).
- **Chin**: "ronde" TFT's zijn D-vormig — rechte rand waar driver-IC + flex zitten.
  Actief beeld is wél rond. Oplossing in de macro's: zitting = cirkel + tab
  (chin richting flex-sleuf), sierrand (`bezel_t`) erboven met opening = alleen het
  actieve beeld. Chin-maten verschillen per leverancier → parameters `disp_panel_w`
  / `disp_panel_l` NAMETEN per geleverde batch.
- **Sensor off-axis**: sensor kan niet in het hart (daar staat de pilaar). AS5600 aan
  de rand geeft 3–5° sinusvormige afwijking — irrelevant bij relatief gebruik;
  desnoods 64-punts kalibratietabel. MT6701 (SSI) verdient de voorkeur: gedraagt
  zich als SPI-device met eigen CS, dus geen I²C-adresconflict (AS5600 heeft een
  vast adres → 8 stuks op één bus kan niet zonder mux of analoge OUT-truc).
- **Lager**: 2RS-versies nemen, vet uitwassen + licht oliën voor lichte loop; dit
  bepaalt of het "duur" aanvoelt. Vroeg testen.
- **Magneet**: MOET diametraal gemagnetiseerd zijn. Veel goedkope ringmagneten zijn
  axiaal — die werken niet. Supermagnete.de specificeert de richting expliciet.

### Drie maatvarianten
| Variant | Display | Lager | Knop Ø | Toepassing |
|---|---|---|---|---|
| 53 mm | 1,28" GC9A01 240×240 | 6807 (35×47×7) | 53 | desktop, ruim leesbaar |
| **42 mm** | 0,71" GC9D01 160×160 | 6805 (25×37×7) | 42 | **aanbevolen**; 4×4 raster ≈ Roto-formaat; eurorack 3U, 2 hoog per kolom, ~9–10HP |
| 34 mm | 0,71" | 6704 (20×27×4) | 34 | paddestoel-bouw (display > pilaar); te klein voor comfort, params als commentaar in 42mm-macro |

Eurorack: 3U prima; 1U vergeten (Intellijel-venster ~33 mm bruikbaar).

### Elektrische architectuur (voorstel, nog niet gebouwd)
- Bank van 8 knoppen per MCU. ESP32-S3 (of RP2040 met PIO-multi-SPI).
- Displays: gedeelde SPI-bus, CS per display; dirty-region updates (alleen waarde-
  tekst + boog), geen full-frame refresh op 32 stuks tegelijk.
- Sensoren: MT6701 in SSI-mode op dezelfde/tweede SPI-bus, CS per stuk.
- Banken → master (USB-MIDI / eurorack) via UART of SPI.
- "LED-ring" = software: boog langs de displayrand tekenen; bespaart SK6812's.
- Firmware-skelet (RP2040 PIO-SPI, MT6701 uitlezen, kalibratie): NOG TE MAKEN —
  eerste taak in Claude Code.

## 3. Openstaande beslissingen / risico's
1. 42 mm-paneelmaten (`disp_panel_w/l` = 19,5/23,5) zijn SCHATTINGEN — nameten.
2. Lagerloop (wrijving/detentgevoel) is hét productgevoel-risico. Eerst 1 stuk bouwen.
3. ESP32-S3 vs RP2040 per bank: S3 heeft meer SPI-bandbreedte per host, RP2040 heeft
   PIO (meer parallelle bussen). Beslissen na bandbreedtetest met 8 displays.
4. Push-functie (ring indrukken op tactswitch onder het lager): v2.
5. Flex-doorvoer: 90°-vouw door de sleuf; FH12-connector (0,5 mm) op knop-PCB.
6. Host-integratie bewust uitgesteld; eerst generieke MIDI-laag (evt. MCU-compatibel).

## 4. Vervolgstappen (voorgestelde volgorde in Claude Code)
1. Repo-structuur onder MusicBrain (bijv. `ringencoder/`): `cad/` (macro's),
   `hw/` (KiCad knop-PCB + bank-PCB), `fw/` (firmware), `docs/` (deze bestanden).
2. Eén 42 mm-knop fysiek bouwen (onderdelen: zie SOURCING.md) — lagerloop + chin-fit
   valideren, macro-parameters bijwerken met gemeten waardes.
3. Firmware-skelet: display-driver (GC9D01), MT6701-SSI, kalibratie, USB-MIDI CC.
4. Knop-PCB in KiCad (MT6701 + FPC-connector + doorvoer), dan bank-PCB (8×).
5. UI-experimenten desnoods parallel op een M5Dial (zelfde GC9A01-familie).
