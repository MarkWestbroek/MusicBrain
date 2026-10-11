## Overview

A voltage-controlled amplifier: the audio on In comes out at the level set
by the CV input. Patch an envelope into CV and every note gets its shape;
with nothing on CV the VCA stays closed.

It is linear: a CV of 0.5 gives half the amplitude, 1 gives the full
signal.

## How it works

The VCA multiplies the audio by the CV. The CV arrives at the control rate
(1 kHz); to avoid zipper noise from those 1 ms steps, each new value is
reached with a 2 ms linear slide, so the steps join into a smooth curve.

In the current firmware the Gain knob and the Lin/Exp switch are stored but
not used: the CV alone sets the level.

## Sources & licences

- The multiplier is `AudioEffectMultiply`, with an `AudioSynthWaveformDc`
  carrying the CV, from the Teensy Audio Library by PJRC (MIT licence).
- The MusicBrain module code is MIT licensed.

## Versions

- **First version** (May 2026): linear VCA with the 2 ms CV slide.
