## Overview

A port of the segment generator from Mutable Instruments Stages: up to six
segments in a chain that together make one control signal. Without a loop
it is an envelope with as many breakpoints as you like; with Loop on, the
segments from L-start to L-end repeat and it becomes a multi-stage LFO.
Active sets how many segments take part (1 to 6).

Each segment has a type switch and two knobs: T (primary) and S
(secondary). What they do depends on the type: on a ramp T is the time and
S the shape, on a hold T is the level and S the time, on a step T is the
level and S the glide. The Gate input starts or holds the chain, Out is the
signal (0 to 1) and EOC is high while the first segment runs, so it can
retrigger the chain or clock another module.

## How it works

The module wraps the `SegmentGenerator` from the original firmware, with
the segment types ramp, step, hold and alternate. It runs in MusicBrain's
control domain, updated 1000 times a second, which suits Stages: it is a
control-rate design. The audio-rate oscillator modes of the original are
left out.

The knobs are passed on as the original's segment parameters; the output
is used as it comes, from 0 to 1. The browser simulator compiles the same
code to WebAssembly.

## Sources & licences

- Based on Mutable Instruments Stages by Émilie Gillet, open source under
  the MIT licence (vendored in `firmware/lib/mi-stages`).
- The MusicBrain wrapper is MIT licensed as well. This is a software port,
  not the Mutable Instruments hardware.

## Versions

- **September 2026**: the output uses the full 0 to 1 range (it was divided
  by 8, so a VCA opened to only 12.5 %); the browser runs the module as
  WebAssembly.
- **0.5.41**: first version (July 2026): six segments, loop, gate in, EOC
  out.
