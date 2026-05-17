# STM32F1 "Blue Pill"

## What it is
**STM32F103C8T6** on a tiny ~€2 board: Cortex‑M3 @ 72 MHz, 20 KB SRAM, 64 KB flash (often actually 128 KB on real chips). De facto "hello world" board for the STM32 family.

Toolchains: **STM32CubeIDE** (official, HAL/LL libraries) or PlatformIO with the `Arduino_Core_STM32` or `libopencm3` core.

## Why we use it (ADR 0001)
- The maintainer already has several lying around → free prototyping.
- Useful for small SPI‑slave breakouts or as a bridge‑node candidate where its **hardware bxCAN** peripheral (classic CAN, *not* CAN‑FD) is enough.
- A learning ramp to bigger STM32 parts (F4/G4/H7) if we ever need them.

## What matters for MusicBrain
- Plenty of timers, hardware SPI, USART, classic CAN, ADC.
- 3.3 V; tolerates 5 V on several pins (check datasheet per pin).
- Built‑in USB device, can do CDC; class support is more DIY than on Teensy.

## Gotchas
- **Clone chip lottery**: many Blue Pills ship with CKS / CS32 clones instead of genuine ST silicon. Mostly works, occasionally weird (USB pull‑up resistor often wrong: the board ships with 10 kΩ where 1.5 kΩ is required — many "USB doesn't enumerate" stories).
- 64–128 KB of flash limits how much patch bank you can store on‑device. Use an external SPI flash chip or an SD card if you need more.
- No FPU. Software floating point — keep DSP in fixed‑point.
- **bxCAN ≠ CAN‑FD**. If we commit to CAN‑FD trunks (ADR 0006), bridge nodes need STM32G0/G4 (FDCAN) or a separate CAN‑FD controller on SPI.

## Links
- https://www.st.com/en/microcontrollers-microprocessors/stm32f103c8.html
- https://github.com/stm32duino/Arduino_Core_STM32
