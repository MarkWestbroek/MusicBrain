# Marbles random sequencer

## Overview

A random generator that picks notes and rhythm (Mutable Instruments Marbles).

A port of the random generators from Mutable Instruments Marbles: a
self-playing source of rhythm and melody. The t section makes two streams
of random gates (t1, t2) around a clock (tK); the X section makes three
random pitch CVs (X1–X3), quantised to a scale, that you can patch straight
into a V/Oct input. Y is a slower random CV.

Déjà vu is the musical part: at 0 every step is new; turning it up brings
back steps from memory more often, and around the middle the loop locks.
Loop sets its length (1 to 16 steps). Bias decides whether t1 or t2 fires more often, Jitter makes
the timing loose, Spread and Bias X shape how wide and where the notes fall,
Steps goes from smooth to stepped, and Scale and Range pick the scale and
the octave range. The tempo follows the patch tempo (♩ in the toolbar);
with ExtClk on, the Clk jack drives it instead.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Tempo | 10 … 480 bpm | 120 | The tempo (follows ♩ in the toolbar). |
| Spread | 0 … 1 | 0.5 | How widely the X notes are spread. |
| Bias | 0 … 1 | 0.5 | Whether the notes tend to land low or high. |
| Jitter | 0 … 1 | 0 | Loosens the timing of the t gates. |
| Bias X | 0 … 1 | 0.5 | Whether the X notes tend to land low or high. |
| Steps | 0 … 1 | 0.5 | From smooth random voltages to stepped notes in the scale. |
| Déjà vu | 0 … 1 | 0 | Repetition: 0 = always new, around the middle the loop locks. |
| Loop | 1 … 16 | 8 | Length of the déjà vu loop in steps (1–16). |
| Model | Coin / Clus / Drum | Coin | How t1 and t2 are chosen: coin toss, clusters or drums. |
| Scale | Maj / Min / Pent / Pelog / Bhai / Shri | Maj | Scale for the X notes: major, minor, pentatonic, pelog, bhairav or shri. |
| Range | +2V / +5V / ±5V | ±5V | Range of X: 0 to 2 V, 0 to 5 V or ±5 V. |
| ExtClk | off / on | off | Follow the Clk jack instead of the internal tempo. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| Clk | in | gate | External clock, used when ExtClk is on. |
| R+ | in | cv | Bends the tempo, ±1 = ±2 octaves. |
| DV+ | in | cv | Added to Déjà vu. |
| Sp+ | in | cv | Added to Spread. |
| t1 | out | gate | Random gates, stream 1. |
| t2 | out | gate | Random gates, stream 2. |
| tK | out | gate | The master clock. |
| X1 | out | cv | Random note CV in volts, quantised to the scale. |
| X2 | out | cv | Second random note CV. |
| X3 | out | cv | Third random note CV. |
| Y | out | cv | Slow random CV, on the clock divided by 16. |

## How it works

The module runs the original `TGenerator` (random gates with the déjà vu
memory) and `XYGenerator` (random voltages with the quantiser and the
preset scales). It runs in MusicBrain's control domain, 1000 times a
second, so gates have 1 ms resolution, which is plenty for clocks up to
several hundred BPM.

The X outputs are in volts at one volt per octave (0 V is C4): ±5 V, or
0 to 2 V or 0 to 5 V with Range. R+ bends the tempo by up
to two octaves either way; DV+ and Sp+ add to the Déjà vu and Spread knobs.
The browser simulator compiles the same code to WebAssembly.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): less than **0.1 % CPU** per instance, measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *🎲 Generative jam (Marbles)*, *🗣️ Warps vocoder*, *🥁 808 jam (Peaks)*, *🌌 Krell (zelfspelend)*, *🌌 Krell*, *🎲 Generative jam*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Based on Mutable Instruments Marbles by Émilie Gillet, open source under
  the MIT licence (vendored in `firmware/lib/mi-marbles`).
- The MusicBrain wrapper is MIT licensed as well. This is a software port,
  not the Mutable Instruments hardware.

## Versions

- **October 2026** (editor): the Tempo knob follows the patch tempo, tap
  tempo and MIDI clock.
- **Simulator** (September 2026): the browser runs the same Marbles code as
  WebAssembly.
- **0.5.34**: first version (July 2026).
