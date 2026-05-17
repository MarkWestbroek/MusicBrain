# Breakout boards (project 3)

Each breakout is an SPI slave addressed by chip-select and by a logical `(caseId, slotId)` pair (see [ADR 0006](../../doc/adr/0006-multi-case-transport.md)). Frame format: [SPI Frame protocol](../../doc/protocols/spi-frame.md).

| Subdirectory | Role |
|---|---|
| `cv-out/`       | 8 CV outputs via 12-bit DAC + SMP08 S&H + CD4051 mux (and 16-bit DAC variant for pitch CV, see ADR 0004). Runs the breakout-side interpolator (ADR 0008). |
| `cv-in/`        | 8 CV inputs via CD4051 mux + ADC. |
| `gate-trigger/` | 8 gate / trigger outputs with µs-precise timing. |
| `bridge/`       | SPI ↔ CAN-FD / RS-485 bridge for multi-case setups. Two variants: head (master case) and satellite (remote case). |

All breakouts share a small common library (`breakouts/common/`) for the SPI-slave handler, frame parsing, and address handling. To be implemented in roadmap stages 5 & 6.
