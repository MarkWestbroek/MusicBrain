## Overview

The mechanics of a Mellotron around an ordinary sample bank. The clean
recording comes from the bank (the same .mmbs bank and Bank knob as the
Sampler); the imperfection comes from this module. Each key has its own strip
of tape, up to eight seconds long: after Length the sound stops abruptly, no
matter how long you hold the key.

Let go and the strip rewinds on its spring. Press the key again while it is
still rewinding and it plays from wherever the tape is, so quick repeats
sound different from the first note. The module has eight voice cells; play
it polyphonically with Poly ▾ → Tape strip ×8. The standard set has a
Mellotron flute and strings built on it.

## How it works

The kernel keeps a tape position per key. A held key moves forward at the
current tape speed; a released key rewinds, a full strip taking Return
seconds. A looped sample keeps sounding until the tape runs out. When you
press, the pad pushes the tape against the head (Contact): the note rises in
8 to 58 ms, starts dull (from 700 Hz up to full bandwidth) and dips up to
60 cents in pitch.

The capstan motor slows under load: the more keys held, the slower, up to
−40 cents, with about 150 ms of inertia; channel pressure on Press slows it
by up to 40 cents more. Wow is a 0.55 Hz sine plus a random drift (up to 25
cents), flutter two faster sines at 6.3 and 11.1 Hz (up to 6 cents). Wear adds
tape hiss while a tape runs, lowers the bandwidth from 12 kHz to 3 kHz and
adds soft saturation.

## Sources & licences

- Modelled on the tape mechanism of the Mellotron; no third-party code.
- Own kernel `mmb_dsp/tape_strip.h` on the shared sampler kernel, MIT
  licence.
- The flute, recorder, strings and choir banks come from GeneralUser GS 2.0.3
  by S. Christian Collins, whose licence allows derived banks with credit.

## Versions

- **0.5.95**: first numbered firmware with the module (built 2 October
  2026), with the `gu-flute`, `gu-recorder` and `gu-strings` banks.
