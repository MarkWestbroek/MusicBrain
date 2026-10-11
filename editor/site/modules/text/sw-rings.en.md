## Overview

A port of Mutable Instruments Rings: a resonator that you strike rather
than an oscillator that you hold. Each rising edge on Strum plucks it at the
pitch on V/Oct, and the sound rings out on its own: a bell or marimba in
Modal, a set of strings that ring along in Sympathetic, a plucked string in
String, plus the three extra models of the original (FM, quantized
sympathetic strings, and string with reverb).

Structure, Bright, Damping and Position shape the sound; each has a CV
input (S+, B+, D+, P+) that takes over that knob while it is patched, from
0 to 1. With Poly on 2 or 4, successive strums go to different internal
voices so notes can ring on together; the voices alternate between the Odd
and Even outputs, which makes a natural stereo pair.

## How it works

The module runs Émilie Gillet's Rings DSP as it is: the strummer and the
`Part` with its resonator models, excited by the internal exciter (this
version has no audio input to excite it with). Rings renders at 48 kHz in
blocks of 24 samples; the wrapper resamples that linearly to the Teensy's
44.1 kHz.

To make the original code run on the Teensy, the module zeroes its memory
before use (the code expects zeroed statics), the delay lines get a heap
fallback, and a guard catches invalid samples. The browser simulator
compiles the same vendored code to WebAssembly.

## Sources & licences

- Based on Mutable Instruments Rings by Émilie Gillet, open source under the
  MIT licence (vendored in `firmware/lib/mi-rings`).
- The MusicBrain wrapper is MIT licensed as well. This is a software port,
  not the Mutable Instruments hardware.

## Versions

- **Simulator** (September 2026): the browser runs the same Rings code as
  WebAssembly.
- **0.5.29**: first version (July 2026), with all six models and 1, 2 or 4
  voices.
