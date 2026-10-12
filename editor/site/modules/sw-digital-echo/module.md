# Digital echo

## Overview

An early-eighties digital echo: repeats with a bit of grit.

A stereo digital echo after the rack delays of the early eighties. The
repeats are not perfect copies: a narrow bandwidth, coarse converters and the
aliasing of a low internal sample rate give them a grainy, slightly dark
edge. A sine LFO on the read head adds chorus to the echoes.

There are two tracks. Ratio sets the right-hand time as a factor of the left
(0.75 or 1.5 give dotted patterns) and Cross sends each track's echo into the
other; Cross at 1 with Fbk at 0 is ping-pong. Without a cable in R, the right
side gets the same input as the left: mono in, stereo out.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Time | 0.005 … 1 s | 0.3 | The time between repeats. |
| Ratio | 0.5 … 2 ×R | 1 | Right-hand echo time as a factor of the left: 0.75 or 1.5 give dotted patterns. |
| Fbk | 0 … 1.1 | 0.4 | How many repeats: higher = longer. |
| Cross | 0 … 1.1 | 0 | How much of each track's echo goes into the other: with Fbk at 0, ping-pong. |
| Rate | 0.05 … 10 Hz | 0.8 | Speed of the modulation on the echoes, in Hz. |
| Depth | 0 … 1 | 0.2 | Depth of the modulation: chorus on the repeats. |
| Bits | 6 … 16 | 12 | Converter resolution: 12 is the classic sound, 8 crackles. |
| Band | 1000 … 16000 Hz | 8000 | Bandwidth of the repeats; lower is darker and grittier. |
| Mix | 0 … 1 | 0.4 | How much echo is mixed with the dry sound. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| T+ | in | cv | Adds to the Time knob; ±1 sweeps its whole range. |
| F+ | in | cv | Adds to the Fbk knob; ±1 sweeps its whole range. |
| D+ | in | cv | Adds to the modulation Depth knob; ±1 sweeps its whole range. |
| M+ | in | cv | Adds to the Mix knob; ±1 sweeps its whole range. |
| L | in | audio | Audio input, left (or mono). |
| R | in | audio | Audio input, right; leave it empty for mono in, stereo out. |
| L | out | audio | Audio output, left. |
| R | out | audio | Audio output, right. |

## How it works

The character is in the write head. The input plus feedback passes a
low-pass filter at Band, is then held at an internal sample rate of twice
Band (the zero-order hold whose aliasing is the grit of those units), and is
companded µ-law style (µ = 255) and rounded to Bits. Twelve bits is the
classic sound; eight starts to crackle. The converter clips hard, which also
keeps feedback above 1 in check.

The read head is an interpolated tap, moved by up to ±2.5 ms by the
modulation LFO; the right side's LFO runs a quarter cycle behind. A two-pole
reconstruction filter on Band smooths the output. Echo times run from 5 ms to
1 s. The same C++ kernel runs on the Teensy and in the browser.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): about **6.7 % CPU per instance** (one note, default settings), measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *🎹 Axel F-lead (2 saws)*, *🔁 DX7 + Digital echo*, *🎸 Axel F lead*, *🔁 Arp + String echo*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Modelled on the behaviour of early-eighties digital rack delays; no
  circuit simulation and no third-party code.
- Own kernel `mmb_dsp/digital_echo.h`, MIT licence.

## Versions

- **0.5.110**: the CV inputs add to their knob instead of replacing it.
- **0.5.77**: the echo memory moved to PSRAM; a module that drops out of
  the patch frees its buffers and gets fresh ones when it is reused.
- **0.5.71**: first version (effects batch with stereo tape echo, BBD
  chorus, ring modulator and octaver).
