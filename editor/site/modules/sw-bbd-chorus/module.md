# BBD chorus

## Overview

Analogue bucket-brigade chorus: wider and warmer.

A stereo chorus and flanger in the style of the bucket-brigade (BBD) units of
the late seventies, the CE-1 and Dimension family. A short delay is pulled
back and forth by a slow LFO; the copy, slightly out of tune with the
original, is mixed back in. Delay sets the character: 2–6 ms flanges, 8–20 ms
is chorus, above 20 ms it becomes doubling.

Put it after a voice or a whole mix. A mono input gives a stereo output; with
a cable in R it stays true stereo. Spread at 1 runs the two sides in
opposite phase, the wide Dimension image; Fbk, positive or negative, pushes
it towards a flanger.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Rate | 0.02 … 12 Hz | 0.6 | How fast the LFO sweeps the delay, in Hz. |
| Depth | 0 … 1 | 0.5 | How far the delay swings: up to ±60 % of Delay. |
| Delay | 0.5 … 40 ms | 8 | The centre delay: 2–6 ms flanger, 8–20 ms chorus, above 20 ms doubling. |
| Fbk | -0.95 … 0.95 | 0 | Feeds the output back in, positive or negative, for the flanger side. |
| Mix | 0 … 1 | 0.5 | How much chorus is mixed with the dry sound. |
| Spread | 0 … 1 | 1 | Phase offset of the right LFO: 0 = mono, 1 = opposite phase, the widest image. |
| Age | 0 … 1 | 0.3 | Clock noise and a harder-working compander: an older, dirtier unit. |
| Tone | 0 … 1 | 0.6 | Bandwidth of the bucket brigade: 0 = about 2 kHz (dull), 1 = 12 kHz. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| R+ | in | cv | Adds to the Rate knob; ±1 sweeps its whole range. |
| D+ | in | cv | Adds to the Depth knob; ±1 sweeps its whole range. |
| M+ | in | cv | Adds to the Mix knob; ±1 sweeps its whole range. |
| L | in | audio | Audio input, left (or mono). |
| R | in | audio | Audio input, right; leave it empty for mono in, stereo out. |
| L | out | audio | Audio output, left. |
| R | out | audio | Audio output, right. |

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

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): about **3.8 % CPU per instance** (one note, default settings), measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

Patches to play (open them in the editor from their page): [MS-20-ed Hammond w/ Tape Delay & Lesley](https://musicbrain.nl/patches/ms-20-ed-hammond-w-tape-delay-lesley).

In the editor's example set: *🎺 CS-80 brass (aftertouch)*, *🌊 DX7 + BBD chorus*, *🎺 CS-80 brass ×4*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Modelled on the behaviour of BBD chorus units of the CE-1 / Dimension
  family; no circuit simulation and no third-party code.
- Own kernel `mmb_dsp/bbd_chorus.h`, MIT licence.

## Versions

- **0.5.110**: the CV inputs add to their knob instead of replacing it.
- **0.5.71**: first version (effects batch with stereo tape echo, digital
  echo, ring modulator and octaver).
