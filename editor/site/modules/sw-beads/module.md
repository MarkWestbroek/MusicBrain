# Beads texture synthesizer

## Overview

Beads (Mutable): cuts what comes in into grains, or turns into a delay or a sound source.

Beads is the successor to Clouds: it records what comes in and plays it back
as grains. Time picks where in the recording the grains start, Size how long
they last, Shape their envelope (from a click via soft to reversed) and Pitch
their transposition, with resting points at the fifth and octave. Under each
of the four sits an attenuverter: with a cable it scales the CV, without one
it adds randomness. Density in the middle sets how many grains: random ones
to the right, regular ones to the left, none at noon.

Turn Size fully clockwise and Beads becomes a delay and looper: Time sets the
delay time, Density the rhythm of the repeats. Patch nothing into the inputs
and it turns into a sound source, playing grains from built-in wavetables.
Quality picks the medium: dirty tape (24 kHz, µ-law), clean tape, vintage
digital (12 bit, 32 kHz) or digital.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Time | 0 … 1 | 0.5 | Where grains start in the recording (further back to the right); in delay mode the delay time. |
| Size | 0 … 1 | 0.5 | How long a grain lasts; fully open it becomes a delay. |
| Shape | 0 … 1 | 0.5 | The shape of a grain: from a click via soft to reversed. |
| Pitch | 0 … 1 | 0.5 | Pitch of the grains, with resting points at the fifth and octave. |
| Time CV/random | -1 … 1 | 0 | Attenuverter for Time: with a cable it scales the CV, without one it adds randomness. |
| Size CV/random | -1 … 1 | 0 | Attenuverter for Size: CV depth with a cable, randomness without. |
| Shape CV/random | -1 … 1 | 0 | Attenuverter for Shape: CV depth with a cable, randomness without. |
| Pitch CV/random | -1 … 1 | 0 | Attenuverter for Pitch: CV depth with a cable, randomness without. |
| Seed |  |  | Plays one grain (with Lock off). |
| Lock | off / on | on | On: grains come by themselves (default). Off: one grain per press or trigger. |
| Density | 0 … 1 | 0.5 | How many grains: random to the right, regular to the left, none in the middle. |
| Freeze | off / on | off | Holds the recording: the grains play what is in it now. |
| Feedbk | 0 … 1 | 0 | How much of the output goes back into the buffer. |
| Dry/Wet | 0 … 1 | 0.5 | Dry or wet. |
| Reverb | 0 … 1 | 0 | The built-in reverb. |
| Quality | Tape+ / Tape / Vintage / Digital | Digital | The medium: dirty tape, clean tape, vintage digital or digital. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| Frz | in | gate | Gate: holds the recording while high. |
| Seed | in | trigger | Trigger: one grain, or a clock when Lock is on. |
| Time | in | cv | CV for Time, scaled by its attenuverter. |
| Size | in | cv | CV for Size, scaled by its attenuverter. |
| Shape | in | cv | CV for Shape, scaled by its attenuverter. |
| V/Oct | in | cv | Pitch, 1 V per octave, scaled by its attenuverter. |
| Dens | in | cv | CV for Density, added to the knob. |
| In L | in | audio | Audio in (left, or mono). |
| In R | in | audio | Audio in, right. |
| Out L | out | audio | Left output. |
| Out R | out | audio | Right output. |

## How it works

The DSP is Émilie Gillet's original code, released on 11 October 2026 and
running here a day later: a granular player with up to 32 grains reading from
a 768 KB recording buffer, a multitap delay controller, a wavetable synth for
when nothing is patched, wow and flutter, and a reverb. Each medium runs at
its own sample rate; the module converts between that and the Brain's
44.1 kHz.

The knobs and CV inputs are read the way the hardware reads them
(`beads.cc`, `cv_reader.h`): the attenuverter law, the detune law of the Pitch
knob, and the CV ranges. SEED with Lock on (the default, as after power-up on
the original) makes grains by itself; with Lock off a grain comes per press
or per trigger, and with Lock on and a trigger patched the input becomes a
clock that Density divides. The assignable CV input of the original is not
there yet.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain).
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *🔮 Plaits + BEADS*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Based on Mutable Instruments Beads by Émilie Gillet, with Frédéric Meslin
  and Oliver Rockstedt, open source under the MIT licence since 11 October
  2026 (pichenettes/eurorack, commit d8f4739; vendored in
  `firmware/lib/mi-beads`). This is a software port, not the Mutable
  Instruments hardware.
- The MusicBrain wrapper (`beads_host.h`) is MIT licensed as well and is
  shared by the Brain and the browser simulator.

## Versions

- **0.5.112** (12 October 2026, a day after the source release): first
  version, with granular, delay and wavetable modes and all four media.
  Runs in the browser; the Brain firmware is built but not yet measured on
  the hardware.
