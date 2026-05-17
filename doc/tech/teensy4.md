# Teensy 4.x (NXP iMXRT1062)

## What it is
A family of microcontroller dev boards by PJRC, based on the NXP **iMXRT1062** Cortex‑M7 SoC.

| Board | Clock | RAM | Flash | Notable |
|---|---|---|---|---|
| Teensy 4.0 | 600 MHz | 1 MB OCRAM | 2 MB QSPI | small footprint, 40 GPIO |
| Teensy 4.1 | 600 MHz | 1 MB OCRAM (+ 8 MB external opt.) | 8 MB QSPI | Ethernet, microSD, more GPIO, USB host |

Programmed via **Teensyduino** (Arduino fork) or PlatformIO. C++17 supported out of the box.

## Why we use it (ADR 0001)
- Fastest mainstream MCU you can solder by hand, with FPU and SIMD.
- Polished USB stack: USB‑MIDI, USB‑Serial, USB‑Audio classes work without writing descriptors.
- PJRC **Audio Library** ships ready‑made objects for ADC capture, FFT, autocorrelation pitch detect — directly useful for the oscillator tuner in project 3.
- Mature, single‑process model with no OS → deterministic latency (project 3 needs ≤ 5 ms, ADR 0008).
- Eight hardware SPI buses on the 4.1 — comfortable for the breakout fabric.

## What matters for MusicBrain
- **Pin clocks/CS**: each SPI breakout gets its own CS line; one SPI peripheral can comfortably drive 8–16 slaves.
- **USB host port** (4.1 only): lets the brain accept USB‑MIDI controllers directly without a PC.
- **No hardware CAN‑FD**: use an external transceiver (MCP2517FD / TCAN4550) on SPI if a bridge node ever runs on a Teensy. RP2040 has no CAN‑FD hardware either — see ADR 0006.
- **No WiFi/BT**: hence the ESP32 side car.

## Gotchas
- Closed bootloader chip (NXP Kinetis MKL02). Code is open, the loader is not — but PJRC distributes the loader freely; it does not affect licence choice for our firmware.
- `Serial` (USB‑CDC) and `MIDI` (USB‑MIDI) are *two different USB interfaces* selected at compile time via Tools → USB Type in Teensyduino, or `-DUSB_*` in PlatformIO. You can pick "Serial + MIDI" to get both.
- Teensy 4.x runs at 3.3 V; **not** 5 V tolerant on most pins. Level‑shift MIDI DIN inputs.
- Power: at 600 MHz it draws ~100 mA and warms up. A heatsink is recommended in enclosures.

## Links
- https://www.pjrc.com/teensy/
- https://www.pjrc.com/teensy/td_libs_Audio.html
- https://github.com/PaulStoffregen
