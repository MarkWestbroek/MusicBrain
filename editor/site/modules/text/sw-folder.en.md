## Overview

A wavefolder: the West Coast way of making overtones. A filter takes
overtones away from a rich wave; a folder starts from a sine or triangle and
folds the peaks back as soon as they cross a limit. The further Fold is
open, the more often the wave folds and the brighter it gets, in a pattern
that resembles FM but stays strictly harmonic.

Feed it a full-level sine or triangle; a sawtooth or a chord quickly turns to
noise. Put an envelope or LFO on Fold+ and the sound opens the way a filter
would, only the other way round. A low-pass gate (LPG) after it completes the
classic West Coast voice.

## How it works

Fold sets the gain into the folding curve: at 0 the wave just does not fold,
at 1 it goes more than ten times over the limit. Three curves are available:
Sine sends the wave through a sine (soft and round, the Serge side), Tri
folds back sharply between −1 and 1 (bright, edgy), and 259 is five parallel
folding cells with a dead zone, after the timbre circuit of the Buchla 259
(hollow and nasal).

Sym shifts the wave sideways before folding, which adds even overtones; the
resulting DC offset is filtered out. The folding runs at four times the
sample rate, and the dry signal for Mix is delayed by the same amount so the
two stay in phase. The same C++ kernel runs on the Teensy and in the browser.

## Sources & licences

- The 259 curve uses the piecewise-linear model of the Buchla 259 timbre
  circuit by F. Esqueda, H. Pöntynen, J. D. Parker and S. Bilbao,
  "Virtual Analog Buchla 259 Wavefolder", Proc. DAFx-17, Edinburgh, 2017;
  our own implementation.
- Own kernels `mmb_dsp/wavefolder.h` and `mmb_dsp/oversample.h`, MIT
  licence.

## Versions

- **0.5.107**: lighter on the Teensy (the shared 4× oversampling filter is
  3.8 times faster, same sound).
- **0.5.95**: first numbered firmware with the module (built 2 October 2026).
