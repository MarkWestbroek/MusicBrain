# ESP32 / ESP32‑S3

## What it is
Xtensa (ESP32 classic, ESP32‑S2/S3) or RISC‑V (ESP32‑C3/C6) SoC by Espressif. Integrates **WiFi (2.4 GHz b/g/n)** and most variants also **Bluetooth LE**. Dual core on classic + S3, single core on S2/C3. ~520 KB SRAM, external flash (4–16 MB typical).

| Variant | Core | WiFi | BLE | Notes |
|---|---|---|---|---|
| ESP32 (classic) | 2× Xtensa LX6 | yes | BT Classic + BLE | mature, cheap |
| ESP32‑S3 | 2× Xtensa LX7 | yes | BLE 5 | USB‑OTG, vector DSP, **our default** |
| ESP32‑C3 | 1× RISC‑V | yes | BLE 5 | single‑core, smallest |
| ESP32‑C6 | 1× RISC‑V | yes (incl. WiFi 6) | BLE 5 + 802.15.4 | newer |

Toolchains: **ESP‑IDF** (official, FreeRTOS‑based) or **Arduino‑ESP32** (built on top of IDF).

## Why we use it (ADR 0001, 0002)
- Only as a **side car** for connectivity — never as the realtime brain. The WiFi/BT radio stack causes hard‑to‑predict latency spikes that are incompatible with the project 3 timing budget.
- Hosts a small HTTP + WebSocket server so the React editor can talk to the device over the network.
- Provides **BLE‑MIDI** as a wireless control surface for phones/tablets (recognised natively by iOS, macOS, Win 11, modern Android).

## What matters for MusicBrain
- **Connection to the brain**: UART (simplest) or SPI (faster). The brain sees the side car as just another `ITransport`.
- **HTTP + WebSocket**: ESP‑IDF `esp_http_server` and `esp_websocket_server`, or Arduino libraries like `ESPAsyncWebServer`. Comfortable serving a few hundred KB of static assets from LittleFS/SPIFFS — but per ADR 0002 we prefer to host the React app externally and only expose an API here.
- **mDNS**: built‑in, lets the editor discover `musicbrain.local` without typing IPs.
- **OTA updates**: standard, useful for the side car firmware itself.

## Gotchas
- **TLS eats RAM**: a few simultaneous TLS sockets is the realistic ceiling. Plain HTTP on a trusted local network is usually fine.
- **WiFi connect time** is 1–3 s on cold boot; design the UI to tolerate "side car not ready yet".
- **BLE‑MIDI throughput** is limited (~3 ms connection interval typical). Fine for note/CC/program‑change, **not** for streaming high‑rate CV.
- Arduino‑ESP32 API surface differs subtly between major versions (2.x → 3.x). Pin a version in PlatformIO.
- Power: WiFi TX bursts to ~250 mA; size the regulator accordingly.

## Links
- https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/
- https://github.com/espressif/arduino-esp32
- https://www.bluetooth.com/specifications/specs/midi-services/ (BLE‑MIDI)
