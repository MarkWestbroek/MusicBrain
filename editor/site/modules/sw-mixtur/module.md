# Trautonium (Mixtur)

## Overview

Trautonium (Mixtur): undertones instead of overtones, through fixed formants.

A voice modelled on Oskar Sala's Mixtur-Trautonium, the instrument known
from the soundtrack of *The Birds*. Three things make its sound: a glow-lamp
oscillator, undertones instead of overtones, and fixed formant filters that
do not move with the pitch.

Set four dividers (Div, 1 to 24) and mix the main tone with the four
undertones: Div 2-3-4-5 gives the fundamental with an octave, a fifth and a
third below it, a chord that slides with the pitch. Sub+ scales the four
undertones together, like Sala's pedal. Dyn picks the dynamics: Vel takes
the key velocity, Press follows continuous pressure (MIDI aftertouch, or a
ribbon with pressure sensing), like pressing on the wire of the
instrument. Glide makes the pitch slide for keyboard players. The original
had two manuals: use two modules, or a PolyGroup ×2.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Coarse | -36 … 36 semi | 0 | Transposes the voice in semitones. |
| Fine | -100 … 100 ct | 0 | Fine tuning in cents. |
| Lamp | 0 … 1 | 0.55 | Lamp: how curved the charging slope of the glow-lamp sawtooth is (0 = straight). |
| Unrest | 0 … 1 | 0.25 | Small random variation per period, like a real glow lamp. |
| Glide | 0 … 2000 ms | 0 | Slide time between notes, up to 2 s. |
| Div | 1 … 24 | 2 | Which undertone: the pitch divided by this number (2 = an octave down, 3 = a fifth below that …). |
| Div | 1 … 24 | 3 | Divider for undertone 2: the pitch divided by this number. |
| Div | 1 … 24 | 4 | Divider for undertone 3: the pitch divided by this number. |
| Div | 1 … 24 | 5 | Divider for undertone 4: the pitch divided by this number. |
| Main | 0 … 1 | 0.8 | Level of the main tone. |
| Sub 1 | 0 … 1 | 0.6 | Level of undertone 1. |
| Sub 2 | 0 … 1 | 0.45 | Level of undertone 2. |
| Sub 3 | 0 … 1 | 0.3 | Level of undertone 3. |
| Sub 4 | 0 … 1 | 0 | Level of undertone 4. |
| Formant | Uit / A / E / I / O / U | A | Formant vowel: off, A, E, I, O or U. |
| Shift | -12 … 12 semi | 0 | Moves the three formants together, in semitones. |
| Reso | 0 … 1 | 0.55 | Sharpness of the formant filters. |
| Form mix | 0 … 1 | 0.7 | Dry against formant-filtered sound. |
| Noise | 0 … 1 | 0.03 | Noise, the air in the lamp; follows the dynamics. |
| Dyn | Vel / Press | Vel | Dynamics from key velocity (Vel) or from continuous pressure (Press). |
| Att | 0.5 … 2000 ms | 8 | Attack time. |
| Rel | 1 … 5000 ms | 120 | Release time. |
| Level | 0 … 1 | 0.8 | Output volume. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| V/Oct | in | cv | Pitch, 1 V per octave. |
| Gate | in | gate | Note on while high. |
| Vel | in | cv | Velocity 0 to 1, used when Dyn is Vel. |
| Press | in | cv | Continuous pressure 0 to 1 (aftertouch), used when Dyn is Press. |
| Sub+ | in | cv | Scales the four undertones together, like the pedal. |
| Form+ | in | cv | Glides along the row of vowels. |
| Amp | out | cv | The dynamics as CV, 0 to 1. |
| Out | out | audio | Mono audio output. |

## How it works

The oscillator is a relaxation oscillator: a capacitor charges through a
resistor and discharges at once through a neon lamp when it reaches the
striking voltage. The result is a sawtooth with a curved rise and a hard
drop; Lamp sets how curved, Unrest adds the small period-to-period jitter
of a real lamp. The drop is smoothed with polyBLEP to keep aliasing down.

Four frequency dividers count the periods of the main tone and give f/n,
exactly in phase with it and with the same waveform, as the dividers in the
instrument did. The mix then passes three parallel band-pass filters (TPT)
set to the vowels A, E, I, O or U (formant frequencies of a male voice).
Because they stay put while the pitch moves, the tone sounds like a voice
or a wind instrument and changes colour across the range. Shift moves the
three together, Reso makes them sharper, Form mix blends dry and filtered,
and Form+ glides along the row of vowels. Amp sends the dynamics out as CV.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): about **5.2 % CPU per instance** (one note, default settings), measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *🎚 Mixtur (Trautonium)*, *🎚 Mixtur + Plate reverb*, *🎚 Mixtur + Plate*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Own implementation (MIT licence), modelled by ear on descriptions of the
  Mixtur-Trautonium; not a circuit simulation.

## Versions

- **0.5.95**: first version: glow-lamp oscillator, four undertone dividers,
  fixed formants, Vel or Press dynamics and glide.
