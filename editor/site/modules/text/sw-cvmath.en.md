## Overview

A small calculator for control voltages. In Sum mode it adds up to three
inputs, each with its own gain, plus a fixed offset: use it to scale a
signal, turn it upside down (negative gain), mix two modulators or shift a
CV up or down. In Mult mode it multiplies A by B, for example an envelope
times the key velocity, so harder notes open the VCA further.

The gains run from −2 to +2, so you can also boost a weak signal.

## How it works

Sum: out = A × Gain A + B × Gain B + C × Gain C + Offset, limited to
−10 … +10.

Mult: out = (A × Gain A) × (B × Gain B). Input C and the offset are not used.
This is a true product: with Gain B at 0 the output is 0 (silence), not "A
without B". With envelope × velocity, Gain B above 1 lifts soft notes and
below 1 makes the whole thing quieter.

The module has no memory and no timing of its own; it computes the result
every control tick (1 kHz).

## Sources & licences

- Our own code, MIT licence.

## Versions

- **July 2026**: in Mult mode the gains of A and B apply as well.
- **0.5.6**: first version, used for velocity × envelope in the poly
  patches.
