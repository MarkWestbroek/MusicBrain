# Ladder filter

## Overview

A Moog-style ladder filter: 24 dB low-pass.

A four-pole, 24 dB per octave low-pass filter in the style of the Moog
ladder. Turn Resonance up and a peak grows at the cutoff; from about 1.1 the
filter starts to sing on its own and becomes a sine oscillator that follows
the cutoff. Drive pushes the input into the saturation of the ladder: at 1 it
is clean, above 1 it gets fatter and rounder.

Cutoff, resonance and drive each have a CV input with its own depth knob, so
an envelope or LFO can sweep the filter; on the Teensy the cutoff and
resonance inputs run at audio rate.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Cutoff | 20 … 18000 Hz | 2000 | The brightness: how much treble gets through. |
| Res (Q) | 0 … 1.8 | 0.7 | Resonance: a peak at the cutoff; turned up high it sings. |
| Drive | 0 … 4 | 1 | How hard the filter is driven: more = fatter and distorted. |
| F CV amt | 0 … 7 oct | 2 | How many octaves the cutoff moves for a full-scale signal on F CV. |
| Res CV amt | 0 … 1 | 0.5 | How much a full-scale signal on Res CV adds to the resonance. |
| Drv CV amt | 0 … 1 | 0.5 | How strongly Drv CV changes the drive (at 1: ±1 CV is ×4 … ÷4). |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| In | in | audio | The audio to be filtered. |
| F CV | in | cv | Cutoff modulation, one octave per unit × F CV amt; audio rate on the Teensy. |
| Res CV | in | cv | Resonance modulation on top of the Res knob. |
| Drv CV | in | cv | Drive modulation. |
| Out | out | audio | Low-pass output, 24 dB per octave. |

## Listen

A recording on the MusicBrain Brain, with the patch it was played on: <https://musicbrain.nl/patches/6-stemmig-ladder-filter>

## How it works

The filter is Antti Huovilainen's non-linear model of the Moog transistor
ladder: four one-pole stages with a saturating (tanh-shaped) feedback path,
computed at four times the sample rate so the saturation stays clean. The
bass loss that a real ladder shows at high resonance is half compensated, as
in the Teensy Audio Library version this kernel started from.

Since firmware 0.5.103 the browser simulator and the Teensy run exactly the
same C++ kernel (`mmb_dsp/ladder.h`): our own 65-tap oversampling filter and a
soft output limiter. The earlier library version wrapped around when its
output went above full scale, which gave harsh aliasing at high drive (−35 dB
with a sawtooth at drive 4; now −115 dB).

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): about **8.3 % CPU per instance**, measured on firmware 0.5.107.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

Patches to play (open them in the editor from their page): [6-stemmig ladder-filter](https://musicbrain.nl/patches/6-stemmig-ladder-filter).

Open the editor and choose **Axel F lead** from the standard set, or **Poly ▾ → Ladder-filter ×4**.

In the editor's example set: *🎺 CS-80 brass (aftertouch)*, *🎹 Axel F-lead (2 saws)*, *🎺 CS-80 brass ×4*, *🎸 Axel F lead*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- A. Huovilainen, "Non-Linear Digital Implementation of the Moog Ladder
  Filter", Proc. DAFx-04, Naples, 2004.
- V. Välimäki, A. Huovilainen, "Oscillator and Filter Algorithms for Virtual
  Analog Synthesis", Computer Music Journal 30(2), 2006.
- The arithmetic follows `AudioFilterLadder` by Richard van Hoesel (2021) in
  the Teensy Audio Library by PJRC (MIT licence). The MusicBrain kernel is
  MIT licensed as well.

## Versions

- **0.5.107**: about 40 % lighter on the Teensy (faster oversampling filter,
  coefficients only recomputed when the cutoff changes).
- **0.5.103**: own kernel shared by the browser and the Teensy; no more
  wrap-around at high drive.
- **0.5.33**: drive CV input.
- **First version** (July 2026): the Teensy Audio Library ladder with
  audio-rate cutoff and resonance CV.
