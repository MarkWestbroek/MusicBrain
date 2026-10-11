# CV math

## Overview

Does sums with control signals: adding and scaling.

A small calculator for control voltages. In Sum mode it adds up to three
inputs, each with its own gain, plus a fixed offset: use it to scale a
signal, turn it upside down (negative gain), mix two modulators or shift a
CV up or down. In Mult mode it multiplies A by B, for example an envelope
times the key velocity, so harder notes open the VCA further.

The gains run from −2 to +2, so you can also boost a weak signal.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Mode | Sum / Mult | Sum | Sum adds A, B, C and the offset; Mult multiplies A by B. |
| Gain A | -2 … 2 | 1 | How much of input A counts. |
| Gain B | -2 … 2 | 1 | How much of input B counts; in Mult mode 0 gives silence. |
| Gain C | -2 … 2 | 1 | How much of input C counts (here often pressure or the LFO). |
| Offset | -5 … 5 | 0 | A fixed value added to the sum (Sum mode only). |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| A | in | cv | First input. |
| B | in | cv | Second input; the multiplier in Mult mode. |
| C | in | cv | Third input, used in Sum mode only. |
| Out | out | cv | The result, limited to ±10 in Sum mode. |

## How it works

Sum: out = A × Gain A + B × Gain B + C × Gain C + Offset, limited to
−10 … +10.

Mult: out = (A × Gain A) × (B × Gain B). Input C and the offset are not used.
This is a true product: with Gain B at 0 the output is 0 (silence), not "A
without B". With envelope × velocity, Gain B above 1 lifts soft notes and
below 1 makes the whole thing quieter.

The module has no memory and no timing of its own; it computes the result
every control tick (1 kHz).

## Runs on

- **Teensy 4.1** (the MusicBrain Brain).
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

Patches to play (open them in the editor from their page): [6-stemmig ladder-filter](https://musicbrain.nl/patches/6-stemmig-ladder-filter).

In the editor's example set: *1-stemmig (mono)*, *2-stemmig*, *4-stemmig*, *8-stemmig*, *16-stemmig*, *4-stemmig + aftertouch → filter*, *🎺 CS-80 brass (aftertouch)*, *🎹 Axel F-lead (2 saws)*, *🎧 Sampler ×8 (cellen)*, *🎧 Sampler ×8 auto-wah*, *🎧 Sampler ×8 auto-wah + FET*, *🎧 Sampler ×8 + EQ + Vari-mu*, *🎺 CS-80 brass ×4*, *🎸 Axel F lead*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Our own code, MIT licence.

## Versions

- **July 2026**: in Mult mode the gains of A and B apply as well.
- **0.5.6**: first version, used for velocity × envelope in the poly
  patches.
