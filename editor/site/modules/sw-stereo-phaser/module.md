# Stereo phaser

## Overview

Stereo phaser: sweeping notches, offset between left and right.

A stereo phaser: sweeping notches in the spectrum, with the left and right
sweeps offset from each other. Spread sets the offset: 0 is mono, 0.5 is a
quarter cycle (wide and turning), 1 is opposite phase, where the notches on
the left sit where the right is open.

Fbk makes the notches resonate for a sharper, more vocal sweep. A mono input
gives a stereo output; with a cable in R it stays true stereo.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Rate | 0.02 … 8 Hz | 0.4 | How fast the phaser sweeps. |
| Depth | 0 … 1 | 0.7 | How deep. |
| Fbk | 0 … 0.95 | 0.3 | Makes the notches resonate: a sharper, more vocal sweep. |
| Spread | 0 … 1 | 0.5 | Offset between left and right: 0 = mono, 0.5 = a quarter cycle, 1 = opposite phase. |
| Mix | 0 … 1 | 0.5 | How much phaser is mixed with the dry sound. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| R+ | in | cv | Replaces the Rate knob while patched; the value is read in Hz. |
| D+ | in | cv | Replaces the Depth knob while patched (0 to 1). |
| L | in | audio | Audio input, left (or mono). |
| R | in | audio | Audio input, right; leave it empty for mono in, stereo out. |
| L | out | audio | Audio output, left. |
| R | out | audio | Audio output, right. |

## How it works

Each side is the same kernel as the mono Phaser module: a cascade of six
first-order all-pass filters whose coefficient is moved by a triangle LFO.
Mixed with the dry signal, the phase shifts turn into moving notches. The
right side's LFO follows the left one at a fixed distance set by Spread. The
same C++ kernel runs on the Teensy and in the browser.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain).
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *🌀 Plaits + Stereo phaser*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Classic all-pass phaser design; no third-party code.
- Own kernels `mmb_dsp/stereo_phaser.h` and `mmb_dsp/phaser.h`, MIT
  licence.

## Versions

- **0.5.72**: first version (effects batch with harmonizer, plate/spring
  reverb and tremolo).
