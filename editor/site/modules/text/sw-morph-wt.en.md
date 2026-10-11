## Overview

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
