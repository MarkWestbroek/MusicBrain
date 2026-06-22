# ADR 0013 – FPGA synth voice as an SPI-slave instrument

## Status
Proposed (2026-06-22)

## Context

A separate project, **MS20_synth_voice** (`E:\Dev\Gowin\MS20_synth_voice`),
implements a physical-modeling voice on a Sipeed Tang Primer 20K FPGA (Gowin
`GW2A-18C`): a Karplus-Strong string oscillator into a Korg-MS-20-style
state-variable filter with non-linear (tanh) diode saturation, running in Q12.20
fixed-point with internal oversampling. It currently runs in simulation and
produces audio; one voice is light on resources (the filter reuses a few
multipliers + one BRAM tanh-LUT), so the chip can host many voices.

We want this FPGA to become **extra polyphonic voices** for the modular brain.
The question is how it attaches to the existing fabric.

MusicBrain already defines everything needed:
- The brain (Teensy 4.1) is the SPI **master**; breakouts are slaves with their
  own chip-select ([ADR 0001](0001-mcu-choice.md), [ADR 0006](0006-multi-case-transport.md), [doc/tech/spi.md](../tech/spi.md)).
- A wire protocol — the SPI frame v1 ([doc/protocols/spi-frame.md](../protocols/spi-frame.md)):
  `[0xA5][VER][OPCODE][LEN][PAYLOAD][CRC16-CCITT]`, opcodes `CvSet`/`CvSegment`/
  `GateSet`/`TriggerPulse`/`Ping`, `channel = (caseId<<8)|slotId`, `i16` CV maps
  `−1.0..+1.0`.
- The runtime already plans an "instrument" role that consumes per-voice CV/gate
  ([doc/tech/two-teensy-spi.md](../tech/two-teensy-spi.md): the audio-Teensy as
  SPI-slave receiving CV via `CvBreakIn`).
- Per-voice pitch/gate/velocity and voice-indexed channel addressing already
  exist ([ADR 0010](0010-midi-in-and-polyphony.md) §5, [ADR 0011](0011-voice-lifecycle-and-two-voice-mvp.md) §4).

## Decision

**The FPGA is a standard SPI-slave instrument on the brain's CV/gate bus — not a
special case.** It plays the same role the planned audio-Teensy would, just in
hardware logic instead of C++.

1. **Control = SPI frame v1, consumed as CV/gate.** The FPGA decodes the existing
   frame format (with CRC-16/CCITT-FALSE) and reacts to:
   - `CvSet` / `CvSegment` on voice-indexed channels → per-voice pitch and
     per-voice (or global) filter cutoff / resonance / drive.
   - `GateSet` → voice gate; a 0→1 transition triggers the string excitation.
   - `Ping` → `Pong` on MISO for liveness.
   The brain keeps **all** MIDI handling, voice allocation, steal strategy and
   envelopes (ADR 0010/0011). The FPGA is "dumb": it only turns CV/gate into
   sound, exactly like an analog VCO+VCF module would.

2. **Pitch is a CV, not a note number.** The FPGA converts the `i16` pitch CV to
   an oscillator frequency (string delay-line length) via an on-chip table. This
   keeps it interchangeable with any other CV source and faithful to the modular
   model. (No synth-specific "note" opcodes are added to the protocol.)

3. **Channel/slot map.** Inside its case the chip-select identifies the board, so
   the FPGA only inspects `slotId`. A documented slot map assigns pitch/gate per
   voice and cutoff/resonance/drive (per-voice or global) — using the
   `voice-indexed` share mode from ADR 0010 §5 so the editor's one cable per
   stamp fans out to voice slots.

4. **Audio output is independent of the control bus.** The FPGA emits I2S to a
   dedicated DAC (e.g. PCM5102) for analog out into the rack, and the same I2S
   can be tapped by a Teensy 4.1 for USB-audio capture. Audio never travels over
   the SPI control link.

5. **Bandwidth follows ADR 0008/0010.** Per-voice pitch/cutoff use `CvSegment`
   (breakout-side interpolation) rather than per-tick `CvSet`, matching the
   polyphonic bandwidth budget already locked in.

## Consequences

- **Pro:** zero new bus concepts. The FPGA is "one more chip-select", consuming
  the per-voice CV/gate the brain already produces. The editor/voice-stamp model
  needs no FPGA-specific notion — its voices are just CV destinations.
- **Pro:** the brain stays the single source of polyphony/voice logic; the FPGA
  is replaceable/независent and testable in isolation (its frame decoder is
  unit-tested in simulation, CRC cross-validated).
- **Pro:** many voices per chip; the FPGA can offload polyphony the Teensy
  audio-instrument would otherwise compute in software.
- **Con:** the FPGA must implement the frame decoder + CRC + a pitch-CV→frequency
  table in HDL (done/in progress in the MS20 repo).
- **Con:** `CvSegment` interpolation must run on the FPGA side per voice to stay
  within the SPI bandwidth budget at high voice counts (deferred; `CvSet` works
  for low counts first).
- **Neutral:** MISO is added on the FPGA for `Pong`; `CvInReport` is N/A (the
  instrument has no CV inputs to report).

## Open questions

- Final slot map (which slots = pitch/gate/cutoff/res/drive per voice) — pin down
  alongside the editor's breakout addressing.
- Pitch-CV scaling (what normalized `i16` range corresponds to which note range /
  V-oct equivalent) — shared decision with the brain's pitch CV-out.
- Whether the FPGA also exposes a few per-voice modulation CV inputs later
  (would re-introduce `CvInReport`-style reporting, currently N/A).
