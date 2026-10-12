# VCA

## Overview

Amplifier: controls the volume.

A voltage-controlled amplifier. Gain sets a base level and the CV input adds
on top: patch an envelope into CV with Gain at 0 and every note gets its
shape; turn Gain up and the VCA stays partly open, with the envelope riding
on top. With Gain at 0 and nothing on CV the VCA is closed.

Resp chooses the curve. Lin is linear (0.5 gives half the amplitude); Exp is
exponential over 48 dB, so an envelope decay sounds like a natural fade
rather than a sudden drop at the end.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Gain | 0 … 1 | 0 | The base volume; an envelope on CV adds on top. |
| Resp | Lin / Exp | Lin | Lin: in a straight line. Exp: an exponential curve, so an envelope fades naturally. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| In | in | audio | The audio to be amplified. |
| CV | in | cv | The level, 0 … 1, typically from an envelope; linear. |
| Out | out | audio | The audio at the level set by CV. |

## How it works

The level is Gain + CV, limited to 0 … 1, then shaped by the curve. The VCA
multiplies the audio by that level. The CV arrives at the control rate
(1 kHz); to avoid zipper noise from those 1 ms steps, each new value is
reached with a 2 ms linear slide, so the steps join into a smooth curve.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): about **0.2 % CPU per instance** (one note, default settings), measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

Patches to play (open them in the editor from their page): [6-stemmig ladder-filter](https://musicbrain.nl/patches/6-stemmig-ladder-filter).

In the editor's example set: *1-stemmig (mono)*, *2-stemmig*, *4-stemmig*, *8-stemmig*, *16-stemmig*, *4-stemmig + aftertouch → filter*, *🎺 CS-80 brass (aftertouch)*, *🎹 Axel F-lead (2 saws)*, *Reservoir demo (gedeelde bron)*, *🌌 Krell (zelfspelend)*, *🎺 CS-80 brass ×4*, *🎸 Axel F lead*, *🌌 Krell*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- The multiplier is `AudioEffectMultiply`, with an `AudioSynthWaveformDc`
  carrying the level, from the Teensy Audio Library by PJRC (MIT licence).
- The MusicBrain module code is MIT licensed.

## Versions

- **0.5.108**: Gain and Resp work (before, only the CV set the level).
- **First version** (May 2026): linear VCA with the 2 ms CV slide.
