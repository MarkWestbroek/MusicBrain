## Overview

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

## Sources & licences

- Own implementation (MIT licence), modelled by ear on descriptions of the
  Mixtur-Trautonium; not a circuit simulation.

## Versions

- **0.5.95**: first version: glow-lamp oscillator, four undertone dividers,
  fixed formants, Vel or Press dynamics and glide.
