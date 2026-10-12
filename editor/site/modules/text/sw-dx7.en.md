## Overview

A six-operator FM voice modelled on the Yamaha DX7, with the eight factory
ROM banks (1A to 4B) built into the firmware. Bank picks the ROM and Program
one of its 32 voices; the display shows the voice name. Bank USR plays your
own 32-voice .syx bank, loaded through the DX7 bank dialog for the Teensy;
without an upload USR sounds as E.PIANO 1.

Each module is one voice. For chords, use a PolyGroup (the Poly seeds set up
eight). Velocity drives the FM envelopes as on the original, so a soft and a
hard note differ in tone, not just in level. Coarse and Fine transpose the
voice, and the pitch follows V/Oct continuously, so glide works.

## How it works

The voice runs on msfa, Google's music-synthesizer-for-android engine, the
same core that Dexed and MicroDexed use: six operators in the 32 DX7
algorithms, the DX7 envelopes and LFO, and the DX7 patch format, all in
fixed-point arithmetic. It renders natively at 44.1 kHz in blocks of 64
samples, so no resampler is needed. The large lookup tables are built once
and shared by all instances.

msfa only knows a note's pitch at the moment it is struck. To let the pitch
follow V/Oct afterwards (glide, bends), the module sends the full difference
between the struck note and the current V/Oct through the internal pitch
bend. The browser simulator runs the same msfa core compiled to WebAssembly.

## Sources & licences

- msfa (music-synthesizer-for-android) by Google, Apache License 2.0;
  vendored in `firmware/lib/msfa`. The same engine is used by Dexed and
  MicroDexed.
- Factory voices: the eight original Yamaha DX7 ROM cartridges (1A–4B,
  © Yamaha), included for compatibility. DX7 is a trademark of Yamaha
  Corporation; this module is modelled on the instrument and is not a
  Yamaha product.
- The MusicBrain wrapper is MIT licensed.

## Versions

- **0.5.51**: the sounding note follows V/Oct, so glide plays the right
  notes (before, it stuck on the previous note).
- **0.5.37**: the eight factory ROMs built in (Bank 1A–4B plus USR).
- **0.5.36**: first version: one DX7 voice on the msfa engine, with a bank
  upload frame.
