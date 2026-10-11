## Overview

A stereo phaser: sweeping notches in the spectrum, with the left and right
sweeps offset from each other. Spread sets the offset: 0 is mono, 0.5 is a
quarter cycle (wide and turning), 1 is opposite phase, where the notches on
the left sit where the right is open.

Fbk makes the notches resonate for a sharper, more vocal sweep. A mono input
gives a stereo output; with a cable in R it stays true stereo.

## How it works

Each side is the same kernel as the mono Phaser module: a cascade of six
first-order all-pass filters whose coefficient is moved by a triangle LFO.
Mixed with the dry signal, the phase shifts turn into moving notches. The
right side's LFO follows the left one at a fixed distance set by Spread. The
same C++ kernel runs on the Teensy and in the browser.

## Sources & licences

- Classic all-pass phaser design; no third-party code.
- Own kernels `mmb_dsp/stereo_phaser.h` and `mmb_dsp/phaser.h`, MIT
  licence.

## Versions

- **0.5.72**: first version (effects batch with harmonizer, plate/spring
  reverb and tremolo).
