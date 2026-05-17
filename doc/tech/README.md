# Technology briefs

Short, project-focused summaries of the technologies MusicBrain depends on. Each file answers: *what is it*, *why we picked it*, *the parts that matter here*, and *gotchas*. Not exhaustive — links at the bottom of each page point to the canonical docs.

## Hardware / MCUs
- [Teensy 4.x](teensy4.md) — main realtime brain.
- [RP2040](rp2040.md) — small brain & most breakouts.
- [ESP32 / ESP32‑S3](esp32.md) — WiFi / BLE side car.
- [STM32F1 "Blue Pill"](stm32f1.md) — cheap prototyping & bridge node candidate.

## Buses & wire protocols
- [SPI](spi.md) — in‑case bus brain ↔ breakouts.
- [CAN‑FD](can-fd.md) — inter‑case bus.
- [RS‑485](rs485.md) — CAN‑FD fallback.
- [MIDI (DIN, USB‑MIDI, BLE‑MIDI)](midi.md) — input + program change.
- [CRC‑16/CCITT](crc16-ccitt.md) — frame integrity.

## Analog stage
- [DAC + S&H + CD4051 multiplexer](dac-sh-mux.md) — per‑channel CV output topology.

## Editor / connectivity
- [JSON‑RPC 2.0](json-rpc.md) — editor ↔ device API.
- [WebSockets](websockets.md) — streaming transport from the side car.
- [WebSerial](webserial.md) — USB transport from the browser.
- [mDNS / Zeroconf](mdns.md) — local network discovery.

## Storage / data
- [CBOR (RFC 8949)](cbor.md) — on‑device binary patch format.
- [LittleFS](littlefs.md) — on‑chip flash filesystem.

## Languages / tooling
- [C++17 for embedded](cpp17.md) — what we use and what we avoid.
- [CMake (host build)](cmake.md) — for `core/` tests + simulator.
- [PlatformIO](platformio.md) — multi‑target firmware builds.
- [React + Vite + TypeScript](react-vite-ts.md) — editor stack.
