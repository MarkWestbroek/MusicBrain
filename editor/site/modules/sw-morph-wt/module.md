# Morph wavetable

## Overview

A wavetable oscillator that glides smoothly between eight waveforms.

A wavetable oscillator with five banks of eight waveforms. Turn Morph (0 to
7) to slide from one waveform to the next without steps, or put an LFO or
envelope on M+ for a moving, changing tone. The banks are Analog (sine to
triangle to saw to pulse), Vocal (shifting formants), Harmonics (built up
like drawbars), Digital (gaps and phase flips) and User.

The User bank holds your own waves. Draw one in the editor's wave drawer,
or import a .wav wavetable: the editor cuts it into eight frames and loads
them into User. W-slot chooses which of the eight frames a drawn wave
replaces. Pitch works as on the other oscillators: V/Oct with 0 V at C4,
Coarse in semitones, Fine in cents.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Morph | 0 … 7 | 0 | Where you are between the eight waveforms. |
| Bank | Ana / Voc / Hrm / Dig / Usr | Ana | The set of waveforms: analogue, vocal, harmonics, digital, user. |
| W-slot | 0 … 7 | 0 | Which frame a drawn wave replaces. |
| Level | 0 … 1 | 0.8 | Output level. |
| Coarse | -36 … 36 semi | 0 | Tuning in semitones. |
| Fine | -100 … 100 ct | 0 | Fine tuning in cents. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| V/Oct | in | cv | Pitch, 1 V per octave; 0 V is C4. |
| M+ | in | cv | Added to Morph: ±1 moves up to ±7 frames. |
| Out | out | audio | The oscillator. |

## How it works

Each frame is 256 samples. The oscillator interpolates within a frame on
every sample and crossfades between the two frames next to the Morph
position. M+ adds up to ±7 frames on top of the knob.

To avoid aliasing, every built-in bank exists in three band-limited
versions: up to 24, up to 8 and up to 2 harmonics. For each block the
oscillator picks the richest version whose highest harmonic stays below
half the sample rate, so up to about A5 you hear the full spectrum and above
that it gets cleaner step by step. The tables take about 61 KB. User frames
are copied to all three levels as they are, so very high notes on a drawn
wave can still alias.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain).
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *🌌 Krell (zelfspelend)*, *🌌 Krell*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Our own code (`MorphWtModule.h`), MIT licensed. The browser simulator runs
  a WebAssembly copy of the same oscillator.

## Versions

- **September 2026** (editor): User frames also play in the simulator, and
  a .wav wavetable can be imported into the User bank.
- **Simulator** (September 2026): the browser runs the module as
  WebAssembly.
- **0.5.40**: three band-limited levels per bank against aliasing.
- **0.5.39**: first version (July 2026).
