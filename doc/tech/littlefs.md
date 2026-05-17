# LittleFS

## What it is
A small, **power‑fail‑safe** filesystem for embedded NOR/QSPI flash, originally written at ARM by Christopher Haster (now an independent project, BSD‑3 licence). Designed for the constraints of MCU‑class flash:

- Log‑structured (copy‑on‑write) → a power loss never corrupts existing files.
- Wear‑levelling built in → erase cycles are spread across the chip.
- Tiny RAM footprint (~4 KB working buffers).
- No metadata "journal" file that grows forever — bounded metadata.

## Why we use it
- The default filesystem on **Teensy 4.x** (PJRC's `LittleFS` library), **RP2040** (Arduino‑Pico ships it), and **ESP32** (alternative to SPIFFS, and recommended over SPIFFS by Espressif now).
- One filesystem, three platforms → fewer storage abstractions in `core/Storage/`.
- Robust against the most common embedded failure mode (power yanked mid‑write); critical for a stage device that might be unplugged at any moment.

## What matters for MusicBrain
- Patch bank stored as a few flat files: `bank.cbor`, `settings.cbor`, `calibration.cbor`.
- Free space requirements are tiny (KB range); we mostly buy LittleFS for its **integrity guarantees**, not its capacity.
- Atomic update pattern: write `bank.cbor.new`, fsync, `rename()` over the old file. Survives a power loss cleanly.

## Gotchas
- Block size and lookahead buffer must match the underlying flash geometry — use the platform port (PJRC's, Pico's, Espressif's), don't hand‑configure.
- LittleFS metadata uses extra erase cycles; if a particular file is rewritten dozens of times per second the chip will wear. For us patches are rewritten by the user, infrequently — no concern.
- Filenames are short by default (`LFS_NAME_MAX`); keep them ≤ 32 chars.
- Don't store large blobs on the same flash chip as firmware code without checking the partition table; flash competition can cause unexpected slowdowns during writes.

## Links
- https://github.com/littlefs-project/littlefs
- https://www.pjrc.com/teensy/td_libs_LittleFS.html
- https://arduino-pico.readthedocs.io/en/latest/fs.html
