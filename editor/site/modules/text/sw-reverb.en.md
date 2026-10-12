## Overview

Two reverbs in one module. Plate is the smooth studio plate. Spring is two
springs, slightly different left and right, with the "boing" of a spring
tank in a guitar amp or an old organ.

On the plate, Size sets the decay, Damp how fast the treble dies away, and
Mod adds the slight drift that takes the sound from metal towards air. On the
spring, Size sets how long the springs ring on and Mod adds rumble. Pre is a
predelay of up to 120 ms. Without a cable in R the right side gets the same
input as the left.

## How it works

Plate is the Dattorro tank: input diffusion, two modulated all-pass filters,
four delays in a figure-of-eight loop with damping inside, and seven output
taps per side. The original delay lengths, given for 29,761 Hz, are scaled to
the sample rate.

Spring is a delay line in feedback with eight first-order all-pass filters
in the loop. Those make the delay depend on frequency: low tones arrive later
than high ones, and that dispersion is the boing. A band-pass at the input
(about 200 Hz to 4 kHz) keeps out the sub and the air, a low-pass damps the
loop, and modulation adds the rumble. The same C++ kernel runs on the Teensy
and in the browser.

## Sources & licences

- The plate follows the reverb tank topology in
  J. Dattorro, "Effect Design, Part 1: Reverberator and Other Filters", J. Audio Eng. Soc. 45(9), 1997;
  the spring is our own dispersive all-pass model. No third-party code.
- Own kernel `mmb_dsp/reverb.h`, MIT licence.

## Versions

- **0.5.110**: the CV inputs add to their knob instead of replacing it.
- **0.5.78**: plate output lowered; a sustained tone could build up above
  full scale.
- **0.5.77**: a module that drops out of the patch frees its buffers and
  gets fresh ones when it is reused.
- **0.5.72**: first version (effects batch with harmonizer, tremolo and
  stereo phaser).
