# Clouds granular

## Overview

A granular cloud (Mutable Instruments Clouds).

A port of Mutable Instruments Clouds: a stereo effect that records what
comes in and plays it back as a cloud of small grains. Position chooses
where in the recording the grains come from, Size how long they are, Pitch
transposes them (±24 semitones), Density sets how many there are and
Texture their shape. Freeze (the switch or the Frz jack) stops recording,
so you can play with what is in the buffer; Trig fires a single grain.

Mode switches between four ways of playing the buffer: granular, pitch
shifting and time stretching, a looping delay, and a spectral mode. Mix
blends dry and wet; Spread, Feedbk and Reverb add stereo width, feedback and
the built-in reverb. A mono source on In L works too. The CV inputs take
over their knob while patched (0 to 1; pitch CV in volts per octave).

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Position | 0 … 1 | 0.3 | Where in the buffer the grains come from. |
| Size | 0 … 1 | 0.5 | How big the grains are. |
| Pitch | -24 … 24 semi | 0 | Transposes the grains in semitones (±24). |
| Density | 0 … 1 | 0.6 | How many grains: middle = none, lower = regular, higher = random. |
| Texture | 0 … 1 | 0.5 | Shape of the grains; the top quarter adds diffusion. |
| Mix | 0 … 1 | 0.5 | Dry to wet. |
| Spread | 0 … 1 | 0.3 | Stereo width of the grains. |
| Feedbk | 0 … 1 | 0.3 | How much of the output goes back into the buffer. |
| Reverb | 0 … 1 | 0.3 | Amount of the built-in reverb. |
| Level | 0 … 1 | 1 | Output level. |
| Mode | Gran / Strch / Loop / Spect | Gran | Granular, stretch, looping delay or spectral. |
| Freeze | off / on | off | Stops recording, so the grains keep playing the frozen buffer. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| In L | in | audio | Audio in, left (or mono). |
| In R | in | audio | Audio in, right. |
| Frz | in | gate | High = freeze the buffer. |
| Trig | in | gate | Each rising edge fires a single grain. |
| S+ | in | cv | Sets Size (0 to 1) while patched. |
| Out L | out | audio | Audio out, left. |
| Out R | out | audio | Audio out, right. |
| P+ | in | cv | Sets Position (0 to 1) while patched. |
| D+ | in | cv | Sets Density (0 to 1) while patched. |
| T+ | in | cv | Sets Texture (0 to 1) while patched. |

## How it works

The module runs Émilie Gillet's Clouds granular processor as it is. In
granular mode, Density below the middle starts grains at a regular rate,
above the middle at random moments, and right in the middle no new grains
start. Texture up to three quarters shapes the grain envelope; above that it
adds diffusion. The stretch mode uses WSOLA (overlap-add with
correlation), and the spectral mode a phase vocoder.

Clouds works at 32 kHz. The wrapper resamples the input from 44.1 kHz to
32 kHz and the output back, linearly. Its buffers (118,784 and 65,408
bytes) live on the heap. Switching mode reorganises the buffer, so a short
glitch at that moment is normal. The browser simulator compiles the same
code to WebAssembly.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain).
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *☁️ Clouds ambient (+Tides)*, *🎲 Generative jam (Marbles)*, *🌌 Krell (zelfspelend)*, *🌌 Krell*, *🎲 Generative jam*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Based on Mutable Instruments Clouds by Émilie Gillet, open source under
  the MIT licence (vendored in `firmware/lib/mi-clouds`).
- The MusicBrain wrapper is MIT licensed as well. This is a software port,
  not the Mutable Instruments hardware.

## Versions

- **Simulator** (September 2026): the browser runs the same Clouds code as
  WebAssembly.
- **0.5.31**: first version (July 2026), stereo in and out, four modes.
