# ADR 0001 – MCU family per project

## Status
Accepted (2026-05-17)

## Context
We need to pick microcontrollers for:
- the realtime "Brain" of each of the three subprojects;
- the SPI breakout boards in project 3;
- an optional wireless/Ethernet "side car" for connectivity.

The maintainer has prior Teensy experience, owns several STM32 "Blue Pill" boards, has limited RP2040 exposure, and is comfortable using an ESP32 as a side car.

## Decision
- **Realtime brain, project 3 (modular synth):** Teensy 4.1.
- **Realtime brain, projects 1 & 2 (switchers):** Teensy 4.0 / LC *or* RP2040 (Pico) — whichever is cheaper/at hand for a given build. Both are supported by the shared `core/` library through `hal/`.
- **SPI breakout boards (project 3):** RP2040 by default; STM32F103 ("Blue Pill") accepted as an alternative when boards are at hand. PIO on RP2040 is attractive for the SPI-slave + S&H/mux timing.
- **Connectivity side car:** ESP32 / ESP32-S3, talking to the brain over UART or SPI. Never the central brain (WiFi/BT jitter would compromise realtime).

## Consequences
- The `hal/` layer must abstract at least: GPIO, SPI master/slave, UART, USB device (MIDI + serial), flash storage, and a tick source. Initial targets: Teensy 4.x, RP2040, STM32F1.
- All firmware is C++17 (Teensyduino, Arduino-Pico, and STM32 ArduinoCore all support it).
- The ESP32 link is its own protocol (see ADR 0006); the brain treats it as just another `Transport`.
- We avoid vendor-lock features in `core/`; vendor SDKs only appear in `hal/<target>/`.
