## Overview

A plate reverb with a pitch shifter in its loop. The reverb tail is shifted
up by an interval and fed back into the reverb, so every round adds a layer
one interval higher: a shimmering cloud above whatever you play. +12 (an
octave) is the familiar sound; +7, +19, +24 and −12 are there too.

Shimmer sets how much of the shifted sound goes back in; at 0 it is a plain
plate. Tone sets how bright the loop is: lower is warmer, with less
whistling. Size, Damp, Pre and Mod work as on the plate reverb. Without a
cable in R the right side gets the same input as the left.

## How it works

The reverb is the same plate tank as the Reverb module (after Dattorro). Its
wet signal goes through a grain pitch shifter: the sound is cut into short
grains with a Hann window, each played faster or slower, four overlapping at
a time. On a diffuse, chord-rich reverb tail that is smoother than a
two-head shifter.

A high-pass and low-pass pair in the loop (Tone: from about 2 kHz to
10 kHz) keeps the build-up in check. Because the reverb already amplifies
itself, an envelope follower brakes the loop gain when the tail gets loud,
and a soft limiter stops it from running away. The same C++ kernel runs on
the Teensy and in the browser.

## Sources & licences

- The plate follows the reverb tank topology in
  J. Dattorro, "Effect Design, Part 1: Reverberator and Other Filters", J. Audio Eng. Soc. 45(9), 1997 (see the Reverb module); no third-party code.
- Own kernels `mmb_dsp/shimmer.h`, `mmb_dsp/reverb.h` and
  `mmb_dsp/pitch_shift.h`, MIT licence.

## Versions

- **0.5.78**: first version. Measured on the Teensy: about 17 % CPU.
