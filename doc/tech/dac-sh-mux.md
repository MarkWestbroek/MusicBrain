# CV output topology: DAC + Sample‑and‑Hold + CD4051 multiplexer

This is the analog scheme drawn in `doc/MIDI to CV.pdf` and adopted for project 3 (ADR 0004). It lets **one DAC drive 8 CV outputs** while each output still looks like a steady analog voltage.

## The chain

```
              +-----+      +-----------+        +---------+
  brain  --->| DAC |-----> |  CD4051   |------> | SMP08 / |---> 8x CV out jack
  (SPI)      +-----+       |  3-to-8   |        | TLC4016 |
                          ^|  analog   |        | S&H bank |
                          |+-----------+        +----+----+
                          |  3-bit                  |
                          |  channel select         |
                          +-------------------------+
                          | INH (inhibit)
```

1. The MCU writes a target voltage to the **DAC**.
2. It selects an output channel by driving the **CD4051**'s 3 address pins + `INH` (active‑low enable).
3. The DAC voltage flows through the mux to **that** sample‑and‑hold cell.
4. The S&H cell's hold capacitor charges to that voltage; the output op‑amp buffers it.
5. The MCU advances to the next channel and writes the next value.

If you cycle through all 8 channels at, say, 5 kHz per channel (40 kHz total mux rate), each output is refreshed every 200 µs — fast enough that the hold cap droop is inaudible.

## The chips

### DAC
- **12‑bit (cheap, "good enough for everything except pitch")**: MCP4922 (dual), AD5621, DAC8552. SPI interface, single‑supply.
- **16‑bit (pitch CV, 1V/oct, ADR 0004)**: AD5754R, DAC8568, MAX5134. SPI interface, internal reference, multi‑channel.

### Multiplexer
**CD4051B / 74HC4051**: classic 8‑channel single‑pole analog mux/demux. 3 address pins + `INH`. ~125 Ω on‑resistance, ~5 ns switching. Cheap, ubiquitous. Works on ±5 V supplies typical for synth CVs.

### Sample‑and‑Hold
- **SMP08** (PMI/AD, the chip the SysML diagram names): 8‑channel S&H in one package. Out of production but still findable; can be replaced with eight discrete S&H cells (TL072 + small film cap + analog switch like ADG419) or with a "DAC + per‑channel holding op‑amp" design.
- Modern alternative: just use a multi‑channel DAC and skip the S&H+mux entirely. Costs more silicon but simplifies the analog stage. Trade‑off decision is per board.

## Why this matters for MusicBrain
- Lets one ~€3 DAC + one CD4051 + one S&H package drive **8 CVs**: ideal density for a Eurorack breakout.
- Pairs perfectly with the breakout‑side interpolator (ADR 0008): the MCU runs a 20–50 kHz update loop that cycles through channels and writes interpolated samples; the S&H smooths between updates so envelopes sound continuous, not stepped.

## Gotchas
- **Hold‑capacitor leakage** = output droop. Use a low‑leakage cap (C0G/NP0 ceramic or polypropylene film) and a JFET‑input op‑amp.
- **Mux glitches**: when switching channels, the DAC sees the new cell briefly before the previous settles. Add a short `INH=high` "dead time" between channels to mask glitches.
- **DAC settling time** sets the practical refresh rate. A 12‑bit SPI DAC at 20 MHz SPI settles in a few µs — well under our 200 µs/channel budget.
- **Pitch CV needs everything tighter**: 16‑bit DAC, low‑drift op‑amp, temperature‑stable reference, no mux glitches into the pitch cell.
- Watch out for **±15 V vs. ±12 V vs. ±5 V** supply differences between Eurorack and many DAC chips — usually you need a final ±10 V scaling op‑amp stage.

## Links
- https://www.ti.com/lit/ds/symlink/cd4051b.pdf
- https://www.analog.com/en/products/dac8568.html
- https://en.wikipedia.org/wiki/Sample_and_hold
