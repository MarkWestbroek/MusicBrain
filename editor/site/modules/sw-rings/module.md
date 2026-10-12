# Rings resonator

## Overview

A resonator (Mutable Instruments Rings): strings, bells and bars you strike.

A port of Mutable Instruments Rings: a resonator that you strike rather
than an oscillator that you hold. Each rising edge on Strum plucks it at the
pitch on V/Oct, and the sound rings out on its own: a bell or marimba in
Modal, a set of strings that ring along in Sympathetic, a plucked string in
String, plus the three extra models of the original (FM, quantized
sympathetic strings, and string with reverb).

Structure, Bright, Damping and Position shape the sound; each has a CV
input (S+, B+, D+, P+) that adds to that knob; ±1 sweeps the whole range. With Poly on 2 or 4, successive strums go to different internal
voices so notes can ring on together; the voices alternate between the Odd
and Even outputs, which makes a natural stereo pair.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Structure | 0 … 1 | 0.4 | How pure or inharmonic the overtones are, or how the strings are coupled. |
| Bright | 0 … 1 | 0.6 | Brightness. |
| Damping | 0 … 1 | 0.6 | How quickly it dies away. |
| Position | 0 … 1 | 0.3 | Where you strike it: middle = hollow, edge = bright. |
| Model | Modal / Sympath / String / FM / Quant / Str+Rev | Modal | The kind of resonator: modal (bell, marimba), sympathetic strings, string … |
| Poly | 1 / 2 / 4 | 2 | Voices: 1, 2 or 4; each strum goes to the next voice. |
| Coarse | -36 … 36 semi | 0 | Tuning in semitones. |
| Fine | -100 … 100 ct | 0 | Fine tuning in cents. |
| Level | 0 … 1 | 0.8 | Output level. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| V/Oct | in | cv | Pitch, 1 V per octave; 0 V is C4. |
| Strum | in | gate | Strum: each rising edge plucks the resonator. |
| Odd | out | audio | Odd voices. |
| Even | out | audio | Even voices. |
| S+ | in | cv | Adds to the Structure knob; ±1 sweeps its whole range. |
| B+ | in | cv | Adds to the Brightness knob; ±1 sweeps its whole range. |
| D+ | in | cv | Adds to the Damping knob; ±1 sweeps its whole range. |
| P+ | in | cv | Adds to the Position knob; ±1 sweeps its whole range. |

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

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): about **16.6 % CPU per instance** (one note, default settings), measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *🔔 Rings + FREQ SHIFT*, *💍 Rings (resonator)*, *🎚️ Rings + Opto comp*, *🎚️ Rings + Console EQ*, *💍 Rings + Ring mod*, *🏛️ Rings + Plate reverb*, *✨ Rings + Shimmer*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Based on Mutable Instruments Rings by Émilie Gillet, open source under the
  MIT licence (vendored in `firmware/lib/mi-rings`).
- The MusicBrain wrapper is MIT licensed as well. This is a software port,
  not the Mutable Instruments hardware.

## Versions

- **0.5.110**: the CV inputs add to their knob instead of replacing it.
- **Simulator** (September 2026): the browser runs the same Rings code as
  WebAssembly.
- **0.5.29**: first version (July 2026), with all six models and 1, 2 or 4
  voices.
