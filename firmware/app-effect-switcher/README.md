# Project 1 — Effect-pedal switcher

See [doc/Requirements.md §1](../../doc/Requirements.md), [doc/Plan.md §2](../../doc/Plan.md), and ADRs [0001](../../doc/adr/0001-mcu-choice.md), [0003](../../doc/adr/0003-project1-ui.md).

## Plan
- Target: Teensy 4.0 / LC or RP2040 Pico.
- Outputs: N latching relays via 74HC595 / TPIC6B595 chain on SPI.
- Inputs: 2 footswitches + MIDI Program Change (USB-MIDI + DIN-MIDI in).
- Display: 16×2 LCD or 1.3" OLED showing program number + name.
- Config: remote via React/TS editor (ADR 0002), USB-CDC primary, optional WiFi via ESP32 side car.

## Patch schema (project-specific blob)
```
EffectPatch {
  loops: bitmask<N>     // 1 = engage pedal in loop, 0 = bypass
  // future: ordering / parallel hints / mixer levels
}
```

To be implemented in roadmap stage 2.
