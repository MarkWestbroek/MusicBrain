## Overview

A function generator: one circuit that rises and falls, and becomes an
envelope, an LFO, a lag or an envelope follower depending on what you patch
into it.

- **Trig**: each trigger makes the output rise to 1 (Rise) and fall back to
  0 (Fall): an attack–decay envelope. Triggers during the rise are ignored,
  so a fast clock gets divided.
- **In**: the output follows the input, upwards at the Rise speed and
  downwards at the Fall speed. A gate gives an attack–sustain–release
  envelope, a pitch CV gives portamento with separate up and down times, a
  rectified signal gives an envelope follower.
- **Cycle**: at the end of the fall it starts again by itself, an LFO whose
  shape (saw, triangle, ramp) comes from Rise and Fall.

## How it works

The module runs at the control rate of 1 kHz. Rise and Fall are the time
for a full stroke from 0 to 1 and back, 1 ms to 20 s. Shape bends the lines:
log gives a fast start and a slow approach (like a capacitor charging), lin
a straight line, exp a slow start and a fast end; the time for a full
stroke stays about the same. The Time input stretches both times: +1 makes
them eight times longer, −1 eight times shorter.

Inv is 1 − Out. EOR (end of rise) is high while the output falls; EOC (end
of cycle) gives a 10 ms pulse when the fall is done, to chain a second
Slope or use it as a clock.

## Sources & licences

- Modelled on the classic West Coast building block: the Serge Dual
  Universal Slope Generator and, later, Make Noise Maths.
- Our own code, MIT licence.

## Versions

- **0.5.95**: first version.
