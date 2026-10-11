## Overview

A voice modelled on the Ondes Martenot (Maurice Martenot, 1928), heard in
Messiaen's *Turangalîla* and in Jonny Greenwood's music. It is a nearly
pure tone with a drawer (the tiroir) of timbre switches; here they are mix
knobs you can combine. The loudspeakers are a separate module, DIFFUSEUR,
after the voice: Principal, Palme (sympathetic strings) or Métallique (a
gong).

Volume chooses how you play. Klavier (keyboard): the key and its velocity
make the note and pressure swells on top. Touche: as on the instrument, the
pressure key under the left hand makes the volume and the keys (or the
ribbon of the screen keyboard) only choose the pitch; with no pressure there
is no sound. Patch Touche to aftertouch (Press from MIDI-IN). Vib is the
vibrato you make by rocking the key sideways; Vib+ (the mod wheel) adds
more. Glide is the slide of the ring on the wire. For an ensemble, use
**Ondes ×4**: four voices through one Palme.

## How it works

The tiroir is six sources mixed together: O (onde) a sine; C (creux) only
odd overtones, a soft square; G (gambe) a sawtooth, bowed and rich; N
(nasillard) a narrow pulse through a high-pass, nasal; 8 (octaviant) the
octave added by full-wave rectification; and S (souffle) noise through a
band-pass filter at the pitch, the breath. Vibrato is always a little
present (Vib, up to a semitone) and the mod wheel adds the rest. Bright
sets how dull or bright the tone goes into the cabinet.

The sine comes from a 512-point table with linear interpolation (error
about −94 dB) instead of the library sine function, which is much cheaper
on the Teensy. Amp sends the volume out as CV. The same C++ kernel
(`mmb_dsp/martenot.h`) runs on the Teensy and in the browser.

## Sources & licences

- Own implementation (MIT licence), modelled by ear on descriptions of the
  Ondes Martenot; not a circuit simulation. The sine table follows the
  approach of `lut_sine` in Mutable Instruments' code; the table itself is
  computed at start-up.

## Versions

- **0.5.97**: sine from an interpolated table instead of `sinf`; on the
  Teensy a voice without loudspeaker went from 7.7 % to 4.5 % CPU.
- **0.5.96**: first version: the six tiroir knobs, Klavier or Touche
  volume, vibrato with mod wheel, glide; the loudspeakers as DIFFUSEUR.
