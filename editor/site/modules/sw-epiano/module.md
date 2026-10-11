# Electric piano

## Overview

An electric piano modelled from tine (Rhodes) or reed (Wurlitzer) and pickup, no samples. Soft and hard playing really sound different.

A twelve-key electric piano built as a physical model, in the style of the
tine pianos (Type Tine, Rhodes family) and the reed pianos (Type Reed,
Wurlitzer family). There are no samples: every note is calculated, so the
sound changes with how hard you play, not just its volume.

Play it from MIDI-IN with velocity patched (without a cable on Vel every
note gets a medium touch). Damper sets how quickly a released key is
silenced, and the Sust gate is the sustain pedal. Tremolo sways the sound
between left and right. For twelve keys at once use **Poly ▾ → E-piano ×12**;
an ensemble, phaser or tremolo after it suits the instrument.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Type | Tine / Reed | Tine | Tine = the Rhodes side, round and glassy; Reed = the Wurlitzer side, hollower and more nasal. |
| Timbre | 0 … 1 | 0.35 | Where the tine sits in front of the pickup: low = thin and glassy (lots of octave), higher = full and round. |
| Bell | 0 … 1 | 0.5 | The ping in the attack: a high overtone that dies away quickly. |
| Decay | 0 … 1 | 0.5 | How long a note rings on (higher notes shorter, as on the real thing). |
| Drive | 0 … 1 | 0.4 | How close the tine is to the pickup: more = barking when you play hard. |
| Level | 0 … 1 | 0.8 | Output volume. |
| Tremolo | 0 … 1 | 0.3 | How strongly the sound sways between left and right. |
| Rate | 0.5 … 12 Hz | 4.5 | How fast the tremolo sways. |
| Damper | 0 … 1 | 0.6 | How fast the felt damper silences a released key: 0 = no dampers, 1 = in about 15 ms. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| Sust | in | gate | Sustain pedal (gate): while high, released keys ring on. |
| L | out | audio | Left output, with the tremolo. |
| R | out | audio | Right output, with the tremolo. |
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
| 1 | in | cv | Velocity of key 1, 0 to 1; without a cable a medium touch. |
| 2 | in | cv | Velocity of key 2, 0 to 1; without a cable a medium touch. |
| 3 | in | cv | Velocity of key 3, 0 to 1; without a cable a medium touch. |
| 4 | in | cv | Velocity of key 4, 0 to 1; without a cable a medium touch. |
| 5 | in | cv | Velocity of key 5, 0 to 1; without a cable a medium touch. |
| 6 | in | cv | Velocity of key 6, 0 to 1; without a cable a medium touch. |
| 7 | in | cv | Velocity of key 7, 0 to 1; without a cable a medium touch. |
| 8 | in | cv | Velocity of key 8, 0 to 1; without a cable a medium touch. |
| 9 | in | cv | Velocity of key 9, 0 to 1; without a cable a medium touch. |
| 10 | in | cv | Velocity of key 10, 0 to 1; without a cable a medium touch. |
| 11 | in | cv | Velocity of key 11, 0 to 1; without a cable a medium touch. |
| 12 | in | cv | Velocity of key 12, 0 to 1; without a cable a medium touch. |

## How it works

Half of an electric piano's sound is what vibrates; the other half is how
the pickup sees it, and the model builds the two separately. Each key has a
fundamental that dies away slowly and a high, inharmonic overtone (the
second mode of a clamped bar, 6.27 times the fundamental) that dies away
quickly: the bell in the attack. Harder playing means a larger swing and,
relatively, more bell. The bell is faded out where it would go above
15 kHz, so high notes do not fold back.

With Tine the pickup is a magnet and coil: the output is the speed of the
tine times the slope of the magnetic field where it sits. With the tine
straight in front of the pickup (Timbre 0) it passes the centre twice per
cycle and you mostly hear the octave, thin and glassy; moved to the side,
the fundamental returns, full and round. A large swing drives the field
into its curve, which gives the bark when you play hard (Drive). With Reed
a steel reed moves in front of a capacitor plate; the sensitivity rises
sharply as the reed approaches the plate, so the sound is hollower and more
nasal and the note dies away sooner.

The twelve voices are summed and then pass a limiter that turns the volume
down on full, sustained chords instead of clipping them. The same C++
kernel (`mmb_dsp/epiano.h`) runs on the Teensy and, as WebAssembly, in the
browser.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain).
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *🎹 E-piano ×12 (tine / reed)*, *🎹 E-piano ×12*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Own implementation (MIT licence), modelled on measurements of tine and
  reed electric pianos; not a copy of any particular instrument.
- The output stage uses the shared limiter and anti-aliasing helpers of the
  MusicBrain DSP library (`limiter.h`, `adaa.h`), also MIT.

## Versions

- **0.5.105**: a limiter that rides the volume replaces the per-sample
  clipper; no more distortion with sustain and full chords.
- **0.5.104**: Drive now barks instead of turning thin and quiet at the top;
  the volume stays the same across the knob (within about 1 dB).
- **0.5.102**: cleaner chords: a limiter that is clean up to 0.7 replaces
  one tanh over the sum of all voices (intermodulation of two notes from
  −27 dB to −49 dB).
- October 2026: quieter bell that grows with velocity, Damper control and
  the Sust (sustain pedal) input.
- **First version** (October 2026): tine or reed in front of a pickup,
  twelve keys, stereo tremolo.
