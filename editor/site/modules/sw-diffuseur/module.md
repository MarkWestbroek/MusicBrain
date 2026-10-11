# Diffuseur

## Overview

The loudspeakers of the Ondes Martenot.

The loudspeakers of the Ondes Martenot, each with its own sound. Principal is
the plain cabinet. Palme is a lyre-shaped cabinet with twelve strings that
ring in sympathy: a singing halo that carries on after the note. Métallique
uses a gong as the speaker cone: metallic, inharmonic overtones that do not
follow the pitch.

It is a separate module so that a whole poly patch shares one cabinet, as on
the instrument: put it after the voices, typically after a Martenot voice. It
also works behind anything else, a piano through the Palme for instance. The
fourth speaker of the instrument, the Résonance spring reverb, is the Reverb
module in Spring mode placed after it.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Kast | Principal / Palme / Métallique | Palme | Principal = plain cabinet, Palme = twelve sympathetic strings, Métallique = a gong as the speaker cone. |
| Mix | 0 … 1 | 0.5 | How much of the cabinet is mixed with the direct sound. |
| Ring | 0 … 1 | 0.5 | How long the Palme strings or the gong ring on. |
| Tune | -12 … 12 semi | 0 | Retunes the twelve Palme strings, in semitones from C3. |
| Gong | 60 … 600 Hz | 196 | Fundamental of the gong in Métallique, 60–600 Hz. |
| Level | 0 … 2 | 1 | Output level. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| In | in | audio | Audio input: the voices, or anything else. |
| Mix+ | in | cv | Added to the Mix knob. |
| Out | out | audio | The sound through the chosen loudspeaker (mono). |

## How it works

All three types first take a little bass and treble off, like a cabinet.
The Palme strings are twelve comb filters with damping in the loop, tuned
chromatically from C3 (130.8 Hz) and interpolated so they sit exactly on
pitch. Tune shifts them in semitones; Ring sets how long they ring, from
about 0.8 s to 7.8 s.

The gong is eight band-pass filters on the frequency ratios of a gong, built
on the Gong frequency, plus the bright, hard sound of the plate itself. Mix
blends the cabinet with the direct sound (Principal has no blend) and a soft
limiter guards the output. It is our own model, tuned by ear; no circuit
simulation.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain).
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *🎐 Ondes ×4 (Martenot-ensemble)*, *🌊 Martenot + Palme*, *🌊 Martenot + Métallique*, *🎐 Ondes Martenot*, *🎐 Ondes ×4*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Modelled on descriptions of the Ondes Martenot diffuseurs (Principal,
  Palme, Métallique); no third-party code.
- Own kernel `mmb_dsp/diffuseur.h`, MIT licence.

## Versions

- **0.5.97**: Palme strings tuned exactly (C3 now 130.79 Hz); the feedback
  follows the real damping in the loop, so the after-ring no longer sits at
  the ceiling.
- **0.5.96**: first version, together with the ARP and MARTENOT modules.
