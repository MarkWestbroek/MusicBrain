# Shimmer reverb

## Overview

Reverb with an octave up in the loop: a shimmering cloud.

A plate reverb with a pitch shifter in its loop. The reverb tail is shifted
up by an interval and fed back into the reverb, so every round adds a layer
one interval higher: a shimmering cloud above whatever you play. +12 (an
octave) is the familiar sound; +7, +19, +24 and −12 are there too.

Shimmer sets how much of the shifted sound goes back in; at 0 it is a plain
plate. Tone sets how bright the loop is: lower is warmer, with less
whistling. Size, Damp, Pre and Mod work as on the plate reverb. Without a
cable in R the right side gets the same input as the left.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Shimmer | 0 … 1 | 0.5 | How much of the shifted sound goes back into the reverb (0 = plain reverb). |
| Interval | +12 / +7 / +19 / +24 / −12 | +12 | How far the tail is shifted each round: +12 (an octave), +7, +19, +24 or −12 semitones. |
| Size | 0 … 1 | 0.75 | How big and long the reverb. |
| Damp | 0 … 1 | 0.35 | How fast the treble dies away in the reverb. |
| Tone | 0 … 1 | 0.6 | Brightness of the shimmer loop: lower is warmer, with less whistling. |
| Pre | 0 … 120 ms | 20 | Time before the reverb starts, up to 120 ms. |
| Mod | 0 … 1 | 0.4 | Slight drift in the reverb tank. |
| Mix | 0 … 1 | 0.4 | How much reverb is mixed with the dry sound. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| Sh+ | in | cv | Replaces the Shimmer knob while patched (0 to 1). |
| S+ | in | cv | Replaces the Size knob while patched (0 to 1). |
| M+ | in | cv | Replaces the Mix knob while patched (0 to 1). |
| L | in | audio | Audio input, left (or mono). |
| R | in | audio | Audio input, right; leave it empty and the right side gets the left input. |
| L | out | audio | Audio output, left. |
| R | out | audio | Audio output, right. |

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

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): about **18.1 % CPU per instance** (one note, default settings), measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *✨ Rings + Shimmer*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- The plate follows the reverb tank topology in
  J. Dattorro, "Effect Design, Part 1: Reverberator and Other Filters", J. Audio Eng. Soc. 45(9), 1997 (see the Reverb module); no third-party code.
- Own kernels `mmb_dsp/shimmer.h`, `mmb_dsp/reverb.h` and
  `mmb_dsp/pitch_shift.h`, MIT licence.

## Versions

- **0.5.78**: first version. Measured on the Teensy: about 17 % CPU.
