## Overview

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
