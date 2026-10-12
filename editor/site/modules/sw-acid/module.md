# Acid bass

## Overview

A 303-style bass voice: turn Cutoff, Reso and Env mod while it plays.

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

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Tune | -24 … 24 semi | 0 | Pitch offset in semitones; a bass line usually wants −12 or −24. |
| Cutoff | 0 … 1 | 0.35 | Filter: the brightness. |
| Reso | 0 … 1 | 0.7 | Filter: the squelch. |
| Env mod | 0 … 1 | 0.6 | How much the filter opens on each note. |
| Decay | 0.1 … 3 s | 0.4 | How quickly the filter closes again. |
| Wave | Saw / Sqr | Saw | Saw or square. |
| Accent | 0 … 1 | 0.6 | How much accented notes jump out. |
| Level | 0 … 1 | 0.8 | Output level. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| V/Oct | in | cv | Pitch, 1 V per octave around middle C. |
| Gate | in | gate | Note on and off. |
| Acc | in | gate | High at the start of a note: the note is accented. |
| Slide | in | gate | High: glide to the next note without a new attack. |
| Cut+ | in | cv | Cutoff modulation: ±1 is ±4 octaves. |
| Env | out | cv | The filter envelope as CV, 0 … 1. |
| Out | out | audio | The bass voice. |

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

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): about **7.1 % CPU per instance** (one note, default settings), measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

Patches to play (open them in the editor from their page): [Acid jam](https://musicbrain.nl/patches/acid-jam).

In the editor's example set: *🧪 Acid (303-stijl bas)*, *🧪 Acid jam (Clock + Euclid + Chaos)*, *🧬 Acid jam*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Modelled on the Roland TB-303 Bass Line.
- Own kernel `mmb_dsp/acid.h`, shared by the Brain and the browser, MIT
  licence.

## Versions

- **0.5.95**: first version.
