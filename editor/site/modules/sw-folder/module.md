# Wavefolder

## Overview

Wavefolder: folds the wave back for overtones (West Coast).

A wavefolder: the West Coast way of making overtones. A filter takes
overtones away from a rich wave; a folder starts from a sine or triangle and
folds the peaks back as soon as they cross a limit. The further Fold is
open, the more often the wave folds and the brighter it gets, in a pattern
that resembles FM but stays strictly harmonic.

Feed it a full-level sine or triangle; a sawtooth or a chord quickly turns to
noise. Put an envelope or LFO on Fold+ and the sound opens the way a filter
would, only the other way round. A low-pass gate (LPG) after it completes the
classic West Coast voice.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Fold | 0 … 1 | 0.3 | How often the wave folds: more = brighter. |
| Sym | -1 … 1 | 0 | Shifts the wave sideways: adds even overtones. |
| Type | Sine / Tri / 259 | Sine | Folding curve: Sine = soft and round, Tri = bright and sharp, 259 = Buchla-style, hollow and nasal. |
| Mix | 0 … 1 | 1 | Dry against folded signal. |
| Level | 0 … 1 | 0.8 | Output level. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| Fold+ | in | cv | Added to the Fold knob: an envelope here opens the sound like a filter. |
| Sym+ | in | cv | Added to the Sym knob. |
| In | in | audio | Audio input; works best with a full-level sine or triangle. |
| Out | out | audio | The folded audio. |

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

## Runs on

- **Teensy 4.1** (the MusicBrain Brain).
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *〽️ Fluit + FOLDER (West Coast)*, *🌊 West Coast (Turing + Folder + LPG)*, *🌊 West Coast*.

Editor: <https://editor.musicbrain.nl>

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
