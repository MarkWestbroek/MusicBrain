# Twee Teensies aan één computer — dev-setup & CV/audio-split

> Praktische gids voor het gelijktijdig ontwikkelen op twee Teensy 4.1-boards
> (de CV-Teensy = "brain"/SPI-master en de audio-Teensy = "instrument"/SPI-slave),
> plus de firmware- en API-kant van het rol-onderscheid.
> Zie ook `doc/uml/08-core-runtime-hierarchy.md` (dCV-bus + split-plan) en
> `doc/tech/spi.md`.

---

## 1. Twee boards tegelijk aangesloten — kan dat?

Ja, dit is een normale, veilige workflow. Niets in de opzet maakt het onverstandig
of onmogelijk.

### USB / poorten
- Elke Teensy 4.1 enumereert als een **eigen USB-apparaat met een eigen COM-poort**
  (bijv. `COM4` en `COM5`).
- Voeding van twee Teensies (+ audioboard) via een USB-hub is prima; bij twijfel een
  hub met eigen voeding.

### Welke poort is welke board?
Auto-detect kan het verkeerde board kiezen. Pin daarom **per project de poort vast**
in `platformio.ini`:

```ini
; CV-Teensy project
[env:teensy41]
upload_port  = COM4
monitor_port = COM4
```

```ini
; audio-Teensy project
[env:teensy41]
upload_port  = COM5
monitor_port = COM5
```

Twijfel je welke poort welk board is? De Teensy Loader toont het bij een
PROGRAM-druk, of unplug/replug en kijk welke COM-poort verdwijnt.

### Gelijktijdig ontwikkelen
- Twee aparte PlatformIO-projecten/omgevingen (of twee `-d`-dirs). Bouwen/flashen
  gaat onafhankelijk met aparte `--upload-port`.
- **Eén ding tegelijk per poort:** de VS Code Serial Monitor kan maar één poort
  vasthouden, en bij upload moet de monitor van díe poort los zijn (zoals al bekend
  voor COM4). Voor twee boards: aparte monitor-vensters/poorten, en bij flashen de
  monitor van het betreffende board sluiten.

### Bedrading voor de SPI-link
De twee Teensies delen **massa (GND)** en de SPI-lijnen **MOSI / MISO / SCK / CS**.
Eén is master (CV-Teensy, `CvBreakout` → TX), één is slave (audio-Teensy, RX →
`CvBreakIn::onFrame()`).

---

## 2. Is de firmware identiek voor beide Teensies?

**Bewuste keuze, nog te maken.** Vandaag is er één firmware-image
(`app-modular-brain`). Voor de split zijn er twee levensvatbare modellen:

### Model A — één image, rol via configuratie/API (aanbevolen)
Hetzelfde binary draait op beide boards. Een runtime-rol bepaalt wat elk board doet:

| Rol | Betekenis | SPI | dCV-richting |
|-----|-----------|-----|--------------|
| `master` (brain) | bron van CV/gate, draait de generators/envelopes | SPI-master, `SPI.begin()` | zendt via `CvBreakout` |
| `slave` (instrument) | ontvangt CV/gate, stuurt de audio-modules | SPI-slave + RX-ISR | ontvangt via `CvBreakIn` |

Voordelen: één build, uniforme OTA/flash, rol instelbaar via de bestaande
JSON-config / API. De **patch-distributie** (welke modules op welk board) is hier
orthogonaal aan de rol: het is gewoon welk deel van de project-JSON elk board laadt.

### Model B — twee builds via PlatformIO-omgevingen
Compile-time-vlag (`-D MB_ROLE_MASTER` / `-D MB_ROLE_SLAVE`). Kleiner image en
simpeler ISR-bedrading, maar twee artefacten om bij te houden.

**Aanbeveling:** Model A. De modules veranderen sowieso niet — alle routing loopt al
via `readCvPort` / `writeCvPort`. Alleen het *transport* (in-proces ↔ SPI) en de
*SPI-rol* (master vs slave) verschillen, en die zijn precies wat je via config wilt
zetten.

---

## 3. Rol instellen via configuratie / API

Ja. Voorgesteld ontwerp, passend bij de bestaande config-flow:

- Voeg een top-level veld toe aan de project/config-JSON, bijv.:
  ```jsonc
  {
    "role": "master",        // "master" | "slave"  (default "master")
    "spi": { "caseId": 0 }   // basis-adres voor dCV-kanalen op dit board
  }
  ```
- `ProjectRuntime::applyConfig()` leest `role` en initialiseert de SPI-laag
  dienovereenkomstig (`master` → `SPI.begin()` + `CvBreakout`-sink; `slave` →
  SPI-slave + RX-ISR die `CvBreakIn::onFrame()` voedt).
- **Let op — rol moet bekend zijn vóór de host verbindt.** SPI-master- en
  slave-init verschillen op hardware-niveau (klok, ISR). Persisteer de rol daarom
  op LittleFS (zoals de actieve patch), zodat het board zijn rol al bij boot kent
  en niet pas na de eerste host-config. De API kan de rol wel *herschrijven*
  (gevolgd door een herstart van de SPI-laag of een reboot).

Zo blijft de distributie volledig data-gestuurd: je kiest in de editor welk board
welke modules draait en welk board master is, pusht de config, en de firmware
schakelt het transport om — zonder hercompilatie.

### Per-module distributie: het `host`-veld

Naast de board-rol (`master`/`slave`) bepaalt een **`host`-veld per module** op
welke Teensy die module draait:

- `host` **afwezig** → module draait op deze (master-)Teensy; in-proces routing,
  geen SPI.
- `host` = naam van een andere Teensy → module draait daar; busadres = `host +
  module-id`. `CvGraph` maakt van zo'n cross-host-verbinding automatisch een
  dCV-bus-route.
- `MidiInModule` kan alleen op de master; elke Teensy mag een eigen `OutModule`
  hebben; de master zoekt de slave(s) op zodra ze in de patch voorkomen.

Volledige uitwerking (adres-model, BO/BI als externe modules mét adres, en het
gecorrigeerde split-diagram) staat in
[`doc/uml/08-core-runtime-hierarchy.md`](../uml/08-core-runtime-hierarchy.md) §3–§5.
De SPI-hardwarekant (ster vs. daisy-chain, MOSI/MISO, bus-monitor) staat in §6
van datzelfde document.

---

## 4. Status

| Onderdeel | Status |
|-----------|--------|
| `SpiFrame` proto (encode/decode + CRC) | ✅ host-getest |
| `CvBreakout` (TX-encode) / `CvBreakIn` (RX-decode) | ✅ host-getest (fw 0.5.5) |
| Echte Teensy SPI-master-driver (`SpiBreakoutSink`) | ⬜ hardware-gebonden |
| SPI-slave RX-ISR die `onFrame()` voedt | ⬜ hardware-gebonden |
| `role`-veld in config + `applyConfig`-schakelaar | ⬜ volgende stap |
