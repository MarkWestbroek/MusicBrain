# Architecture Decision Records

ADRs capture decisions made for the MusicBrain project. Each record is short and immutable; if a decision changes, write a new ADR that supersedes the old one.

Format: based on Michael Nygard's template (Context / Decision / Consequences).

| # | Title | Status |
|---|---|---|
| [0001](0001-mcu-choice.md) | MCU family per project | Accepted |
| [0002](0002-editor-stack.md) | Editor stack: TypeScript + React, device exposes API | Accepted |
| [0003](0003-project1-ui.md) | Project 1 on-device UI: minimal LCD + remote editor | Accepted |
| [0004](0004-dac-resolution.md) | Mixed DAC resolution: 16-bit pitch, 12-bit elsewhere | Accepted (amended 2026-06-22: AD5754R) |
| [0005](0005-patch-storage-format.md) | Patch format: JSON in editor, binary on device | Accepted |
| [0006](0006-multi-case-transport.md) | Multi-case transport via SPI↔CAN-FD/RS-485 bridge | Accepted |
| [0007](0007-licensing.md) | Open source by default | Accepted |
| [0008](0008-latency-and-interpolation.md) | Latency budget + breakout-side interpolation | Accepted |
| [0009](0009-module-runtime-classes.md) | Module runtime classes: OO domain layer, shared between TS editor and C++ firmware | Proposed |
| [0010](0010-midi-in-and-polyphony.md) | MIDI-In, per-patch voice count, and the editor's "voice stamp" | Proposed |
| [0011](0011-voice-lifecycle-and-two-voice-mvp.md) | ... | Proposed |
| [0012](0012-elements-modular-separation.md) | Elements modular separation: Reverb and OminousVoice as standalone modules | Proposed |
| [0013](0013-fpga-synth-instrument.md) | FPGA synth voice as an SPI-slave instrument on the CV/gate bus | Proposed |
| [0014](0014-pitch-formats-and-cv-ranges.md) | Pitch CV formats and output voltage ranges (V/oct, Hz/V, S-Trig) | Proposed |
| [0015](0015-poly-instrument-slot-addressing.md) | Poly-instrument slot addressing and the FPGA voice contract | Proposed |