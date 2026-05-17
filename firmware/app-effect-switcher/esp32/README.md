# Effect-switcher firmware — ESP32 build

This subfolder is a **PlatformIO** project that turns a generic ESP32 board
into the runtime for the MusicBrain effect switcher. It is intentionally
self-contained: the React editor in [`editor/`](../../../editor/) talks to
this firmware over plain HTTP/JSON.

```
firmware/app-effect-switcher/esp32/
├── platformio.ini          ← board + library configuration
├── src/
│   ├── main.cpp            ← WiFi + REST API + glue
│   ├── relays.{h,cpp}      ← 74HC595 shift-register driver
│   ├── storage.{h,cpp}     ← LittleFS persistence
│   ├── patch_engine.{h,cpp}← pure logic: JSON config → relay bitmask
│   └── secrets.h.example   ← copy to secrets.h and add your WiFi creds
└── data/                   ← (optional) LittleFS image source
```

## 1. Hardware

### 1.1 Pin map

| Pin (ESP32 DevKitC) | 74HC595        | Notes                       |
|---------------------|----------------|-----------------------------|
| 3V3 / 5V            | VCC            | Match relay-board logic     |
| GND                 | GND            |                             |
| GPIO 18 (SCK)       | SRCLK          | SPI clock                   |
| GPIO 23 (MOSI)      | SER            | Serial data                 |
| GPIO 5              | RCLK (LATCH)   | Configurable in `relays.cpp`|
| —                   | OE (active-low)| Tie to GND if not needed    |
| —                   | MR / SRCLR     | Tie to VCC (active-low)     |

Two 74HC595s daisy-chained give 16 relays = the editor's default `relayCount`.
For other relay boards, rewrite `Relays::begin` / `Relays::setMask`; the rest
of the firmware never touches GPIO directly.

### 1.2 Wiring diagram (16-relay setup)

```
   ESP32 DevKitC                  74HC595 #1 (R1..R8)           74HC595 #2 (R9..R16)
  ┌──────────────┐               ┌──────────────────┐          ┌──────────────────┐
  │              │               │  VCC ─── +5V     │          │  VCC ─── +5V     │
  │  3V3 / 5V ───┼──── +5V ────▶ │  GND ─── GND     │          │  GND ─── GND     │
  │  GND      ───┼──── GND ────▶ │  MR  ─── VCC     │          │  MR  ─── VCC     │
  │              │               │  OE  ─── GND     │          │  OE  ─── GND     │
  │  GPIO 23  ───┼──── SER ────▶ │  DS  (pin 14)    │          │  DS  (pin 14)    │
  │  (MOSI)      │               │                  │          │       ▲          │
  │              │               │  Q7' (pin 9)  ───┼──────────┘       │          │
  │  GPIO 18  ───┼──── SRCLK ──▶ │  SH_CP (pin 11)  │ ────────────────▶│ SH_CP    │
  │  (SCK)       │               │                  │                  │          │
  │  GPIO  5  ───┼──── RCLK  ──▶ │  ST_CP (pin 12)  │ ────────────────▶│ ST_CP    │
  │              │               │                  │                  │          │
  └──────────────┘               │  Q0..Q7 ─▶ relay-board IN1..IN8     │  Q0..Q7 ─▶ IN9..IN16
                                 └──────────────────┘                  └──────────────────┘
                                          │                                     │
                                          ▼                                     ▼
                                 ┌─────────────────────────────────────────────────────────┐
                                 │ 16-channel opto-isolated relay board (e.g. SONGLE 5V)   │
                                 │ Common VCC = +5V, common GND tied to ESP32 GND          │
                                 │ Each channel: NO / NC / COM to your effect-loop send    │
                                 └─────────────────────────────────────────────────────────┘
```

> The lines from ESP32 → 74HC595 #1 are 3.3 V logic. 74HC595 accepts that
> at any VCC between 2 V and 6 V, so a 5 V relay board still gets driven
> correctly. If you use 3.3 V coil relays you can skip the level mismatch
> entirely and run everything on 3V3.

### 1.3 Hardware shopping list

| Item | Why |
|---|---|
| **ESP32 DevKitC** (WROOM-32 or S3) | The brain |
| **2× 74HC595** | Shift-register chain → 16 GPIOs from 3 pins |
| **16-channel opto-isolated relay board** (5V coils) | Switches the audio loops; opto-isolation prevents the relay back-EMF reaching the ESP32 |
| **5 V / ≥2 A PSU** | A 16-coil relay board pulls ~70 mA per energised relay |
| **2× 0.1 µF ceramic + 1× 10 µF electrolytic** per 74HC595 | Decoupling on VCC↔GND, right at the chip |
| **0.25 W flyback diodes** | Already on most relay boards; if yours doesn't have them, add 1N4007 across each coil |
| Optional: **SSD1306 0.96″ I²C OLED** | Status display on GPIO 21/22 — not yet wired in the firmware |
| Optional: **TRS / 1/4″ jacks + screw terminals** | One jack pair per audio loop |
| USB-A → micro/USB-C cable | For first flash + serial monitor |

A small TODO worth knowing: the firmware does not yet drive an OLED. The
display fields in `EditorSimulationPanel` (`MusicBrain` / status line) map
to the `IDisplay` interface from the core lib — wiring an SSD1306 is just
implementing `IDisplay::show(line1, line2)` and instantiating it next to
`Relays`.

> 💡 **No relay board on hand?** The firmware boots fine without one — the
> shift-register writes just go into nowhere. You can use the serial monitor
> to see relay-mask changes (look for `[patch] active=... mask=...`).

## 2. One-time toolchain install

1. Install [VS Code](https://code.visualstudio.com/) and the
   **PlatformIO IDE** extension. PlatformIO bundles the full ESP32 toolchain
   on first build — no manual SDK install needed.
2. Plug in the ESP32 over USB. On Windows you may need the
   [CP210x](https://www.silabs.com/developer-tools/usb-to-uart-bridge-vcp-drivers)
   or CH340 driver depending on the dev board.

CLI alternative (no VS Code):
```powershell
pip install --user platformio
```

## 3. Configure WiFi

```powershell
Copy-Item src\secrets.h.example src\secrets.h
notepad src\secrets.h
```
Set `MB_WIFI_SSID` and `MB_WIFI_PASSWORD` (and optionally a hostname).
`secrets.h` is in `.gitignore` so your credentials never get committed.

## 4. Build & upload

From this folder (`firmware/app-effect-switcher/esp32/`):

```powershell
# Build for the default ESP32 (WROOM-32) board
pio run

# Upload firmware over USB
pio run -t upload

# Watch the serial monitor (Ctrl-T then Ctrl-X to quit)
pio device monitor
```

For an **ESP32-S3** dev board, append `-e esp32-s3` to every command:

```powershell
pio run -e esp32-s3 -t upload
```

On a successful boot you should see something like:

```
MusicBrain effect-switcher v0.1.0
[storage] LittleFS mounted, 0 / 1441792 bytes used
[config] no stored config — waiting for PUT /api/config
[wifi] connecting to 'YourSSID' ........
[wifi] OK  ip=192.168.1.42  rssi=-58
[mdns] http://musicbrain.local/
[http] listening on :80
```

## 5. Try the REST API

```powershell
# device status
curl http://musicbrain.local/api/status

# push a freshly-exported editor JSON to the device
curl -X PUT --data-binary "@musicbrain-config.json" `
     -H "Content-Type: application/json" `
     http://musicbrain.local/api/config

# switch to MIDI patch 3
curl -X POST http://musicbrain.local/api/patch/3

# cycle to the next patch (great for a footswitch)
curl -X POST http://musicbrain.local/api/patch/next
```

Full endpoint list is documented at the top of [`src/main.cpp`](src/main.cpp).

## 6. Simulator integration (planned)

The editor's **Simulation** tab currently runs in pure JavaScript. The plan
for the next round is:

* Add a "Connect to device" panel (IP / mDNS hostname input).
* When connected, the **Activate patch** action also fires
  `POST /api/patch/<id>` so the real relays follow what you see on screen.
* `GET /api/patch` is polled to surface the actual relay state in the UI.

That way the same code path is exercised in simulation and on real hardware,
which is exactly what you asked for ("dat we in de simulatie naar de echte
code gaan").

## 7. OTA updates (optional)

Once the device is reachable on WiFi, you can flash without USB by adding
this to your `platformio.ini` env:

```ini
upload_protocol = espota
upload_port     = musicbrain.local
```

and re-running `pio run -t upload`. Make sure to also include the
`ArduinoOTA` library in `src/main.cpp` if you want OTA enabled — left out of
this skeleton to keep the binary small.

## 8. Web-based flashing (no PlatformIO needed)

For end-users who shouldn't have to install a toolchain, prebuilt firmware
binaries can be flashed straight from a Chromium-based browser using
[**ESP Web Tools**](https://esphome.github.io/esp-web-tools/) — a single
`<esp-web-install-button>` web component that talks to the chip over
WebSerial. The intended setup:

1. CI builds `firmware.bin` + `bootloader.bin` + `partitions.bin` and uploads
   them as a release artefact.
2. A small static page (could live in `editor/public/flash.html` or as a
   GitHub Pages site) embeds the button:
   ```html
   <esp-web-install-button manifest="manifest.json"></esp-web-install-button>
   <script type="module" src="https://unpkg.com/esp-web-tools@10/dist/web/install-button.js?module"></script>
   ```
3. `manifest.json` points at the published `firmware.bin` per chip family
   (esp32, esp32-s3, …). ESP Web Tools handles bootloader handoff, erase,
   and progress UI.

Not implemented yet — see issue ❑ "Stage-7: web flasher" on the backlog.

## 9. How should the editor talk to the device? — USB vs WiFi vs BT

| Transport | Pros | Cons | Recommended for |
|---|---|---|---|
| **WiFi (HTTP)** | Zero cables on stage, mDNS gives `musicbrain.local`, works from phone/tablet, multi-device, browser-friendly | Needs a network or AP mode, ~20–80 ms latency, you have to manage credentials | **Default** — config edit + status from the editor |
| **USB-CDC serial** | Always available, no network setup, can also flash firmware on the same cable | One cable per device, tied to a laptop, JS only via WebSerial (Chromium-only) | First flash, factory provisioning, on-stage emergency recovery |
| **Bluetooth Classic** | Common on phones | Heavy stack on ESP32, no browser support, pairing UX is awkward | ❌ Don't bother |
| **Bluetooth LE** | Lightweight on ESP32, Web Bluetooth in Chromium | Tiny throughput (≤ 20 kB/s realistic), no mDNS-style discovery in browsers — user picks from a chooser dialog every time | Future: small commands only (next/prev patch) — *not* full-config sync |

**Recommendation**: ship WiFi as the primary transport, with USB-CDC as the
fall-back. BLE can come later as a "remote control" channel separate from
the editor connection.

### 9.1 How the user configures it

Out of the box the firmware has no credentials. Three options, in order
of polish:

1. **Today (skeleton)**: edit `src/secrets.h`, re-flash. Trivial for
   developers, awful for end-users.
2. **Next step (planned)**: on first boot — or when the saved network is
   unreachable for 30 s — drop into **SoftAP mode**. The device exposes an
   open WiFi network `MusicBrain-XXXX` (`XXXX` = last 4 of MAC); connecting
   to it auto-opens a captive portal at `http://192.168.4.1/` where the
   user picks an SSID and types a password. The credentials are saved to
   LittleFS and the device reboots into station mode.
3. **Power-user**: provisioning via USB-CDC — a couple of `AT+WIFI` style
   serial commands so a fixed PowerShell/Bash script can configure many
   units in batch.

The editor will get a matching **Settings page**:

* Device URL / mDNS hostname (`musicbrain.local` by default).
* Transport: *Auto* / *WiFi* / *USB (WebSerial)*.
* Optional HTTP Basic auth.
* "Test connection" button → calls `GET /api/status` and shows firmware
  version + uptime.
* "Forget device" to clear the saved hostname.

A small ⚙ gear icon in the editor's top-right opens this — not implemented
yet, captured in the editor backlog.

## 10. About "HTTP per patch change" — clarified

The early sketches mentioned firing `POST /api/patch/<id>` from the editor
*every time you click a patch*. After feedback that this risks the
browser-side config drifting out of sync with the device, the agreed flow
is now:

| Action in the editor | What hits the device |
|---|---|
| Open editor, no device yet | nothing |
| Click ⚙ → **Connect** | `GET /api/status` (handshake + version check) |
| Click **Pull from device** | `GET /api/config` → replace local project |
| Click **Push to device** | `PUT /api/config` → device persists to LittleFS |
| Switch active patch in the UI | **nothing** by default (just local UI) |
| Click **Activate on device** (explicit) | `POST /api/patch/<id>` |
| Periodic (every 5 s while connected) | `GET /api/status` for liveness + active-patch readback |

That keeps "what you see in the editor" and "what's on the device" two
clearly separated states — you push/pull explicitly, the way Git does.
Per-patch POST stays in the API for power-users (curl, MIDI bridges,
external footswitches) but the editor itself never auto-fires it.
