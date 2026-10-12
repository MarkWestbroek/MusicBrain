## Overview

Elements is a complete voice in one module: an **exciter** sets a
**resonator** ringing. The exciter can bow, blow and strike at the same time
(three level knobs, freely mixed), each with its own character: Flow shapes
the breath from a soft breeze to turbulence, Mallet goes from a soft hammer
to a hard stick, and three Timbre knobs set how bright each one is. Contour
shapes the excitation from short and percussive to a slow swell.

The resonator decides what is struck: Geometry moves from a string via plates
and tubes to bells, Brightness and Damping set how it rings and dies away,
Position where it is played, and Space adds stereo width and reverb. Play it
from a keyboard with V/Oct and Gate; velocity on Strength makes every note as
loud and bright as you hit it. PLAY strikes without a gate. Each Ext In takes
your own sound as the breath or the strike.

## How it works

The panel follows the original: exciter on the left, resonator on the right,
and the dotted lines that tie Contour to Bow and Blow, and Flow, Mallet,
Geometry and Brightness to their CV inputs. Below are ten CV inputs, each with
an attenuverter: the value is the knob plus attenuverter × CV, limited as on
the original (`BIND` in Émilie Gillet's `cv_scaler.cc`). FM is the
attenuverter of the FM input: in the middle it does nothing, fully open one
unit of CV moves the pitch by an octave.

Inside is the original modal synthesis code: a bank of resonant filters (or a
string model) driven by the exciter, then a reverb. It runs at 32 kHz and is
resampled to the Brain's 44.1 kHz. The browser simulator runs the same C++
code compiled to WebAssembly.

## Sources & licences

- Based on Mutable Instruments Elements by Émilie Gillet, open source under
  the MIT licence (vendored in `firmware/lib/mi-elements`). This is a
  software port, not the Mutable Instruments hardware.
- The CV and attenuverter handling follows the original `cv_scaler.cc`
  (shared table in `mmb_dsp/elements_cv.h`). The MusicBrain wrapper is MIT
  licensed as well.

## Versions

- **0.5.111**: panel laid out like the original (34 HP), ten CV inputs with
  attenuverters, FM input, both Ext In inputs and the PLAY button on the
  panel; FM became the attenuverter of the FM input.
- **First version** (June 2026): a five-voice standalone Teensy build first,
  then Elements as a module in the Brain, with continuous Bow/Blow/Strike
  levels.
