## Overview

A stereo digital echo after the rack delays of the early eighties. The
repeats are not perfect copies: a narrow bandwidth, coarse converters and the
aliasing of a low internal sample rate give them a grainy, slightly dark
edge. A sine LFO on the read head adds chorus to the echoes.

There are two tracks. Ratio sets the right-hand time as a factor of the left
(0.75 or 1.5 give dotted patterns) and Cross sends each track's echo into the
other; Cross at 1 with Fbk at 0 is ping-pong. Without a cable in R, the right
side gets the same input as the left: mono in, stereo out.

## How it works

The character is in the write head. The input plus feedback passes a
low-pass filter at Band, is then held at an internal sample rate of twice
Band (the zero-order hold whose aliasing is the grit of those units), and is
companded µ-law style (µ = 255) and rounded to Bits. Twelve bits is the
classic sound; eight starts to crackle. The converter clips hard, which also
keeps feedback above 1 in check.

The read head is an interpolated tap, moved by up to ±2.5 ms by the
modulation LFO; the right side's LFO runs a quarter cycle behind. A two-pole
reconstruction filter on Band smooths the output. Echo times run from 5 ms to
1 s. The same C++ kernel runs on the Teensy and in the browser.

## Sources & licences

- Modelled on the behaviour of early-eighties digital rack delays; no
  circuit simulation and no third-party code.
- Own kernel `mmb_dsp/digital_echo.h`, MIT licence.

## Versions

- **0.5.110**: the CV inputs add to their knob instead of replacing it.
- **0.5.77**: the echo memory moved to PSRAM; a module that drops out of
  the patch frees its buffers and gets fresh ones when it is reused.
- **0.5.71**: first version (effects batch with stereo tape echo, BBD
  chorus, ring modulator and octaver).
