# ADR 0004 – Mixed DAC resolution: 16-bit pitch, 12-bit elsewhere

## Status
Accepted (2026-05-17). **Amended 2026-06-22** — the concrete 16-bit pitch DAC is now the **AD5754R**, not the DAC8568. See the *Amendment* section below; the resolution architecture (16-bit pitch / 12-bit elsewhere) is unchanged.

## Context
1V/oct pitch CV needs roughly 14 effective bits to resolve a cent across a 10-octave range; 12 bits gives ~2.4 cents per LSB, which is audible. For envelopes, filter cutoff, VCA gain, mod-wheel-style CV, 12 bits is inaudible if smoothed.

## Decision
- **Pitch / 1V-oct CV outputs:** ≥ 16-bit DAC. Concrete part: **AD5754R** (quad, 16-bit, native bipolar output stage). Per-oscillator calibration table applied in software, plus the AD5754R's on-chip offset/gain trim registers.
- **All other CV outputs (envelope, filter, VCA, modulation):** 12-bit DAC + sample-and-hold + 8-way mux (CD4051), per the `MIDI to CV.pdf` topology.
- Breakout boards are typed (`PitchCVOut`, `ModCVOut`) so the patch validator can refuse to assign a pitch source to a 12-bit output.

## CV voltage range (connectivity)
The pitch DAC does not just need *resolution*, it needs the right *output voltage range* to reach every instrument the brain has to drive. The AD5754R was chosen specifically because its output stage is **native bipolar and software-range-selectable per channel**:

| Range register | Output span | Used for |
|---|---|---|
| `0 V → +5 V` | unipolar 5 V | short-range / 5-octave V/oct, legacy modules |
| `0 V → +10 V` | unipolar 10 V | full 10-octave 1 V/oct pitch CV |
| `0 V → +10.8 V` | unipolar, 8 % over-range | Hz/V high notes + calibration headroom |
| `−5 V → +5 V` | bipolar 5 V | LFO/mod CV, bipolar pitch-bend offset |
| `−10 V → +10 V` | bipolar 10 V | full-swing modulation, Buchla-style |
| `−10.8 V → +10.8 V` | bipolar, over-range | headroom for trimming/calibration |

Because the range is selected on-chip, there is **no external op-amp scaling stage** between the DAC and the jack — which removes the op-amp offset/drift that was the main weakness of the unipolar-DAC alternative, and lets a single channel be re-ranged in firmware to suit whatever is patched into it. The per-output range is a property of the `CvBreakout` definition (ADR 0009), and the *meaning* of that voltage (1 V/oct, Hz/V, V-Trig/S-Trig …) is governed by [ADR 0014](0014-pitch-formats-and-cv-ranges.md).

Trade-off accepted: the AD5754R needs ±12 V…±15 V analog rails (AVDD/AVSS), i.e. an extra bipolar supply the unipolar single-rail DACs did not. Given the rack already has ±12 V available and the payoff (direct Eurorack/MS-20 voltages, DC-stable, audio-rate capable), this is worth it. See [doc/tech/dac-comparison.md](../tech/dac-comparison.md).

## Consequences
- BOM cost is higher per channel than the DAC8568, and the part needs a bipolar (±12/±15 V) analog supply — but no per-channel output op-amp stage, which nets out close on parts count and removes a drift source.
- Only oscillator/pitch banks get the expensive DAC; 12-bit + S&H + mux still covers envelope/filter/VCA/mod.
- The protocol must carry the channel type so the brain knows what bit depth to send; the SPI frame's `channel descriptor` includes resolution.
- Calibration tooling (auto-tune) is mandatory before the system is musically usable — included in project 3 roadmap step 5. The AD5754R's on-chip offset/gain registers give a hardware coarse-trim under that software calibration; both matter especially for Hz/V instruments (ADR 0014).

## Amendment (2026-06-22) — DAC8568 → AD5754R
The original write-up and [dac-comparison.md](../tech/dac-comparison.md) selected the **TI DAC8568** (8-channel, single-supply, unipolar) on density and cost grounds, scaling its 0–5 V output up to Eurorack range with a final op-amp stage.

Voortschrijdend inzicht reversed that choice in favour of the **Analog Devices AD5754R**:

- **Native bipolar, range-selectable output** (±5 V, ±10 V, 0–10 V, 0–10.8 V) straight from the chip — exactly the voltages V/oct *and* Hz/V instruments expect, with no op-amp scaling stage and therefore no added offset/drift.
- **On-chip per-channel offset & gain trim** registers complement the software calibration table — valuable for Hz/V gear like the Korg MS-20 whose slope/offset drift per unit.
- **DC-stable and audio-rate capable** (SPI to 30 MHz, ~10 µs settling): the same part can hold a rock-steady V/oct pitch *and*, on a fast channel, double as a bipolar audio-rate source.
- Reaching the multi-standard connectivity goal of [ADR 0014](0014-pitch-formats-and-cv-ranges.md) with the DAC8568 would have meant building (and calibrating) a configurable bipolar op-amp stage per channel anyway; the AD5754R folds that into silicon.

Costs accepted: higher per-chip price, a ±12/±15 V analog supply, and only 4 channels per chip (two chips for 8 pitch outputs). The resolution/architecture decision (16-bit pitch, 12-bit elsewhere) stands; only the concrete pitch-DAC part changed.
