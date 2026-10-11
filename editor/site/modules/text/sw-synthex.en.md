## Overview

A polyphonic voice after the Elka Synthex (1981, designed by Mario Maggi),
with eight voices in one module. Each voice has two oscillators, noise, a
four-pole multimode filter and two envelopes; one LFO, glide and a stereo
chorus are shared. Joy X bends the pitch (V/Oct) and Joy Y moves the filter,
like the joystick on the original.

Play it from MIDI-IN; **Poly ▾ → Synthex ×8** sets it up. The knobs follow
the original's 0 to 10 scale. The envelope times run from 2 ms to 10 s
along that scale.

## How it works

On the instrument the oscillators are digital (counters on a 4 MHz clock),
which is why it stays in tune. Each offers Ramp (sawtooth), Square or Pulse
(with PW) at 16′ to 2′. Oscillator 2 adds Transpose and Detune; Sync locks
it to oscillator 1, and Ring replaces it with the product of both. The mixer
counts in 16 steps, like the 4-bit volume switches (binary-weighted
resistors) of the original.

The filter on the original is four OTA stages in series with feedback for
resonance; switches choose the tap, so the same filter is low-pass,
band-pass or high-pass. Here it is four one-pole stages (TPT) with a soft
limiter in the loop, and the modes mix the stage outputs: LP 24 dB, BP
12 dB, HP 24 dB per octave. Freq spans 20 Hz to 20 kHz over the knob; the
filter envelope, keyboard tracking, LFO and Joy Y add to it. The chorus is
the MusicBrain BBD chorus. The split and double modes and the sequencer of
the original are not included.

## Sources & licences

- Own implementation (MIT licence), built from the topology in the Elka
  Synthex schematic diagrams (dated 1-6-83: sheet 1 block diagram, sheet 4
  voice card 410CST5800) and the oscillator calibration instructions; not a
  component-level simulation.

## Versions

- **First version** (October 2026): eight voices, two oscillators with sync
  and ring, noise, multimode filter, two ADSRs, LFO routing, glide, chorus
  and joystick inputs.
