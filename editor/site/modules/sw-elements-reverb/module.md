# Elements reverb

## Overview

Plate reverb (from Mutable Instruments Elements).

The stereo reverb from Mutable Instruments Elements as a module of its own.
Amount sets how much reverb you hear, Time how long the tail lasts, Diff
how dense the echoes are, and Damp how dark the tail gets (lower is
darker). It suits pads, plucks and anything that needs a room.

Patch a stereo pair into In L and In R, or only In L for a mono source:
both inputs go into the same tank, and the reverb comes out spread over
Out L and Out R.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Amount | 0 … 1 | 0.5 | How much reverb. |
| Time | 0 … 1 | 0.5 | How long the tail lasts. |
| Diff | 0 … 1 | 0.625 | How dense the echoes are. |
| Damp | 0 … 1 | 0.7 | Damping in the tail: lower is darker. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| In L | in | audio | Audio in, left (or mono). |
| In R | in | audio | Audio in, right. |
| Out L | out | audio | Reverb out, left. |
| Out R | out | audio | Reverb out, right. |

## How it works

The reverb is the Griesinger topology described in Dattorro's paper, in
Émilie Gillet's code: four all-pass filters diffuse the input, then the
sound circulates in a loop of two branches, each with two all-passes and a
delay, damped by a low-pass. Two slow LFOs smear the first diffuser and the
long delays, which gives the tail a gentle chorus.

On the Teensy the reverb runs at 44.1 kHz with a 64 KB delay buffer on the
heap (the original Elements runs at 32 kHz). The browser simulator compiles
the same code to WebAssembly.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain).
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

Patches to play (open them in the editor from their page): [MS-20-ed Hammond w/ Tape Delay & Lesley](https://musicbrain.nl/patches/ms-20-ed-hammond-w-tape-delay-lesley).

In the editor's example set: *🎺 CS-80 brass (aftertouch)*, *🎺 CS-80 brass ×4*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Based on the reverb of Mutable Instruments Elements by Émilie Gillet,
  open source under the MIT licence (vendored in `mi-elements`).
- The topology is the one described in
  J. Dattorro, "Effect Design, Part 1: Reverberator and Other Filters", J. Audio Eng. Soc. 45(9), 1997.
- The MusicBrain wrapper is MIT licensed as well. This is a software port,
  not the Mutable Instruments hardware.

## Versions

- **Simulator** (September 2026): the reverb plays in the browser.
- **July 2026**: panel in the editor (the reverb was already in the
  firmware without one).
- **First version** (June 2026): split off from the Elements voice as a
  separate stereo module.
