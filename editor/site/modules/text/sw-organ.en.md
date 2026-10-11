## Overview

A tonewheel organ with nine drawbars, built the way the generator of an
electromechanical organ works rather than as nine sine waves per key. It
plays twelve keys at once and is meant to go into the ROTARY, the rotating
speaker with its valve preamp.

Pull the drawbars (0 to 8, about 3 dB per step) to set the registration.
Some well-known settings: 888000000 (jazz, with percussion on the 3rd),
888888888 (full), 838000000 (gospel bass), 006876540 (flutey). For a volume
pedal, set Level to 0 and patch an expression pedal (a MIDI-IN CC) to Swell.
**Poly ▾ → Organ ×12** sets up MIDI-in, the organ and the ROTARY.

## How it works

Ninety-one tonewheels spin all the time, each at its own pitch, tuned in
equal temperament. A key does not make a tone; it closes nine contacts that
tap nine wheels (the footages 16′, 5⅓′, 8′, 4′, 2⅔′, 2′, 1⅗′, 1⅓′ and 1′),
and the drawbars set how much of each. The character follows from that. Two
keys that tap the same wheel get the same sine in phase, so the organ does
not beat against itself. At the top the wheels run out and the highest
footages fold back an octave. And because the wheels keep turning, a contact
closes at a random point of the wave: the key click.

Percussion adds the 2nd or 3rd harmonic with one envelope for the whole
keyboard (decay about 0.22 s fast or 0.7 s slow). It only fires again once
all keys are up, so legato playing gives a tick only on the first note. In
Normal (not Soft) the drawbars are pulled back by about 3 dB, as on the
original. Leak lets wheels that sit next to each other in the cabinet bleed
into each other. Vibrato and chorus come from a tapped delay line read by a
scanner: V1–V3 vibrato only, C1–C3 mixed with the dry signal. Pitch is
rounded to semitones; an organ does not bend.

## Sources & licences

- Own implementation (MIT licence), modelled on the tonewheel generator of
  electromechanical drawbar organs in the style of the Hammond.

## Versions

- **First version** (October 2026): nine drawbars, twelve keys, foldback,
  key click, percussion, leakage and scanner vibrato/chorus.
