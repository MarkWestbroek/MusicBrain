# `hal/` – per-target Hardware Abstraction Layer

Each subdirectory provides concrete implementations of the abstract interfaces in `firmware/core/`:

| Target | Status | Notes |
|---|---|---|
| `host/`     | implemented (stub level) | Compiles on PC; powers `tools/simulator` and tests. |
| `teensy4/`  | placeholder              | Teensy 4.0 / 4.1 via PlatformIO + Teensyduino. |
| `rp2040/`   | placeholder              | Pico SDK or Arduino-Pico. |
| `stm32f1/`  | placeholder              | Blue Pill prototypes via STM32CubeIDE / PlatformIO. |

Vendor SDK headers and tool configuration must live **inside** the target directory; `core/` must never include vendor headers (ADR 0001, ADR 0007).
