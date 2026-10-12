## Overview

A voltage-controlled amplifier. Gain sets a base level and the CV input adds
on top: patch an envelope into CV with Gain at 0 and every note gets its
shape; turn Gain up and the VCA stays partly open, with the envelope riding
on top. With Gain at 0 and nothing on CV the VCA is closed.

Resp chooses the curve. Lin is linear (0.5 gives half the amplitude); Exp is
exponential over 48 dB, so an envelope decay sounds like a natural fade
rather than a sudden drop at the end.

## How it works

The level is Gain + CV, limited to 0 … 1, then shaped by the curve. The VCA
multiplies the audio by that level. The CV arrives at the control rate
(1 kHz); to avoid zipper noise from those 1 ms steps, each new value is
reached with a 2 ms linear slide, so the steps join into a smooth curve.

## Sources & licences

- The multiplier is `AudioEffectMultiply`, with an `AudioSynthWaveformDc`
  carrying the level, from the Teensy Audio Library by PJRC (MIT licence).
- The MusicBrain module code is MIT licensed.

## Versions

- **0.5.108**: Gain and Resp work (before, only the CV set the level).
- **First version** (May 2026): linear VCA with the 2 ms CV slide.
