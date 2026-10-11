# Slope

## Overview

A function generator: rise and fall, as an envelope or LFO.

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

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Rise | 0.001 … 20 s | 0.05 | How fast it rises. |
| Fall | 0.001 … 20 s | 0.5 | How fast it falls: the length of the note. |
| Shape | -1 … 1 | 0 | Bends the lines: log (fast start), lin (straight) or exp (slow start). |
| Cycle | off / on | off | On: restarts at the end of the fall, so it runs as an LFO. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| In | in | cv | The output follows this signal, up at the Rise speed and down at the Fall speed. |
| Trig | in | gate | A rising edge starts a rise to 1 followed by a fall. |
| Time | in | cv | Stretches both times: +1 is eight times longer, −1 eight times shorter. |
| Out | out | cv | The slope, 0 … 1. |
| Inv | out | cv | 1 minus Out. |
| EOR | out | gate | End of rise: high while the output falls. |
| EOC | out | gate | End of cycle: a 10 ms pulse when the fall is done. |

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

## Runs on

- **Teensy 4.1** (the MusicBrain Brain).
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *🎛️ Buchla-stem (Complex + LPG)*, *🎚️ SEM sweep (LP → notch → HP)*, *🧪 Buchla voice*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Modelled on the classic West Coast building block: the Serge Dual
  Universal Slope Generator and, later, Make Noise Maths.
- Our own code, MIT licence.

## Versions

- **0.5.95**: first version.
