# Quad DAC Breakout Board — AD5754R

Minimal Eurorack quad-DAC breakout board around the Analog Devices AD5754R.
Designed for the MusicBrain modular synthesizer system.

## Features

- **AD5754R** — Quad 16-bit DAC with internal 2.5V reference
- **Bipolar ±5V output** (hardware-selectable: ±5V, ±10V, 0–10V)
- **SPI interface** (SCLK, MOSI, MISO, CS) — direct to Teensy 4.1 or any SPI master
- **Eurorack power** — +12V / -12V analog rails, +3.3V digital
- **4x CV outputs** with 47Ω short-circuit protection resistors
- **LDAC tied to GND** — outputs update immediately on CS rising edge
- **CLR pulled to +3.3V** via 10kΩ — safe state, no accidental output clearing

## Pinout

### J1 — Power + SPI Input (2×5 pin header, 2.54mm)

| Pin | Signal | Direction        |
|-----|--------|------------------|
| 1   | +12V   | Power in (AVDD)  |
| 2   | -12V   | Power in (AVSS)  |
| 3   | +3.3V  | Power in (DVCC)  |
| 4   | GND    | Ground           |
| 5   | MOSI   | SPI (SDIN)       |
| 6   | GND    | Ground           |
| 7   | SCK    | SPI (SCLK)       |
| 8   | MISO   | SPI (SDO)        |
| 9   | CS     | SPI (SYNC)       |
| 10  | GND    | Ground           |

### J2 — CV Outputs (1×4 pin header, 2.54mm)

| Pin | Signal |
|-----|--------|
| 1   | VOUT_A (Channel A) |
| 2   | VOUT_B (Channel B) |
| 3   | VOUT_C (Channel C) |
| 4   | VOUT_D (Channel D) |

## Schematic Overview

```
  ┌────────────────────────────────────────────────────────────┐
  │  J1 (Power+SPI)                                           │
  │  +12V ──┬──────► C1(10µF) + C2(0.1µF) ──► U1.24 (AVDD)   │
  │  -12V ──┼──────► C3(10µF) + C4(0.1µF) ──► U1.1  (AVSS)   │
  │  +3.3V ─┤                                               │
  │         │         +3.3V                                   │
  │         │           │                                     │
  │         │          R1(10kΩ)                                │
  │         │           │                                     │
  │         │     ┌─────┴──────► U1.19 (CLR)                  │
  │         │     │              U1.12 (DVCC) ──► C5(0.1µF)   │
  │         │     │              U1.18 (LDAC) ──► GND         │
  │         │     │                                           │
  │  MOSI ──┼─────┴──────► U1.16 (SDIN)                      │
  │  SCK  ──┼────────────► U1.14 (SCLK)                      │
  │  MISO ──┼────────────► U1.15 (SDO)                       │
  │  CS   ──┼────────────► U1.17 (SYNC)                      │
  │  GND  ──┴────────────► U1.2/10/11/13/21/23 (GND)        │
  │                                                           │
  │  U1.22 (REFIN/REFOUT) ──► C6(0.1µF) ──► GND              │
  │                                                           │
  │  U1.3  (VOUT_A) ──► R2(47Ω) ──► J2.1                    │
  │  U1.4  (VOUT_B) ──► R3(47Ω) ──► J2.2                    │
  │  U1.8  (VOUT_C) ──► R4(47Ω) ──► J2.3                    │
  │  U1.9  (VOUT_D) ──► R5(47Ω) ──► J2.4                    │
  └────────────────────────────────────────────────────────────┘
```

## Bill of Materials (BOM)

| Ref | Qty | Value          | Package    | Description                          | LCSC Part #      |
|-----|-----|----------------|------------|--------------------------------------|------------------|
| U1  | 1   | AD5754R        | TSSOP-24   | Quad 16-bit DAC, internal ref        | C382643          |
| C1  | 1   | 10µF 25V       | 0805       | Ceramic MLCC (AVDD bulk)             | C15850           |
| C2  | 1   | 0.1µF 50V      | 0805       | Ceramic MLCC (AVDD HF)               | C28233           |
| C3  | 1   | 10µF 25V       | 0805       | Ceramic MLCC (AVSS bulk)             | C15850           |
| C4  | 1   | 0.1µF 50V      | 0805       | Ceramic MLCC (AVSS HF)               | C28233           |
| C5  | 1   | 0.1µF 50V      | 0805       | Ceramic MLCC (DVCC)                  | C28233           |
| C6  | 1   | 0.1µF 50V      | 0805       | Ceramic MLCC (REFIN/REFOUT)          | C28233           |
| R1  | 1   | 10kΩ           | 0805       | CLR pull-up to +3.3V                 | C17414           |
| R2  | 1   | 47Ω            | 0805       | VOUT_A short-circuit protection      | C25111           |
| R3  | 1   | 47Ω            | 0805       | VOUT_B short-circuit protection      | C25111           |
| R4  | 1   | 47Ω            | 0805       | VOUT_C short-circuit protection      | C25111           |
| R5  | 1   | 47Ω            | 0805       | VOUT_D short-circuit protection      | C25111           |
| J1  | 1   | 2×5 pin header | TH 2.54mm  | Power + SPI input                    | C124407          |
| J2  | 1   | 1×4 pin header | TH 2.54mm  | CV output                            | C124365          |

> **Note**: LCSC part numbers are suggestions — verify stock and availability before ordering. The AD5754R (C382643) may be backordered; the AD5754 (non-R, C1557109) + external ADR421 reference (C267542) is a fallback.

## Board Specifications

| Parameter        | Value          |
|------------------|----------------|
| Dimensions       | 90mm × 90mm    |
| Layers           | 2 (top + bottom) |
| Thickness        | 1.6mm FR4      |
| Min track/space  | 0.2mm / 0.2mm  |
| Min via          | 0.8mm / 0.4mm  |
| Copper weight    | 1oz (35µm)     |
| Surface finish   | HASL (lead-free) |

## JLCPCB Assembly (PCBA) Setup

1. **Generate Gerbers**: Use the KiCad `FabricationToolkit` plugin or `File → Fabrication Outputs → Gerbers`
2. **Generate BOM**: Export as CSV — map each component to its LCSC part number
3. **Generate CPL (Pick & Place)**: `File → Fabrication Outputs → Component Placement (.pos)`
4. **Upload to JLCPCB**: Select "SMT Assembly" and upload the 3 files
5. **Choose assembly side**: Top side only (all components on top layer)
6. **Confirm rotations**: JLCPCB's preview will show component orientations — verify the TSSOP-24 pin 1 indicator

### Cost Estimate (5 boards, 2 assembled)

- 5× PCB (90×90mm, 2-layer): ~$5
- 2× PCBA (AD5754R + 12 passives): ~$30–50
- **Total**: ~$35–55 (excluding shipping)

## Teensy 4.1 Wiring

```cpp
// Pin mapping for SPI
const int DAC_CS   = 10;  // J1.9 → Teensy Pin 10
// MOSI → J1.5 → Teensy Pin 11
// MISO → J1.8 → Teensy Pin 12
// SCK  → J1.7 → Teensy Pin 13
```

See the firmware driver in `firmware/hal/` for the complete AD5754R SPI initialization code.

## Design Decisions

- **Unified ground plane**: All AGND/DGND pins tied together. On a board this small, split planes cause more noise than they prevent.
- **LDAC to GND**: Immediate update on CS↑. No software latch needed.
- **CLR to +3.3V**: The CLR pin is active-low; pulling it high prevents accidental output zeroing.
- **0805 passives**: Large enough for hand rework, small enough for dense layout.
- **No external reference**: AD5754R has internal 2.5V reference — one less IC to place.

## Known Limitations

- The AD5754R needs ±12V minimum for bipolar output ranges. If your Eurorack supply dips below ±11.4V, outputs may clip.
- The 47Ω output resistors limit short-circuit current to ~100mA at ±5V. For sustained shorts, the resistor may heat up — consider 100Ω if this is a concern.
- No output filtering — the DAC's 10µs settling time is fast enough for CV but may produce audible steps if used directly for audio.