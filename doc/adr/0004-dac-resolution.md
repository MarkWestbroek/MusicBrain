# ADR 0004 – Mixed DAC resolution: 16-bit pitch, 12-bit elsewhere

## Status
Accepted (2026-05-17)

## Context
1V/oct pitch CV needs roughly 14 effective bits to resolve a cent across a 10-octave range; 12 bits gives ~2.4 cents per LSB, which is audible. For envelopes, filter cutoff, VCA gain, mod-wheel-style CV, 12 bits is inaudible if smoothed.

## Decision
- **Pitch / 1V-oct CV outputs:** ≥ 16-bit DAC (e.g. DAC8568, AD5754, MAX5134). Per-oscillator calibration table applied in software.
- **All other CV outputs (envelope, filter, VCA, modulation):** 12-bit DAC + sample-and-hold + 8-way mux (CD4051), per the `MIDI to CV.pdf` topology.
- Breakout boards are typed (`PitchCVOut`, `ModCVOut`) so the patch validator can refuse to assign a pitch source to a 12-bit output.

## Consequences
- BOM cost is contained: only oscillator banks get the expensive DACs.
- The protocol must carry the channel type so the brain knows what bit depth to send; the SPI frame's `channel descriptor` includes resolution.
- Calibration tooling (auto-tune) is mandatory before the system is musically usable — included in project 3 roadmap step 5.
