# MIDI: DIN, USB‑MIDI, BLE‑MIDI

## What it is
**Musical Instrument Digital Interface**, standardised in 1983. A byte‑oriented protocol for note, controller, clock and program‑change messages between musical devices.

Three transports we care about:

| Transport | Speed | Latency | Notes |
|---|---|---|---|
| **DIN MIDI** (5‑pin or TRS) | 31.25 kbit/s, async serial | ~1 ms per byte | classical, opto‑isolated input, robust |
| **USB‑MIDI**                | up to USB 1.1/2.0 speed   | sub‑ms       | USB class 1.0 spec; multiple "ports" per device |
| **BLE‑MIDI**                | ~3 ms connection interval | a few ms     | Bluetooth LE service spec by MMA + Apple |

Common message types: NoteOn / NoteOff / CC (control change) / PitchBend / ProgramChange / Aftertouch / SysEx (variable‑length, used for bulk data and vendor‑specific payloads).

## Why we use it (Plan §1.5, ADR 0003)
- **Universal control surface**: any foot controller, keybed or DAW can already speak it.
- **Program Change** is the lingua franca for "switch patch" on stage — used in projects 1 & 2.
- **USB‑MIDI** is the simplest way for the brain to receive notes from a USB MIDI keyboard without a PC (Teensy 4.1 USB host).
- **BLE‑MIDI** is the most convenient way to let a phone/tablet send patches or test notes without cables.

## What matters for MusicBrain
- **MIDI in (DIN)**: 6N138 / 6N137 optocoupler + 220 Ω + diode, per the official MIDI 1.0 hardware spec — keeps grounds isolated.
- **MIDI Program Change** is just one byte after the status (`Cn pp`); easy to handle, used to recall a patch.
- **SysEx** is what we'll use for patch upload/download over MIDI cables when no USB/WiFi is available (rare, but cheap to support).
- **USB‑MIDI on Teensy**: select USB type "Serial + MIDI" so we also keep the CDC log channel.
- **BLE‑MIDI** is great for editing but not for streaming high‑rate CV — keep CV traffic on SPI/CAN‑FD.

## Gotchas
- **MIDI 1.0 ≠ MIDI 2.0**. MIDI 2.0 (2020) adds higher resolution and bidirectional negotiation but adoption is still patchy. Stay on MIDI 1.0 for compatibility; design data structures with bit depths that won't embarrass us if we upgrade.
- **TRS MIDI** has two wirings (Type A and Type B). The MMA standardised on Type A in 2018; older Korg/Line6 gear is Type B. Provide a switch or a clearly labelled jack.
- **Running status**: a MIDI parser must handle messages without a fresh status byte. Use a library, don't reinvent.
- **USB‑MIDI cable count**: a USB‑MIDI device can expose up to 16 "virtual cables" each with 16 channels. Editor / driver UX can be confusing — name them clearly.

## Links
- https://www.midi.org/
- https://www.usb.org/sites/default/files/midi10.pdf — USB‑MIDI 1.0 class spec.
- https://www.midi.org/specifications/item/bluetooth-le-midi — BLE‑MIDI spec (free download after account).
