## Overview

A plucked string using Karplus-Strong synthesis. Each rising edge on Gate
plucks the string again at the pitch on V/Oct; the note then dies away on
its own, high harmonics first, as on a real string.

Pluck sets how hard the string is plucked, from 0.01 to 1. Pluck and Level
both have a CV input, so an envelope or a random source can vary the touch
from note to note. It is one voice per module.

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

## Sources & licences

- `AudioSynthKarplusStrong` and `AudioAmplifier` from the Teensy Audio
  Library by Paul Stoffregen, PJRC (MIT licence). The browser version is a
  copy of that arithmetic under the same licence.
- The MusicBrain wrapper is MIT licensed.

## Versions

- **0.5.15**: CV inputs for Pluck and Level.
- **0.5.13**: first version, the first physical-modelling voice in the
  firmware.
