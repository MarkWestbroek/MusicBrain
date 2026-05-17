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

| Pin (ESP32 DevKitC) | 74HC595        | Notes                       |
|---------------------|----------------|-----------------------------|
| 3V3 / 5V            | VCC            | Match relay-board logic     |
| GND                 | GND            |                             |
| GPIO 18 (SCK)       | SRCLK          | SPI clock                   |
| GPIO 23 (MOSI)      | SER            | Serial data                 |
| GPIO 5              | RCLK (LATCH)   | Configurable in `relays.cpp`|
| —                   | OE (active-low)| Tie to GND if not needed    |

Two 74HC595s daisy-chained give 16 relays = the editor's default `relayCount`.
For other relay boards, rewrite `Relays::begin` / `Relays::setMask`; the rest
of the firmware never touches GPIO directly.

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
