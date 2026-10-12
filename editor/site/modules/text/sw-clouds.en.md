## Overview

A port of Mutable Instruments Clouds: a stereo effect that records what
comes in and plays it back as a cloud of small grains. Position chooses
where in the recording the grains come from, Size how long they are, Pitch
transposes them (±24 semitones), Density sets how many there are and
Texture their shape. Freeze (the switch or the Frz jack) stops recording,
so you can play with what is in the buffer; Trig fires a single grain.

Mode switches between four ways of playing the buffer: granular, pitch
shifting and time stretching, a looping delay, and a spectral mode. Mix
blends dry and wet; Spread, Feedbk and Reverb add stereo width, feedback and
the built-in reverb. A mono source on In L works too. The CV inputs add
to their knob, as on the original: ±1 sweeps the whole range (pitch CV in
volts per octave).

## How it works

The module runs Émilie Gillet's Clouds granular processor as it is. In
granular mode, Density below the middle starts grains at a regular rate,
above the middle at random moments, and right in the middle no new grains
start. Texture up to three quarters shapes the grain envelope; above that it
adds diffusion. The stretch mode uses WSOLA (overlap-add with
correlation), and the spectral mode a phase vocoder.

Clouds works at 32 kHz. The wrapper resamples the input from 44.1 kHz to
32 kHz and the output back, linearly. Its buffers (118,784 and 65,408
bytes) live on the heap. Switching mode reorganises the buffer, so a short
glitch at that moment is normal. The browser simulator compiles the same
code to WebAssembly.

## Sources & licences

- Based on Mutable Instruments Clouds by Émilie Gillet, open source under
  the MIT licence (vendored in `firmware/lib/mi-clouds`).
- The MusicBrain wrapper is MIT licensed as well. This is a software port,
  not the Mutable Instruments hardware.

## Versions

- **0.5.110**: the CV inputs add to their knob instead of replacing it.
- **Simulator** (September 2026): the browser runs the same Clouds code as
  WebAssembly.
- **0.5.31**: first version (July 2026), stereo in and out, four modes.
