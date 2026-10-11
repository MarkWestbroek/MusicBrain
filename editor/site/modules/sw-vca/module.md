# VCA

## Overview

Amplifier: controls the volume.

A voltage-controlled amplifier: the audio on In comes out at the level set
by the CV input. Patch an envelope into CV and every note gets its shape;
with nothing on CV the VCA stays closed.

It is linear: a CV of 0.5 gives half the amplitude, 1 gives the full
signal.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Gain | 0 … 1 | 0 | Base volume; stored but not yet used by the firmware, so only CV sets the level. |
| Resp | Lin / Exp | Lin | Linear or exponential response; stored but not yet used by the firmware. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| In | in | audio | The audio to be amplified. |
| CV | in | cv | The level, 0 … 1, typically from an envelope; linear. |
| Out | out | audio | The audio at the level set by CV. |

## How it works

The VCA multiplies the audio by the CV. The CV arrives at the control rate
(1 kHz); to avoid zipper noise from those 1 ms steps, each new value is
reached with a 2 ms linear slide, so the steps join into a smooth curve.

In the current firmware the Gain knob and the Lin/Exp switch are stored but
not used: the CV alone sets the level.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain).
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

Patches to play (open them in the editor from their page): [6-stemmig ladder-filter](https://musicbrain.nl/patches/6-stemmig-ladder-filter).

In the editor's example set: *1-stemmig (mono)*, *2-stemmig*, *4-stemmig*, *8-stemmig*, *16-stemmig*, *4-stemmig + aftertouch → filter*, *🎺 CS-80 brass (aftertouch)*, *🎹 Axel F-lead (2 saws)*, *Reservoir demo (gedeelde bron)*, *🌌 Krell (zelfspelend)*, *🎺 CS-80 brass ×4*, *🎸 Axel F lead*, *🌌 Krell*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- The multiplier is `AudioEffectMultiply`, with an `AudioSynthWaveformDc`
  carrying the CV, from the Teensy Audio Library by PJRC (MIT licence).
- The MusicBrain module code is MIT licensed.

## Versions

- **First version** (May 2026): linear VCA with the 2 ms CV slide.
