# Stages segment generator

## Overview

A chain of segments: envelope or LFO (Mutable Instruments Stages).

A port of the segment generator from Mutable Instruments Stages: up to six
segments in a chain that together make one control signal. Without a loop
it is an envelope with as many breakpoints as you like; with Loop on, the
segments from L-start to L-end repeat and it becomes a multi-stage LFO.
Active sets how many segments take part (1 to 6).

Each segment has a type switch and two knobs: T (primary) and S
(secondary). What they do depends on the type: on a ramp T is the time and
S the shape, on a hold T is the level and S the time, on a step T is the
level and S the glide. The switch reads R (ramp), S (step), H (hold), A
(alternate). Rate scales all times at once, from 0.05× to 20×. The Gate input starts or holds the chain, Out is the
signal (0 to 1) and EOC is high while the first segment runs, so it can
retrigger the chain or clock another module.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| T1 | 0 … 1 | 0.5 | The time of the first segment: faster or slower. |
| S1 | 0 … 1 | 0.5 | Secondary knob of segment 1: shape on a ramp, time on a hold, glide on a step. |
| type1 | R / S / H / A | R | Type of segment 1: R ramp, S step, H hold, A alternate. |
| T2 | 0 … 1 | 0.5 | Primary knob of segment 2: time on a ramp, level on a hold or step. |
| S2 | 0 … 1 | 0.5 | Secondary knob of segment 2: shape on a ramp, time on a hold, glide on a step. |
| type2 | R / S / H / A | R | Type of segment 2: R ramp, S step, H hold, A alternate. |
| T3 | 0 … 1 | 0.5 | Primary knob of segment 3: time on a ramp, level on a hold or step. |
| S3 | 0 … 1 | 0.5 | Secondary knob of segment 3: shape on a ramp, time on a hold, glide on a step. |
| type3 | R / S / H / A | R | Type of segment 3: R ramp, S step, H hold, A alternate. |
| T4 | 0 … 1 | 0.5 | Primary knob of segment 4: time on a ramp, level on a hold or step. |
| S4 | 0 … 1 | 0.5 | Secondary knob of segment 4: shape on a ramp, time on a hold, glide on a step. |
| type4 | R / S / H / A | R | Type of segment 4: R ramp, S step, H hold, A alternate. |
| T5 | 0 … 1 | 0.5 | Primary knob of segment 5: time on a ramp, level on a hold or step. |
| S5 | 0 … 1 | 0.5 | Secondary knob of segment 5: shape on a ramp, time on a hold, glide on a step. |
| type5 | R / S / H / A | R | Type of segment 5: R ramp, S step, H hold, A alternate. |
| T6 | 0 … 1 | 0.5 | Primary knob of segment 6: time on a ramp, level on a hold or step. |
| S6 | 0 … 1 | 0.5 | Secondary knob of segment 6: shape on a ramp, time on a hold, glide on a step. |
| type6 | R / S / H / A | R | Type of segment 6: R ramp, S step, H hold, A alternate. |
| Active | 1 … 6 | 3 | How many segments take part (1–6). |
| Loop | off / on | off | Repeat the segments from L-start to L-end: an LFO. |
| L-start | 0 … 5 | 0 | First segment of the loop (0 = segment 1). |
| L-end | 0 … 5 | 2 | Last segment of the loop. |
| Rate | 0.05 … 20 | 1 | Overall time scale for all segments: 0.05× (slow) to 20× (fast). |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| Gate | in | gate | Starts the chain, and holds it while high. |
| Out | out | cv | The generated signal, 0 to 1. |
| EOC | out | gate | High while the first segment runs. |

## How it works

The module wraps the `SegmentGenerator` from the original firmware, with
the segment types ramp, step, hold and alternate. It runs in MusicBrain's
control domain, updated 1000 times a second, which suits Stages: it is a
control-rate design. The audio-rate oscillator modes of the original are
left out.

The knobs are passed on as the original's segment parameters; the output
is used as it comes, from 0 to 1. The browser simulator compiles the same
code to WebAssembly.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): less than **0.1 % CPU** per instance, measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *🌌 Krell (zelfspelend)*, *🌌 Krell*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Based on Mutable Instruments Stages by Émilie Gillet, open source under
  the MIT licence (vendored in `firmware/lib/mi-stages`).
- The MusicBrain wrapper is MIT licensed as well. This is a software port,
  not the Mutable Instruments hardware.

## Versions

- **0.5.109**: Rate works as an overall time scale; the type switch labels
  match what the segments do (S and H were swapped on the panel).
- **September 2026**: the output uses the full 0 to 1 range (it was divided
  by 8, so a VCA opened to only 12.5 %); the browser runs the module as
  WebAssembly.
- **0.5.41**: first version (July 2026): six segments, loop, gate in, EOC
  out.
