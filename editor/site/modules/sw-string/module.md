# Plucked string

## Overview

A plucked string (Karplus-Strong).

A plucked string using Karplus-Strong synthesis. Each rising edge on Gate
plucks the string again at the pitch on V/Oct; the note then dies away on
its own, high harmonics first, as on a real string.

Pluck sets how hard the string is plucked, from 0.01 to 1. Pluck and Level
both have a CV input, so an envelope or a random source can vary the touch
from note to note. It is one voice per module.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Pluck | 0.01 … 1 | 0.8 | The pluck: low = dull, high = bright. |
| Level | 0 … 1 | 0.8 | Output volume. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| V/Oct | in | cv | Pitch, 1 V per octave; read at the pluck. |
| Gate | in | gate | Each rising edge plucks the string. |
| P+ | in | cv | CV for Pluck. |
| L+ | in | cv | CV for Level. |
| Out | out | audio | Mono audio output. |

## How it works

Karplus-Strong is the classic short delay-line model of a string. A burst
of noise (the pluck, scaled by Pluck) is fed into a delay line whose
length sets the pitch.
The output is fed back through an averaging filter (a factor of
32686/65536), which takes the high harmonics away faster than the low ones
and gives the natural plucked decay. The delay line is at most 536 samples
long, so the lowest note is about 82 Hz. An amplifier after the string sets
the output level.

The firmware uses `AudioSynthKarplusStrong` from the Teensy Audio Library.
The browser simulator runs a line-for-line copy of the same integer
arithmetic, in Teensy blocks of 128 samples, so a pluck waits for the next
block just as on the hardware.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): about **0.3 % CPU per instance** (one note, default settings), measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *🦆 String + WAH (touch-wah)*, *🎸 String + DRIVE (overdrive/fuzz)*, *🔥 String + TUBE (buizenversterker)*, *🔥 String + Tube*, *🔁 Arp + String echo*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- `AudioSynthKarplusStrong` and `AudioAmplifier` from the Teensy Audio
  Library by Paul Stoffregen, PJRC (MIT licence). The browser version is a
  copy of that arithmetic under the same licence.
- The MusicBrain wrapper is MIT licensed.

## Versions

- **0.5.15**: CV inputs for Pluck and Level.
- **0.5.13**: first version, the first physical-modelling voice in the
  firmware.
