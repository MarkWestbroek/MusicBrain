## Overview

A stereo chorus and flanger in the style of the bucket-brigade (BBD) units of
the late seventies, the CE-1 and Dimension family. A short delay is pulled
back and forth by a slow LFO; the copy, slightly out of tune with the
original, is mixed back in. Delay sets the character: 2–6 ms flanges, 8–20 ms
is chorus, above 20 ms it becomes doubling.

Put it after a voice or a whole mix. A mono input gives a stereo output; with
a cable in R it stays true stereo. Spread at 1 runs the two sides in
opposite phase, the wide Dimension image; Fbk, positive or negative, pushes
it towards a flanger.

## How it works

Each side is a delay line of up to 40 ms read by a triangle LFO with slightly
rounded turning points, so they do not click. The LFO swings the delay by up
to ±60 % of the centre value. The right side runs the same LFO shifted by
half a cycle times Spread.

The sound of a BBD lives in the chain around the delay, and that is what is
modelled: a low-pass filter at the input and the output (the anti-aliasing
filters of a real chip; Tone sets their bandwidth from about 2 kHz to
12 kHz), a soft compander that saturates when you play hard, and a little
clock noise. Age adds that noise and makes the compander work harder. The
same C++ kernel runs on the Teensy and in the browser.

## Sources & licences

- Modelled on the behaviour of BBD chorus units of the CE-1 / Dimension
  family; no circuit simulation and no third-party code.
- Own kernel `mmb_dsp/bbd_chorus.h`, MIT licence.

## Versions

- **0.5.71**: first version (effects batch with stereo tape echo, digital
  echo, ring modulator and octaver).
