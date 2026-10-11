## Overview

A modulation effect in the style of the Uni-Vibe family and its modern
clones. It is not an ordinary phaser: the sweep is lopsided and pulsing, it
breathes rather than ticks. Mono in gives stereo out.

Mode Chorus mixes dry and wet signal for the classic sound, between chorus
and phaser. Vibrato is wet only, so the phase shift pulls at the pitch.
Light is a clean delay-line vibrato without the lamp character. Speed and
Intensity have CV inputs; an expression pedal or envelope on Speed does what
the foot-pedal version of the original did.

## How it works

Four phase-shift stages each use a different capacitor (15 nF, 220 nF,
470 pF and 4.7 nF), so the notches are spread widely over the spectrum
instead of sitting in a neat row. All four stage resistors are light-
dependent resistors around one small bulb, driven by an LFO. The bulb's
brightness goes roughly with the square of its current, and the LDRs turn
low-resistance quickly when the light comes on (about 6 ms) but recover
slowly in the dark (about 60 ms). That gives the skewed, throbbing sweep.

Lamp age sets how much of that character is present: 0 is a clean sine
sweep, 1 the lopsided sweep of an old unit. In Light mode a delay line is
modulated by a sine between 0.5 and 6 ms, wet only. The same C++ kernel
(`mmb_dsp/vibe.h`) runs on the Teensy and in the browser.

## Sources & licences

- Own implementation (MIT licence), modelled on the Uni-Vibe circuit family
  (four phase stages with LDRs around one lamp), including modern clones
  such as the Mojo Vibe.

## Versions

- **0.5.78**: the `lamp` control renamed to Lamp age.
- **0.5.73**: first version: four phase stages, lamp and LDR behaviour,
  Chorus, Vibrato and Light modes, Speed and Intensity CV.
