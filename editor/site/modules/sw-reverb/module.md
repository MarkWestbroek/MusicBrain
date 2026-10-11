# Plate / spring reverb

## Overview

Plate or spring reverb.

Two reverbs in one module. Plate is the smooth studio plate. Spring is two
springs, slightly different left and right, with the "boing" of a spring
tank in a guitar amp or an old organ.

On the plate, Size sets the decay, Damp how fast the treble dies away, and
Mod adds the slight drift that takes the sound from metal towards air. On the
spring, Size sets how long the springs ring on and Mod adds rumble. Pre is a
predelay of up to 120 ms. Without a cable in R the right side gets the same
input as the left.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Size | 0 … 1 | 0.6 | How long the reverb rings on. |
| Mode | Plate / Spring | Plate | Plate = smooth studio plate; Spring = two springs with the boing. |
| Damp | 0 … 1 | 0.4 | How fast the treble dies away: 0 = bright, 1 = dull. |
| Pre | 0 … 120 ms | 10 | Time before the reverb starts, up to 120 ms. |
| Mod | 0 … 1 | 0.3 | Plate: slight drift, from metal towards air. Spring: rumble. |
| Mix | 0 … 1 | 0.3 | How much reverb is mixed with the dry sound. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| S+ | in | cv | Replaces the Size knob while patched (0 to 1). |
| M+ | in | cv | Replaces the Mix knob while patched (0 to 1). |
| L | in | audio | Audio input, left (or mono). |
| R | in | audio | Audio input, right; leave it empty and the right side gets the left input. |
| L | out | audio | Audio output, left. |
| R | out | audio | Audio output, right. |

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

## Runs on

- **Teensy 4.1** (the MusicBrain Brain).
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

Patches to play (open them in the editor from their page): [CR-78-groove (Grids, zelfspelend)](https://musicbrain.nl/patches/cr-78-groove-grids-zelfspelend), [CMI + REVERB (golvend)](https://musicbrain.nl/patches/cmi-reverb-golvend).

In the editor's example set: *🎤 Zingende stem ×8*, *🎚 Mixtur + Plate reverb*, *🖥 CMI (Fairlight-stem)*, *🏛️ Rings + Plate reverb*, *🪃 STK + Spring reverb*, *🌊 West Coast (Turing + Folder + LPG)*, *🎚 Mixtur + Plate*, *🖥 Fairlight CMI*, *🌊 West Coast*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- The plate follows the reverb tank topology in
  J. Dattorro, "Effect Design, Part 1: Reverberator and Other Filters", J. Audio Eng. Soc. 45(9), 1997;
  the spring is our own dispersive all-pass model. No third-party code.
- Own kernel `mmb_dsp/reverb.h`, MIT licence.

## Versions

- **0.5.78**: plate output lowered; a sustained tone could build up above
  full scale.
- **0.5.77**: a module that drops out of the patch frees its buffers and
  gets fresh ones when it is reused.
- **0.5.72**: first version (effects batch with harmonizer, tremolo and
  stereo phaser).
