# Complex oscillator

## Overview

A complex oscillator (Buchla 259): overtones from FM and folding instead of a filter.

Two oscillators in one module, modelled on the Buchla 259. A modulation
oscillator (sine, triangle or saw, at Ratio times the main pitch) works on
the main oscillator in three ways at once, each with its own amount: FM
bends the pitch, AM changes how hard the sine drives the folder, and T mod
moves the folder itself. Whole-number ratios stay harmonic; in between the
sound turns bell-like.

The main oscillator is a sine that goes through a wavefolder: Timbre at 0
is a pure sine, turning it up folds the wave and adds overtones; Sym adds
even overtones. This is the West Coast way of making a bright sound without
a filter. Put an envelope on Tim+ for a brighter attack and another on FM+,
and follow it with a low-pass gate (Solo ▾ → Buchla voice does exactly
that). The Mod output gives the modulation oscillator on its own.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Ratio | 0.01 … 16 | 2 | Frequency of the modulation oscillator, as a multiple of the pitch (0.01–16). |
| Mod | Sin / Tri / Saw | Sin | Waveform of the modulation oscillator: sine, triangle or saw. |
| Pitch | -48 … 48 semi | 0 | Tuning in semitones. |
| Level | 0 … 1 | 0.8 | Output level. |
| FM | 0 … 1 | 0 | How much the second oscillator modulates the pitch. |
| AM | 0 … 1 | 0 | How much the modulation oscillator changes the level going into the folder. |
| T mod | 0 … 1 | 0 | How much the modulation oscillator moves the folder. |
| Sym | -1 … 1 | 0 | Adds even overtones. |
| Timbre | 0 … 1 | 0.3 | How far the wave is folded: 0 = pure sine, further = more overtones. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| V/Oct | in | cv | Pitch, 1 V per octave; 0 V is C4. |
| FM+ | in | cv | Added to the FM amount. |
| Tim+ | in | cv | Added to Timbre: an envelope here gives a brighter attack. |
| Mod | out | audio | The modulation oscillator on its own. |
| Out | out | audio | The main oscillator after the folder. |

## How it works

The modulation oscillator runs at Ratio × the main frequency (Ratio 0.01 to
16). FM is linear and through zero: the FM amount, squared, sets an index of
up to six times the fundamental. AM scales the sine before the folder; at full
depth its level swings between full and zero with the modulator. The folder is the five-cell model of the
259 timbre circuit (the same shape as the 259 setting of the Folder module):
its gain is 1 + 12 × Timbre², T mod and Tim+ move Timbre, and Sym adds an
offset before folding. The folding runs at four times the sample rate, and a
12 Hz high-pass removes the DC that Sym leaves behind.

The Teensy and the browser simulator run the same C++ kernel
(`mmb_dsp/complex_osc.h`).

## Runs on

- **Teensy 4.1** (the MusicBrain Brain).
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *🎛️ Buchla-stem (Complex + LPG)*, *🧪 Buchla voice*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- The five folding cells follow the piecewise-linear model of the Buchla 259
  timbre circuit by F. Esqueda, H. Pöntynen, J. D. Parker and S. Bilbao,
  "Virtual Analog Buchla 259 Wavefolder", Proc. DAFx-17, Edinburgh, 2017.
- Our own code (`mmb_dsp/complex_osc.h`, `mmb_dsp/wavefolder.h`), MIT
  licensed. Buchla is the name of its owner; this module is modelled on the
  259, not a copy of it.

## Versions

- **0.5.107**: lighter on the Teensy, thanks to a 3.8 × faster shared
  oversampling filter.
- **First version** (October 2026): FM, AM and timbre modulation, three
  modulator waveforms, four times oversampled.
