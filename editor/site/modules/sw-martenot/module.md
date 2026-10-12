# Ondes Martenot

## Overview

Ondes Martenot: a nearly pure tone with timbre switches you can combine.

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

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Coarse | -36 … 36 semi | 0 | Transposes the voice in semitones. |
| Fine | -100 … 100 ct | 0 | Fine tuning in cents. |
| Glide | 0 … 2000 ms | 0 | Slide time between notes, like the ring on the wire (up to 2 s). |
| Vib | 0 … 1 semi | 0.15 | Vibrato depth in semitones (up to 1). |
| Rate | 0.5 … 12 Hz | 5.5 | Vibrato speed. |
| O | 0 … 1 | 0.8 | O (onde): the pure wave. |
| C | 0 … 1 | 0 | C (creux): hollow, odd overtones only. |
| G | 0 … 1 | 0 | G (gambe): bowed and rich. |
| N | 0 … 1 | 0 | N (nasillard): nasal. |
| 8 | 0 … 1 | 0 | 8 (octaviant): adds the octave. |
| S | 0 … 1 | 0.05 | S (souffle): breath, noise around the pitch. |
| Bright | 0 … 1 | 0.6 | How dull or bright the tone goes into the loudspeaker. |
| Volume | Klavier / Touche | Klavier | Klavier = key and velocity, pressure swells on top; Touche = pressure alone makes the volume. |
| Att | 0.5 … 2000 ms | 6 | Attack time. |
| Rel | 1 … 5000 ms | 250 | Release time. |
| Level | 0 … 1 | 0.8 | Output volume. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| V/Oct | in | cv | Pitch, 1 V per octave. |
| Gate | in | gate | Note on while high. |
| Vel | in | cv | Velocity 0 to 1, used in Klavier mode. |
| Touche | in | cv | Pressure 0 to 1 (aftertouch): the volume in Touche mode, a swell in Klavier mode. |
| Vib+ | in | cv | Adds vibrato, for example from the mod wheel. |
| Amp | out | cv | The volume as CV, 0 to 1. |
| Out | out | audio | Mono audio output; send it into DIFFUSEUR. |

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

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): about **2.4 % CPU per instance** (one note, default settings), measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *🎐 Ondes ×4 (Martenot-ensemble)*, *🌊 Martenot + Palme*, *🌊 Martenot + Métallique*, *🎐 Ondes Martenot*, *🎐 Ondes ×4*.

Editor: <https://editor.musicbrain.nl>

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
