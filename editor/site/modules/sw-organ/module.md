# Tonewheel organ

## Overview

A tonewheel organ with nine drawbars: 91 tonewheels always spin, a key taps nine of them.

A tonewheel organ with nine drawbars, built the way the generator of an
electromechanical organ works rather than as nine sine waves per key. It
plays twelve keys at once and is meant to go into the ROTARY, the rotating
speaker with its valve preamp.

Pull the drawbars (0 to 8, about 3 dB per step) to set the registration.
Some well-known settings: 888000000 (jazz, with percussion on the 3rd),
888888888 (full), 838000000 (gospel bass), 006876540 (flutey). For a volume
pedal, set Level to 0 and patch an expression pedal (a MIDI-IN CC) to Swell.
**Poly ▾ → Organ ×12** sets up MIDI-in, the organ and the ROTARY.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| 16' | 0 … 8 | 8 | Drawbar 16′: an octave below the note (the sub). |
| 5⅓' | 0 … 8 | 8 | Drawbar 5⅓′: a fifth above the 16′. |
| 8' | 0 … 8 | 8 | Drawbar 8′: the fundamental. |
| 4' | 0 … 8 | 0 | Drawbar 4′: an octave up. |
| 2⅔' | 0 … 8 | 0 | Drawbar 2⅔′: an octave and a fifth up. |
| 2' | 0 … 8 | 0 | Drawbar 2′: two octaves up. |
| 1⅗' | 0 … 8 | 0 | Drawbar 1⅗′: two octaves and a third up. |
| 1⅓' | 0 … 8 | 0 | Drawbar 1⅓′: two octaves and a fifth up. |
| 1' | 0 … 8 | 0 | Drawbar 1′: three octaves up, the whistle on top. |
| Perc | Uit / 2e / 3e | Uit | Percussion: a click on the 2nd or 3rd harmonic, only on the first note of a legato run. |
| Fast | off / on | on | Percussion decay: fast (about 0.22 s) or slow (about 0.7 s). |
| Soft | off / on | off | Softer percussion; off (normal) pulls the drawbars back about 3 dB, as on the original. |
| Vib/Cho | Uit / V1 / V2 / V3 / C1 / C2 / C3 | Uit | Scanner vibrato (V1–V3) or chorus (C1–C3, mixed with the dry sound). |
| Click | 0 … 1 | 0.4 | The key click: the tick of a key closing in the middle of the wave. |
| Leak | 0 … 1 | 0.3 | How much neighbouring tonewheels bleed into each other. |
| Level | 0 … 1 | 0.8 | Output volume; Swell adds to it. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| voct_1 | in | cv | Pitch of key 1, 1 V per octave (from MIDI-IN). |
| voct_2 | in | cv | Pitch of key 2, 1 V per octave (from MIDI-IN). |
| voct_3 | in | cv | Pitch of key 3, 1 V per octave (from MIDI-IN). |
| voct_4 | in | cv | Pitch of key 4, 1 V per octave (from MIDI-IN). |
| voct_5 | in | cv | Pitch of key 5, 1 V per octave (from MIDI-IN). |
| voct_6 | in | cv | Pitch of key 6, 1 V per octave (from MIDI-IN). |
| voct_7 | in | cv | Pitch of key 7, 1 V per octave (from MIDI-IN). |
| voct_8 | in | cv | Pitch of key 8, 1 V per octave (from MIDI-IN). |
| voct_9 | in | cv | Pitch of key 9, 1 V per octave (from MIDI-IN). |
| voct_10 | in | cv | Pitch of key 10, 1 V per octave (from MIDI-IN). |
| voct_11 | in | cv | Pitch of key 11, 1 V per octave (from MIDI-IN). |
| voct_12 | in | cv | Pitch of key 12, 1 V per octave (from MIDI-IN). |
| gate_1 | in | gate | Gate of key 1: high while the key is held. |
| gate_2 | in | gate | Gate of key 2: high while the key is held. |
| gate_3 | in | gate | Gate of key 3: high while the key is held. |
| gate_4 | in | gate | Gate of key 4: high while the key is held. |
| gate_5 | in | gate | Gate of key 5: high while the key is held. |
| gate_6 | in | gate | Gate of key 6: high while the key is held. |
| gate_7 | in | gate | Gate of key 7: high while the key is held. |
| gate_8 | in | gate | Gate of key 8: high while the key is held. |
| gate_9 | in | gate | Gate of key 9: high while the key is held. |
| gate_10 | in | gate | Gate of key 10: high while the key is held. |
| gate_11 | in | gate | Gate of key 11: high while the key is held. |
| gate_12 | in | gate | Gate of key 12: high while the key is held. |
| Swell | in | cv | Expression pedal: adds to Level (set Level to 0 for a full swell pedal). |
| Out | out | audio | Mono organ output; send it into the ROTARY. |

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

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): about **4.4 % CPU per instance** (one note, default settings), measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *🎹 Organ ×12 (tonewheel + Rotary)*, *🪗 Organ ×12*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Own implementation (MIT licence), modelled on the tonewheel generator of
  electromechanical drawbar organs in the style of the Hammond.

## Versions

- **First version** (October 2026): nine drawbars, twelve keys, foldback,
  key click, percussion, leakage and scanner vibrato/chorus.
