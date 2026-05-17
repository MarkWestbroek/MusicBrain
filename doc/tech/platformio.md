# PlatformIO

## What it is
A cross‑platform build/dependency/upload tool for embedded development, built on Python + SCons. One CLI (`pio`) and one config file (`platformio.ini`) cover **2000+ boards** across **40+ vendor toolchains** — Teensy, RP2040, STM32, ESP32, AVR, nRF, you name it.

Conceptually: PlatformIO downloads the right cross‑compiler, the right Arduino/ESP‑IDF/Mbed core, and the libraries you declare, then drives them. You never touch a vendor IDE.

## Why we use it (ADR 0001)
Our firmware spans **four MCU families** (Teensy 4.x, RP2040, STM32F1, ESP32‑S3). Building each with its native toolchain would mean:

- Teensyduino + Arduino IDE for Teensy,
- `pico-sdk` + CMake + arm-none-eabi-gcc for RP2040,
- STM32CubeIDE for STM32,
- ESP‑IDF + idf.py for ESP32.

That's four CI configurations, four onboarding pages, four ways to manage libraries. PlatformIO collapses it to one:

```ini
[env:teensy41-brain]
platform = teensy
board = teensy41
framework = arduino
build_flags = -std=gnu++17 -DMB_TARGET_TEENSY4

[env:rp2040-fxsw]
platform = raspberrypi
board = pico
framework = arduino
build_flags = -std=gnu++17 -DMB_TARGET_RP2040

[env:stm32f103-breakout]
platform = ststm32
board = bluepill_f103c8
framework = arduino
build_flags = -std=gnu++17 -DMB_TARGET_STM32F1

[env:esp32s3-sidecar]
platform = espressif32
board = esp32-s3-devkitc-1
framework = arduino
build_flags = -std=gnu++17 -DMB_TARGET_ESP32S3
```

`pio run -e teensy41-brain` builds. `-t upload` flashes. `-t monitor` opens a serial console.

## What we get for free
- **Library Registry** (`lib_deps = bblanchon/ArduinoJson@^7`) — versioned, lock‑file behaviour.
- **Per‑env build flags** — same source compiles under `MB_TARGET_*` macros.
- **CI**: a single GitHub Actions job iterates over envs.
- **OTA** for ESP32 with one config line.
- **Unit testing** via `pio test` (we use it sparingly; host tests run under CMake).

## What matters for MusicBrain
- One `platformio.ini` lives at the repo root, with one env per firmware target plus a `[common]` section for shared flags.
- Source layout: `src/` per app folder under `firmware/app-*` and `firmware/breakouts/*`; `lib/` symlinks (or `lib_extra_dirs`) into `firmware/core` and the right HAL.
- All builds enable `-fno-exceptions -fno-rtti` per the C++17 page.

## Gotchas
- The library registry occasionally has outdated forks of upstream libraries; pin versions and audit before adding.
- ESP‑IDF mode inside PlatformIO lags behind upstream IDF releases — fine for our usage but watch the version.
- `lib_deps` resolves transitively; conflicting transitive versions can silently downgrade. Use `pio pkg list` to verify.
- Avoid mixing Arduino + ESP‑IDF frameworks in the same env unless you really need to; it works but error messages get cryptic.
- `pio` requires Python ≥ 3.6 on PATH at install time.

## Links
- https://docs.platformio.org/
- https://docs.platformio.org/en/latest/projectconf/index.html
