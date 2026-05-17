# SPI (Serial Peripheral Interface)

## What it is
A simple synchronous master/slave serial bus invented by Motorola in the 1980s. Four wires:

| Line | Direction | Meaning |
|---|---|---|
| **SCK**  | master → slave  | clock |
| **MOSI** | master → slave  | "Master Out, Slave In" data |
| **MISO** | slave  → master | "Master In, Slave Out" data |
| **CS**   | master → slave  | chip‑select, **one per slave**, active‑low |

Full duplex (a bit goes out on MOSI while a bit comes in on MISO every clock). Speeds up to tens of MHz are routine; we'll run conservative 10–20 MHz inside a case.

Four "modes" (CPOL/CPHA combinations) describe clock idle level and sampling edge — pick mode 0 (idle low, sample on rising) unless a peripheral demands otherwise.

## Why we use it (ADR 0001, 0006)
- Fast enough to carry the entire CV/Gate/Trigger fabric for project 3 inside one case.
- Trivial to implement on every MCU we target.
- Adding a breakout = one more chip‑select line, no addressing scheme needed on the wire itself.

## What matters for MusicBrain
- The brain is **master**; every breakout is a **slave** with its own CS.
- Frame format on top of SPI is our own: see [doc/protocols/spi-frame.md](../protocols/spi-frame.md).
- Inside a case: short ribbon or flat cable, common ground rail. Beyond ~30 cm, signal integrity degrades fast → that's where the **CAN‑FD bridge** takes over.
- Per‑slave timing: drop CS, send frame, raise CS, give the slave a few microseconds to process before the next transaction.

## Gotchas
- **No addressing on the wire**: chip‑select count grows with breakout count. Use a 74HC138 decoder if you need more CS lines than you have GPIO.
- **No flow control**: master must know how fast each slave can consume bytes. Either run conservatively or add a "BUSY" line.
- **No error detection in the protocol itself**: our frame includes CRC‑16 for that reason.
- **Ground bounce / crosstalk** on long ribbon cables → keep ground next to every signal in the ribbon, terminate properly, prefer twisted‑pair if running > 20 cm.
- **Multi‑master is awkward** — SPI was designed single‑master; don't fight that, use one master + bridge nodes.

## The MusicBrain SPI frame and opcodes

SPI is just a byte pipe; our protocol on top of that pipe is defined in [doc/protocols/spi-frame.md](../protocols/spi-frame.md). Quick reference:

### Frame layout
```
[0xA5][0x01][OPCODE][LEN][PAYLOAD 0..56 bytes][CRC16 hi][CRC16 lo]
```
Total frame is ≤ 62 bytes — fits exactly in a CAN-FD 64-byte data field (leaving 2 bytes for CAN overhead).

### Opcode table (v1)

| Opcode | Name | Who sends | Payload summary |
|-------:|------|-----------|-----------------|
| `0x00` | `Ping` | brain → breakout | (none) |
| `0x01` | `Pong` | breakout → brain | (none) |
| `0x10` | `CvSet` | brain → breakout | `u16 channel`, `i16 value` — instant CV jump |
| `0x11` | `CvSegment` | brain → breakout | `u16 channel`, `i16 target`, `u16 duration_ms`, `u8 curve_id` — interpolated move |
| `0x20` | `GateSet` | brain → breakout | `u16 channel`, `u8 on` — gate on/off |
| `0x21` | `TriggerPulse` | brain → breakout | `u16 channel`, `u16 duration_ms` — timed pulse |
| `0x30` | `CvInRequest` | brain → breakout | `u16 channel` — request ADC reading |
| `0x31` | `CvInReport` | breakout → brain | `u16 channel`, `i16 value` — ADC result |

All multi-byte integers: **big-endian**.

`channel` = `(caseId << 8) | slotId`. Inside a case the chip-select already identifies the board, so `slotId` is the per-board output index and `caseId` tells the bridge whether to route to another case over CAN-FD.

`i16 value` maps `−32768..+32767` → `−1.0..+1.0`. The breakout scales to its DAC bit depth (12 or 16 bit, ADR 0004).

`curve_id` for `CvSegment`:

| id | Curve |
|---:|-------|
| 0 | Hold (stair-step; no interpolation) |
| 1 | Linear |
| 2 | Exponential up |
| 3 | Exponential down |

### Opcode design notes
- **Opcode ranges are grouped by function**: `0x0x` = housekeeping, `0x1x` = CV out, `0x2x` = gate/trigger, `0x3x` = CV in. This leaves room for `0x4x` (CV in bulk), `0x5x`+, etc., without renumbering.
- The brain always initiates. A breakout **never** sends unsolicited — only `Pong` (in response to `Ping`) and `CvInReport` (in response to `CvInRequest`).
- A breakout that receives an unrecognised opcode silently discards it. The brain uses a `Ping`/`Pong` round-trip to confirm liveness.
- **Bad CRC**: silent drop on both sides; the master re-sends if needed.

## Links
- https://en.wikipedia.org/wiki/Serial_Peripheral_Interface
- https://www.analog.com/en/resources/analog-dialogue/articles/introduction-to-spi-interface.html
- [doc/protocols/spi-frame.md](../protocols/spi-frame.md) — full protocol specification
