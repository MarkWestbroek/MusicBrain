# SPI Frame protocol (v1)

Wire format used between the brain and breakout boards. Carried over SPI inside a case and tunnelled over CAN-FD (or RS-485) between cases by bridge nodes (see [ADR 0006](../adr/0006-multi-case-transport.md)).

## Frame layout

```
+--------+---------+--------+--------+----------------+---------+
| MAGIC  | VERSION | OPCODE | LEN    | PAYLOAD (LEN)  | CRC16   |
| 0xA5   | 0x01    | u8     | u8     | 0..56 bytes    | 2 bytes |
+--------+---------+--------+--------+----------------+---------+
```

- **MAGIC**: `0xA5`, frame start marker.
- **VERSION**: `0x01`. Bump when the layout changes incompatibly.
- **OPCODE**: see table below.
- **LEN**: payload length in bytes, ≤ 56 so the entire frame fits in a single CAN-FD 64-byte data field (4 header + 56 payload + 2 CRC = 62 ≤ 64).
- **CRC16**: CRC-16/CCITT-FALSE over `[MAGIC..end of PAYLOAD]`, transmitted big-endian.

## Opcodes (v1)

| Opcode | Name           | Direction        | Payload |
|-------:|----------------|------------------|---------|
| `0x00` | `Ping`         | brain → breakout | (none) |
| `0x01` | `Pong`         | breakout → brain | (none) |
| `0x10` | `CvSet`        | brain → breakout | `u16 channel`, `i16 value` |
| `0x11` | `CvSegment`    | brain → breakout | `u16 channel`, `i16 target`, `u16 duration_ms`, `u8 curve_id` |
| `0x20` | `GateSet`      | brain → breakout | `u16 channel`, `u8 on` |
| `0x21` | `TriggerPulse` | brain → breakout | `u16 channel`, `u16 duration_ms` |
| `0x30` | `CvInRequest`  | brain → breakout | `u16 channel` |
| `0x31` | `CvInReport`   | breakout → brain | `u16 channel`, `i16 value` |

All multi-byte integers are **big-endian**.

## Addressing

The `channel` field is a 16-bit `(caseId << 8) | slotId`. Inside a case, the SPI chip-select already selects the board; the high byte is checked by the bridge to decide whether to forward across CAN-FD.

## CV value encoding

16-bit **offset-binary, full-scale = 2¹⁶**: `0x0000` = the bottom of the output's
configured range, `0xFFFF` = one LSB below the top.
`value = code / 65536 · (Vmax − Vmin) + Vmin`.

- Using full-scale 2¹⁶ (not /65535) keeps the code↔voltage maths a pure power of
  two (multiply + shift, no rounding) and matches how the 16-bit DAC (AD5754R)
  actually behaves: its maximum code sits one LSB below full-scale.
- Works uniformly for unipolar ranges (0–10 V: `0x0000` = 0 V) and bipolar ranges
  (±10 V: `0x8000` = 0 V).

The per-output voltage **range** and **pitch format** (1 V/oct / Hz/V …) are
configuration, see [ADR 0004](../adr/0004-dac-resolution.md) and
[ADR 0014](../adr/0014-pitch-formats-and-cv-ranges.md). The breakout — or a digital
type-1 module such as the FPGA voice ([ADR 0013](../adr/0013-fpga-synth-instrument.md)) —
scales `code` to its DAC bit depth / synthesises the pitch accordingly.

> This supersedes the earlier "`i16` −1.0..+1.0" wording; the wire field is still
> 16 bits, and for bipolar ranges the offset-binary `0x8000` midpoint equals a
> signed zero.

## Interpolation (`CvSegment`)

`curve_id`:
| id | curve |
|---:|---|
| 0  | Hold (no interpolation; deliberate stair-step) |
| 1  | Linear |
| 2  | Exponential up |
| 3  | Exponential down |

Breakout runs an internal interpolator at 20–50 kHz between received setpoints (see [ADR 0008](../adr/0008-latency-and-interpolation.md)).

## Errors

A breakout that receives a frame with bad CRC silently drops it (the bus is master-driven; the master re-sends if needed). A breakout that does not recognise an opcode replies with no message; the master may issue a `Ping` to confirm liveness.
