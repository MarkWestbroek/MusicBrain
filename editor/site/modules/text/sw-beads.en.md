## Overview

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

## Sources & licences

- Based on Mutable Instruments Beads by Émilie Gillet, with Frédéric Meslin
  and Oliver Rockstedt, open source under the MIT licence since 11 October
  2026 (pichenettes/eurorack, commit d8f4739; vendored in
  `firmware/lib/mi-beads`). This is a software port, not the Mutable
  Instruments hardware.
- The MusicBrain wrapper (`beads_host.h`) is MIT licensed as well and is
  shared by the Brain and the browser simulator.

## Versions

- **0.5.112** (12–13 October 2026, a day after the source release): first
  version, with granular, delay and wavetable modes and all four media, in
  the browser and on the Brain. Measured on the Teensy: grains 9–17 % CPU
  depending on the medium and density, the wavetable mode 14 %; the delay
  mode is still heavy (about 55 %, 29 % on dirty tape) and is being looked
  into.
