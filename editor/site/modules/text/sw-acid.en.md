## Overview

A complete bass voice in the style of the Roland TB-303: one oscillator (saw
or square), a four-pole low-pass filter that squeals but never quite
oscillates on its own, and a filter envelope with only a decay. Play it from
a sequencer (V/Oct and Gate) and turn Cutoff, Reso and Env mod while it
runs: that is the instrument.

The character comes from two gate inputs that are read at the start of each
note. **Acc** (accent) makes the note louder, its filter envelope shorter and
wider, and successive accents build up so the filter climbs higher note by
note. **Slide** makes the pitch glide to the next note in about 60 ms
without a new attack; keep Slide high across the note boundary. Drive Acc
and Slide from a second sequencer row, Euclid, Turing or Branches and the
line varies itself. Tune is in semitones; a bass line usually wants −12 or
−24.

## How it works

The oscillator uses polyBLEP to keep the saw and square free of aliasing.
The filter is a four-pole ladder with a saturating (tanh) feedback loop and
a high-pass in that loop, so the resonance thins out in the bass and the
filter stops just short of self-oscillation. It runs at twice the sample
rate.

Cutoff sweeps from 60 Hz to about 5 kHz; the envelope, the accent and the
Cut+ input (±1 = ±4 octaves) add to that. An accented note gets a fixed
0.2 s filter decay. A second, slower circuit adds up successive accents and
charges more slowly as Reso goes up, which gives the rising "wow" of an
accent run. Env outputs the filter envelope as a CV.

This is our own model after the topology of the original, tuned by ear, not
a component-by-component simulation.

## Sources & licences

- Modelled on the Roland TB-303 Bass Line.
- Own kernel `mmb_dsp/acid.h`, shared by the Brain and the browser, MIT
  licence.

## Versions

- **0.5.95**: first version.
