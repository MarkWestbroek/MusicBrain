# Tape strip

## Overview

The mechanics of a Mellotron: an eight-second tape per key, with wow, flutter and wear.

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

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Bank | 0 … 15 | 0 | Which sample bank is on the tapes (flute, strings …). |
| Length | 1 … 8 s | 8 | Length of each tape strip, 1–8 s: the note stops abruptly when it runs out. |
| Return | 0.1 … 4 s | 1 | How long a full strip takes to rewind after you let go. |
| Contact | 0 … 1 | 0.5 | The pressure pad against the head: the rise and the little pitch dip when you press. |
| Level | 0 … 1 | 0.8 | Output level. |
| Motor | 0 … 1 | 0.4 | How much the motor slows when you hold many keys. |
| Wow | 0 … 1 | 0.3 | Slow wobble in pitch. |
| Flutter | 0 … 1 | 0.3 | Fast flutter in pitch. |
| Wear | 0 … 1 | 0.3 | Wear: tape hiss, less treble, some saturation. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| Press | in | cv | Pressure on the pad (0 to 1), for example channel pressure: slows the tape slightly. |
| Bend | in | cv | Pitch bend in V/Oct, added to all eight cells. |
| Tape | out | cv | Position of the last struck tape strip, 0 to 1 of Length. |
| Load | out | cv | Motor load, 0 to 1, with inertia. |
| L | out | audio | Audio output, left. |
| R | out | audio | Audio output, right. |
| voct_1 | in | cv | Pitch for voice 1, in V/Oct. |
| voct_2 | in | cv | Pitch for voice 2, in V/Oct. |
| voct_3 | in | cv | Pitch for voice 3, in V/Oct. |
| voct_4 | in | cv | Pitch for voice 4, in V/Oct. |
| voct_5 | in | cv | Pitch for voice 5, in V/Oct. |
| voct_6 | in | cv | Pitch for voice 6, in V/Oct. |
| voct_7 | in | cv | Pitch for voice 7, in V/Oct. |
| voct_8 | in | cv | Pitch for voice 8, in V/Oct. |
| gate_1 | in | gate | Gate for voice 1: high = key down, low = the tape rewinds. |
| gate_2 | in | gate | Gate for voice 2: high = key down, low = the tape rewinds. |
| gate_3 | in | gate | Gate for voice 3: high = key down, low = the tape rewinds. |
| gate_4 | in | gate | Gate for voice 4: high = key down, low = the tape rewinds. |
| gate_5 | in | gate | Gate for voice 5: high = key down, low = the tape rewinds. |
| gate_6 | in | gate | Gate for voice 6: high = key down, low = the tape rewinds. |
| gate_7 | in | gate | Gate for voice 7: high = key down, low = the tape rewinds. |
| gate_8 | in | gate | Gate for voice 8: high = key down, low = the tape rewinds. |
| vel_1 | in | cv | Velocity for voice 1: picks the velocity layer in the bank. |
| vel_2 | in | cv | Velocity for voice 2: picks the velocity layer in the bank. |
| vel_3 | in | cv | Velocity for voice 3: picks the velocity layer in the bank. |
| vel_4 | in | cv | Velocity for voice 4: picks the velocity layer in the bank. |
| vel_5 | in | cv | Velocity for voice 5: picks the velocity layer in the bank. |
| vel_6 | in | cv | Velocity for voice 6: picks the velocity layer in the bank. |
| vel_7 | in | cv | Velocity for voice 7: picks the velocity layer in the bank. |
| vel_8 | in | cv | Velocity for voice 8: picks the velocity layer in the bank. |

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

## Runs on

- **Teensy 4.1** (the MusicBrain Brain).
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

Patches to play (open them in the editor from their page): [Aged and a bit tired Mellotron](https://musicbrain.nl/patches/aged-and-a-bit-tired-mellotron).

In the editor's example set: *📼 Tape strip ×8 (Mellotron)*, *🎞 Mellotron flute ×8*, *🎻 Mellotron strings ×8*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Modelled on the tape mechanism of the Mellotron; no third-party code.
- Own kernel `mmb_dsp/tape_strip.h` on the shared sampler kernel, MIT
  licence.
- The flute, recorder, strings and choir banks come from GeneralUser GS 2.0.3
  by S. Christian Collins, whose licence allows derived banks with credit.

## Versions

- **0.5.95**: first numbered firmware with the module (built 2 October
  2026), with the `gu-flute`, `gu-recorder` and `gu-strings` banks.
