## Overview

A low-frequency oscillator with five waves: sine, triangle, saw, square and
sample & hold (a new random value each cycle). Use it for vibrato on a
pitch, a slow filter sweep, tremolo on a VCA or a random wobble.

Bip on gives a signal around zero (−Depth … +Depth), right for pitch and
filter. Bip off gives 0 … Depth, right for a VCA or anything that should
only go up. Inv is the same signal upside down, so one VCA can rise while
another falls. A pulse on Rst starts the cycle again, to keep several LFOs
in step.

Run chooses when it moves: Always runs freely, Gated only while the Gate
input is high, OneShot runs one cycle on each rising edge at Gate and then
stops — a simple extra envelope.

## How it works

The LFO runs at the control rate of 1 kHz. Rate is set in hertz (0.01 …
50 Hz on the knob). The Rate input bends the speed exponentially: with the
Rate CV knob at 1, +1 on the input makes the LFO 16 times faster (four
octaves) and −1 16 times slower; 0 ignores the input and negative values
turn it round.

The sample & hold value comes from a small pseudo-random generator and
changes once per cycle.

## Sources & licences

- Our own code, MIT licence.

## Versions

- **0.5.109**: Gate input on the panel, so Gated and OneShot work (before,
  those modes waited for an input that was not there).
- **0.5.82**: attenuverter on the Rate input (Rate CV, −1 … +1).
- **First version** (May 2026): five waves, depth, bipolar or unipolar,
  rate CV, reset and an inverted output.
