# patch.switcher.v1 — effect-switcher patch blob

Used by project 1 (the on-stage effect-loop pedalboard). Stored as the `body`
of a `Patch` (see [patch.md](patch.md)) so it goes through the same JSON ↔ CBOR
codec, storage and editor sync paths as every other patch.

## Layout (8 bytes)

| Offset | Bytes | Field        | Notes                                                   |
|--------|-------|--------------|---------------------------------------------------------|
| 0      | 1     | `version`    | Always `1`                                              |
| 1      | 1     | `relayCount` | 1..16                                                   |
| 2      | 2     | `relayMask`  | Little-endian; bit *i* = relay *i* on/off (i in 0..15)  |
| 4      | 1     | `flags`      | bit 0 = `tempMute` (all-loops-off momentary)            |
| 5      | 1     | `_pad`       | 0                                                       |
| 6      | 2     | `crc16`      | CRC-16/CCITT over bytes 0..5                            |

`relayMask` bits above `relayCount` MUST be 0; readers reject otherwise.

## Channel numbering

The switcher emits `OutputKind::RelaySet` commands with `channel = relayId`
(0..relayCount-1) and `data = 0|1`. There is no SPI bus on the project-1
hardware — relays are driven directly by the brain's GPIO + 74HC595 chain.

## Router behaviour

* **MidiProgramChange(prog)** → selects patch `prog` from the bank; emits
  one `RelaySet` per relay with the new state, plus a `DisplayDirty`.
* **Footswitch(0, pressed=1)** → program-change *up* (active+1, wraps);
  **Footswitch(0, pressed=0)** is ignored.
* **Footswitch(1, pressed=1)** → program-change *down* (active-1, wraps).
  *(Project 1 uses a single physical footswitch; the host firmware decodes
   short-press/long-press into id 0 / id 1. The router itself is agnostic.)*
* **All other events** → ignored, no commands emitted.

## Validation

`writeBlob`/`readBlob` MUST:
1. Reject `relayCount == 0 || relayCount > 16`.
2. Reject mask bits set above `relayCount`.
3. Verify CRC-16/CCITT matches.
4. Verify `_pad == 0` and `version == 1`.
