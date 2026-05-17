# patch.synth.v1 — project 3 (modular brain) patch blob

The opaque `blob` inside `mb::Patch` (see [patch.md](patch.md)) for project 3's
**modular synth brain** uses this binary layout. Kept deliberately small and
fixed-size so it fits comfortably under `kPatchBlobMax = 512` even with many
voices and so the device parser is trivial.

## v1 layout (little-endian)

| Offset | Size | Field         | Description                                                    |
|--------|------|---------------|----------------------------------------------------------------|
| 0      | 1    | `version`     | `0x01`                                                         |
| 1      | 1    | `voiceCount`  | 1 .. 16                                                        |
| 2      | 1    | `caseId`      | Case identifier (see ADR 0006).                                |
| 3      | 1    | `firstSlot`   | First slot id on `caseId`. Voice *i* uses two consecutive slots:|
|        |      |               | `pitchSlot = firstSlot + 2*i`, `gateSlot = firstSlot + 2*i + 1`. |
| 4      | 1    | `pitchBits`   | DAC resolution (12 or 16). For 8 voices on DAC8568 → 16.        |
| 5      | 1    | `_pad`        | Reserved, must be `0`.                                          |
| 6      | 2    | `crc16`       | CRC16-CCITT over bytes [0..5] (same poly as the SPI frame).     |

Total = **8 bytes**. The blob is the same on the wire (CBOR `bstr` of 8 bytes)
and in memory.

### Channel encoding

A channel id is `(caseId << 8) | slotId`, matching [`spi-frame.md`](../spi-frame.md).
So for `caseId = 0`, `firstSlot = 0x10`, voice 0 sends pitch on `0x0010` and
gate on `0x0011`; voice 1 on `0x0012` / `0x0013`; … voice 7 on `0x001E` /
`0x001F`. (That fits the 16-channel DAC8568 + GateBoard pair.)

### Pitch mapping (1 V/oct, fixed in v1)

The router converts a MIDI note `N` to a normalised CV value:

```
cv = clamp((N - 60) / 60.0, -1.0, +1.0)     // MIDI 60 = 0V, ±5V full scale
```

The breakout multiplies that by its full scale (5 V for the typical
DAC8568 configuration) before driving the DAC. That puts middle C at 0 V
and gives ±5 octaves of useful range, with 1 octave = 1 V exactly.

Per-channel fine calibration (`scale * cv + offset`) is NOT in v1 — it
lives on the breakout's flash and is set at calibration time, not in the
patch. v2 may add a per-voice detune.

## Voice allocation (informative)

The router applies last-note priority with round-robin voice stealing:

1. NoteOn for note `N`: pick the oldest free voice; if none free, steal the
   oldest voice (FIFO ring). Mark voice `held`, store `N` in voice state.
2. NoteOff for `N`: find the voice currently holding `N`, drop its gate.
3. Voice CV is set the moment the voice is (re)allocated; gate goes high
   in the same router output batch.

Stealing emits a gate-off → CV-change → gate-on sequence so the receiving
breakout can re-trigger envelopes.
