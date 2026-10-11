## Overview

A twelve-key electric piano built as a physical model, in the style of the
tine pianos (Type Tine, Rhodes family) and the reed pianos (Type Reed,
Wurlitzer family). There are no samples: every note is calculated, so the
sound changes with how hard you play, not just its volume.

Play it from MIDI-IN with velocity patched (without a cable on Vel every
note gets a medium touch). Damper sets how quickly a released key is
silenced, and the Sust gate is the sustain pedal. Tremolo sways the sound
between left and right. For twelve keys at once use **Poly ▾ → E-piano ×12**;
an ensemble, phaser or tremolo after it suits the instrument.

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
