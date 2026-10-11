## Overview

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
