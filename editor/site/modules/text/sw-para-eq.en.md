## Overview

A four-band parametric EQ with a nod to the British mixing-desk EQ of the
SSL E/G consoles: tight, clean, the workhorse. LF and HF can each be a bell or
a shelf; the two mid bands have their own Q. A high-pass and a low-pass filter
sit around it, and every band does ±15 dB.

Use it to make room in a mix or to shape a single voice. Prop.Q switches to
the American way of working (API 550 style): the Q follows the gain, so a
small boost is broad and a large one is focused. There is no saturation;
Output evens out the level so an A/B with Bypass is fair. The module is
stereo, with the same curve on both channels.

## How it works

Each band is a biquad filter from the shared MusicBrain EQ building blocks
(RBJ cookbook formulas), so "a 6 dB shelf" means the same in every EQ module.
The ranges: LF 30–450 Hz, LMF 200 Hz–2 kHz, HMF 600 Hz–7 kHz, HF 1.5–16 kHz,
Q 0.4–4. The HPF has a 12 dB per octave slope and is off at the far left;
the LPF is off at the far right (20 kHz).

With Prop.Q on, a bell at 0 dB uses 0.4 times the set Q, rising to the full
Q at ±15 dB. All knobs glide over about 5 ms, so turning them does not zip,
and the filters are only recalculated while something moves.

## Sources & licences

- In the spirit of the SSL E/G channel EQ, with the proportional Q of the
  API 550 as a switchable mode; no circuit simulation.
- Filter coefficients after the RBJ Audio EQ Cookbook (`mmb_dsp/biquad.h`).
- Own kernel `mmb_dsp/param_eq.h`, MIT licence.

## Versions

- **0.5.65**: first version. Measured on the Teensy with a sawtooth: LF
  shelf +10 dB at 100 Hz gives +8.4 dB at 65 Hz; HMF +12 dB at 2.5 kHz gives
  +11.9 dB. About 4 % CPU in mono.
