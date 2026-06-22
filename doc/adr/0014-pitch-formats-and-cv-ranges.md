# ADR 0014 – Pitch CV formats and output voltage ranges (V/oct, Hz/V, S-Trig)

## Status
Proposed (2026-06-22)

## Context
The MusicBrain does not live in a single-standard world. The owner's rack mixes:

- **Eurorack modules** — 1 V/oct pitch CV, positive-voltage ("V-Trig") gates, ±12 V environment.
- **A Korg MS-20** (the real, vintage one) — **Hz/V** pitch CV and a Korg/Yamaha-style **S-Trig** (shorting) trigger.

These two are mutually incompatible at the wire: send a 1 V/oct CV into the MS-20 and the tracking is nonsense; send a V-Trig into its S-Trig input and it never fires. A "brain" that only speaks 1 V/oct + V-Trig can drive the Eurorack half of the studio and nothing else. To be the *hub* it is meant to be, the brain must convert an internal note/pitch to **whatever encoding and voltage each individual output is patched to.**

Earlier ADRs touched the surrounding pieces but not the encoding itself:
- [ADR 0004](0004-dac-resolution.md) sets 16-bit pitch resolution and (as amended) selects the **AD5754R**, whose software-selectable bipolar output ranges supply the voltages discussed here.
- [ADR 0009](0009-module-runtime-classes.md) already models voltage *range* as a property of the `CvBreakout` definition (`CvOut12`/`CvOut16`/`GateOut`) and integer-vs-float CV representation. It does **not** yet model the *pitch standard* (the transfer function from note → volts) or the *gate polarity/type*.

This ADR fills that gap: it makes the **pitch encoding** and the **gate type** first-class, per-output configuration, alongside the existing voltage-range field.

### The pitch standards that matter here

| Standard | Law | Slope / constant | Instruments | Notes |
|---|---|---|---|---|
| **1 V/oct** | logarithmic: `V = V₀ + (semitones/12)·s`, `s = 1.0 V/oct` | 1 V per octave | Eurorack, Moog, Roland, ARP, Sequential, most modern | The default. 10 octaves → 0–10 V. |
| **1.2 V/oct** | same law, `s = 1.2 V/oct` | 1.2 V per octave | Buchla 200, some Serge | Same code path, different slope constant. |
| **Hz/V** | linear in frequency: `V = f(note) / k` | volts proportional to **frequency** | **Korg MS-10/20/50, PS-series; early Yamaha CS** | An octave up = **doubling** the voltage. Non-uniform resolution. |

The key difference: for V/oct, equal pitch intervals are equal voltage steps. For **Hz/V**, equal pitch intervals are *multiplicative* voltage steps, so the high register eats voltage headroom fast and the low register crowds many notes into a tiny voltage span.

### Gate / trigger types

| Type | Idle | Active | Instruments |
|---|---|---|---|
| **V-Trig** (voltage trigger / positive gate) | 0 V | +5…+10 V | Eurorack, Moog, Roland |
| **S-Trig** (shorting trigger, "negative") | open circuit | shorted to ground | Korg MS-20 (Korg/Yamaha convention), vintage Moog, Yamaha |

S-Trig is not just an inverted voltage; it is a *contact-closure* semantic, normally realised with an open-collector transistor (or relay) that shorts the line to ground when the note is on.

## Decision

### 1. Pitch outputs carry a format descriptor, not just a range
Extend the `CvOut16` / pitch-output definition (ADR 0009 layer 1) with a pitch-format block:

```
pitchFormat: {
  standard:    'v_oct' | 'v_oct_1v2' | 'hz_v',
  slope?:      number,   // V/oct for log standards (1.0, 1.2, …)
  refSemitone: number,   // which note maps to refVoltage (e.g. C0)
  refVoltage:  number,   // volts at refSemitone
  refFreqHz?:  number,   // Hz/V only: frequency at 1 V (k), post-calibration
  voltageRange: '0_5' | '0_10' | '0_10v8' | 'bip_5' | 'bip_10' | 'bip_10v8'
}
```

The brain converts an internal note (semitones, or frequency) to a DAC code through the standard's transfer function:
- `v_oct` / `v_oct_1v2`: `V = refVoltage + ((semitone − refSemitone)/12) · slope`
- `hz_v`: `V = noteToFreq(semitone) / k`, where `k = refFreqHz` after calibration.

The voltage is then mapped to a code for the AD5754R range selected on that channel.

### 2. Voltage range is selected per output from the AD5754R range set
`voltageRange` reuses the AD5754R's hardware ranges (0–5, 0–10, 0–10.8, ±5, ±10, ±10.8 V — see [ADR 0004](0004-dac-resolution.md)). Defaults by purpose:
- 1 V/oct pitch → `0_10` (full 10-octave swing).
- Hz/V pitch → `0_10v8` (the 8 % over-range buys headroom for high notes and for calibration trim).
- Bipolar modulation → `bip_5` / `bip_10`.

Because the range is on-chip, switching a channel between, say, a Eurorack VCO and the MS-20 is a **configuration message** (ADR 0009 "management" traffic), not a hardware change.

#### dCV code ↔ voltage encoding (clarifies the SPI frame)
The 16-bit CV `value` is **offset-binary, full-scale = 2¹⁶**: `0x0000` = the bottom
of the channel's `voltageRange`, `0xFFFF` = one LSB below the top, linear in between
(`value = code/65536 · (Vmax − Vmin) + Vmin`). Full-scale 2¹⁶ (not /65535) keeps the
maths a pure power of two and matches how the AD5754R's max code sits one LSB below
full-scale; it covers unipolar (0–10 V: `0x0000`=0 V) and bipolar (±10 V: `0x8000`=0 V)
uniformly. This supersedes the earlier "`i16` −1.0..+1.0" wording in
[spi-frame.md](../protocols/spi-frame.md). Digital type-1 modules (the FPGA voice,
[ADR 0013](0013-fpga-synth-instrument.md)) interpret the same code via the same
`pitchFormat` + range, so analog and digital modules track identically — for 1 V/oct
the code is linear in semitones, so the module reduces it to `note + period` directly.

### 3. Gate outputs carry a gate type
Extend `GateOut` with `gateType: 'v_trig' | 's_trig'` and `activeVoltage` (for V-Trig). V-Trig is the firmware default. **S-Trig is a hardware property of the gate breakout channel**: the board needs an open-collector/transistor-to-ground output stage. The brain's logic only flips the semantic ("on = assert"); whether "assert" means *drive high* or *short to ground* is the breakout's concern, declared in its definition so the patch validator can refuse to route an S-Trig instrument to a V-Trig-only channel.

### 4. Typed outputs gain a format attribute; the validator enforces matches
ADR 0004 already types pitch vs. mod outputs so a pitch source can't land on a 12-bit channel. This ADR extends that: a pitch output's `pitchFormat.standard` and a gate output's `gateType` are part of the type the patch validator checks. Routing the MS-20 voice to a `v_oct`/`v_trig` channel is a validation error with a clear message, not silent mistuning.

### 5. Calibration is per-output and mandatory for Hz/V
The auto-tune tooling required by ADR 0004 is extended:
- **V/oct**: two-point (or multi-point) calibration to set `refVoltage` offset and correct slope; small, stable.
- **Hz/V**: per-*instrument* calibration is unavoidable — the MS-20's Hz/V scale and zero drift with temperature and per unit. The routine sweeps notes, measures pitch (audio/tuner feedback), and fits `k` (and a low-end offset). The AD5754R's on-chip offset/gain registers hold the coarse trim; the software table holds the fine per-note correction.

## Consequences
- **The brain can drive Eurorack (V/oct + V-Trig) and the Korg MS-20 (Hz/V + S-Trig) from the same patch**, each output independently configured. This is the connectivity payoff that justified the AD5754R in ADR 0004.
- **Hz/V resolution is intrinsically non-uniform**: many low notes share a narrow voltage band, high notes spread out and consume headroom. 16-bit depth plus the 0–10.8 V over-range mitigates this, but bass-register Hz/V tuning will always be the tightest case — a reason calibration and the 16-bit DAC matter most exactly here.
- **Gate hardware is no longer one-size-fits-all**: at least some gate-breakout channels must provide an S-Trig (open-collector) output stage, declared in the breakout definition. A V-Trig-only board simply advertises only `v_trig` and the validator routes around it.
- **The descriptor must travel the bus**: per-output `pitchFormat` / `gateType` / `voltageRange` is configuration ("management") traffic (ADR 0009), pushed at boot or when the user re-patches in the editor — not music-time traffic.
- **Calibration scope grows**: Hz/V instruments need their own calibration profiles stored per instrument, not just per channel. This is added project-3 roadmap work on top of the V/oct auto-tune already planned.
- **Editor/firmware symmetry**: the pitch-format and gate-type enums are shared TS↔C++ vocabulary, same as the rest of ADR 0009's domain.

## Open questions
- **Where does the note→frequency table live for Hz/V?** A shared equal-temperament table is the obvious default, but micro-tuning/scala support would change the `noteToFreq` step — defer until micro-tuning is on the roadmap.
- **S-Trig sensing on inputs** — this ADR covers *driving* the MS-20. Reading an S-Trig (and Hz/V CV) *back into* the brain via `CvBreakIn`/`GateIn` is the symmetric problem; the descriptor is the same, the hardware (comparator / Hz/V front-end) differs. Spec it when an external-in use case is concrete.
- **Per-channel vs. per-board range constraints** — the AD5754R sets range per channel, but a given physical breakout may wire only one range to its jacks. Whether `voltageRange` is freely software-selectable or pinned by the board is a per-board definition detail.

## References
- [ADR 0004](0004-dac-resolution.md) — 16-bit pitch resolution; AD5754R selection and its bipolar output ranges (amended 2026-06-22).
- [ADR 0009](0009-module-runtime-classes.md) — `CvBreakout`/`CvOut16`/`GateOut` definitions, voltage range as a breakout property, configuration vs. music-time bus traffic.
- [doc/tech/dac-comparison.md](../tech/dac-comparison.md) — why the AD5754R's native bipolar ranges drove the chip choice.
- [doc/tech/dac-ad5754brez.md](../tech/dac-ad5754brez.md) — background chat on the AD5754R's high-voltage output stage.
- Kenton / Doepfer MIDI-CV converter conventions — the canonical "1 V/oct + V-Trig" vs. "Hz/V + S-Trig (Korg/Yamaha)" split this ADR mirrors.
