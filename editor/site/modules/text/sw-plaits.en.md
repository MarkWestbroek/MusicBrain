## Overview

A port of Mutable Instruments Plaits: one oscillator module with 24 sound
models behind a single Engine knob, from virtual analogue and six-operator
FM to chords, speech, physical models and drums. The display shows the name
of the chosen engine. Harmonics, Timbre and Morph do something different in
each engine; Decay and LPG set the built-in low-pass gate.

Patch pitch into V/Oct and a gate or trigger into Trig: each rising edge
strikes the low-pass gate, and the drum and physical-model engines use it
as their hit. Out is the main sound, Aux a variant that depends on the
engine. H+, T+ and M+ add to their knob; ±1 sweeps the whole range. The
Speech engine (15) needs Trig patched; Harmonics then picks the speech
model, Morph the vowel or word, and Timbre shifts the formants.

## How it works

The module runs the Plaits 1.2 code as it is. The engine number is the
order in which Plaits 1.2 registers its engines: 0 VA+VCF, 1 phase
distortion, 2–4 six-operator FM, 5 wave terrain, 6 string machine,
7 chiptune, 8 VA, 9 waveshaping, 10 two-operator FM, 11 grain, 12 additive,
13 wavetable, 14 chord, 15 speech, 16 swarm, 17 noise, 18 particle,
19 string, 20 modal, 21 bass drum, 22 snare, 23 hi-hat.

Plaits renders at 48 kHz; the wrapper resamples linearly to 44.1 kHz. Its
working memory is one 16 KB block on the heap. On the Teensy the Plaits
code and tables run from the external (cached) flash, because they did not
fit in fast RAM, and the module zeroes its memory before use as the
original code expects. The browser simulator compiles the same code to
WebAssembly.

## Sources & licences

- Based on Mutable Instruments Plaits (firmware 1.2) by Émilie Gillet, open
  source under the MIT licence (vendored in `firmware/lib/mi-plaits`).
- The MusicBrain wrapper is MIT licensed as well. This is a software port,
  not the Mutable Instruments hardware.

## Versions

- **0.5.110**: the CV inputs add to their knob instead of replacing it.
- **October 2026** (editor): the engine name is shown next to the number.
- **0.5.90**: engine numbering corrected and all 24 engines reachable (the
  knob stopped at 15 and used the old list of 16 names); existing patches
  sound the same.
- **Simulator** (September 2026): the browser runs the same Plaits code as
  WebAssembly.
- **0.5.29**: first version (July 2026).
