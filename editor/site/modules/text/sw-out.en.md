## Overview

Every patch ends here. OUT has a left and a right input and one Level knob
that sets the final volume of both channels together. Patch a stereo pair
into L and R; a mono source on only one input plays on that side only, so
use a mixer or patch the same signal into both inputs if you want it in the
middle.

On the Brain the signal goes out over USB audio to the computer. In the
browser it goes to your speakers.

## How it works

There is one audio output in the system, and every OUT module in a patch
feeds the same left/right gain pair in front of it. Level is that gain
(0 … 1). After the gain a peak meter measures the loudest sample on either
channel; the editor reads it from the Brain to show the output level.

## Sources & licences

- The gain stages, the peak meter and the USB output are the
  `AudioAmplifier`, `AudioAnalyzePeak` and `AudioOutputUSB` objects of the
  Teensy Audio Library by PJRC (MIT licence).
- The MusicBrain module code is MIT licensed.

## Versions

- **0.5.33**: Level really sets the output volume (a shared master gain) and
  the output peak is reported to the editor.
- **First version** (May 2026): left and right inputs straight to the USB
  audio output.
