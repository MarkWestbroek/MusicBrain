# Architecture Decision Records

ADRs capture decisions made for the MusicBrain project. Each record is short and immutable; if a decision changes, write a new ADR that supersedes the old one.

Format: based on Michael Nygard's template (Context / Decision / Consequences).

| # | Title | Status |
|---|---|---|
| [0001](0001-mcu-choice.md) | MCU family per project | Accepted |
| [0002](0002-editor-stack.md) | Editor stack: TypeScript + React, device exposes API | Accepted |
| [0003](0003-project1-ui.md) | Project 1 on-device UI: minimal LCD + remote editor | Accepted |
| [0004](0004-dac-resolution.md) | Mixed DAC resolution: 16-bit pitch, 12-bit elsewhere | Accepted |
| [0005](0005-patch-storage-format.md) | Patch format: JSON in editor, binary on device | Accepted |
| [0006](0006-multi-case-transport.md) | Multi-case transport via SPI↔CAN-FD/RS-485 bridge | Accepted |
| [0007](0007-licensing.md) | Open source by default | Accepted |
| [0008](0008-latency-and-interpolation.md) | Latency budget + breakout-side interpolation | Accepted |
