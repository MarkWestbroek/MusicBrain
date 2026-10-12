# Rotary speaker

## Overview

A rotating speaker (Leslie): horn and drum each spin at their own speed.

A rotating speaker in the style of the Leslie: a horn for the treble and a
drum for the bass, each driven by its own motor with its own inertia. It
takes mono in (left and right are summed) and gives stereo out from two
microphones.

Switch Speed between Slow and Fast and listen to horn and drum winding up or
down at different rates; Brake lets both coast to a stop. The Fast gate
switches on its edges (high = fast, low = slow), so you can drive it from the
mod wheel or a footswitch via MIDI, alongside the switch on the panel. Both
speeds are adjustable; the defaults, 0.8 Hz and 6.7 Hz, are those of a
classic cabinet.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Speed | Slow / Fast / Brake | Slow | Slow or fast; when switching you hear horn and drum speed up or slow down. |
| Slow | 0.1 … 3 Hz | 0.8 | Rotor speed in the Slow position (default 0.8 Hz). |
| Fast | 2 … 10 Hz | 6.7 | Rotor speed in the Fast position (default 6.7 Hz). |
| Inertia | 0.25 … 2 | 1 | Scales how slowly the rotors change speed: 0.25 = quick, 1 = classic, 2 = extra heavy. |
| Drive | 0 … 1 | 0.2 | The valve preamp: more = warmer and dirtier. |
| Horn/Drum | 0 … 1 | 0.5 | Horn against drum: 0 = drum only, 0.5 = both, 1 = horn only. |
| Spread | 0 … 1 | 0.8 | Angle between the two microphones: 0 = mono, 1 = opposite sides. |
| Noise | 0 … 1 | 0.3 | Side noises: horn air, motor hum, drum rumble and the relay tick. |
| Level | 0 … 2 | 1 | Output volume (up to 2). |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| Fast | in | gate | Gate, switches on its edges: rising = fast, falling = slow. |
| D+ | in | cv | CV for the valve preamp drive. |
| L | in | audio | Left input; left and right are summed to mono. |
| R | in | audio | Right input; leave empty for a mono source. |
| L | out | audio | Left microphone. |
| R | out | audio | Right microphone. |

## How it works

The input is split at 800 Hz (a fourth-order Linkwitz-Riley crossover). The
horn moves towards and away from the microphone, so a short modulated delay
line (±0.44 ms, for a 15 cm radius) gives the Doppler pitch wobble; the drum
much less. The horn is directional: loud and bright from the front, quieter
and duller from the back, so both volume and tone swing along. A reflection
from the cabinet wall, half a turn later, adds the swirl. Spread sets the
angle between the two microphones (0 = mono).

The light horn speeds up in about a second, the heavy drum in about four,
and slowing down takes longer than speeding up; Inertia scales all of this
(0.25 = quick, 2 = extra heavy). The drum always turns a little slower than
the horn, so the two never run in step. Noise adds the side sounds: air from
the horn that grows with speed, motor hum and rumble from the drum, and a
relay tick when switching. Drive is the valve preamp in front.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): about **13.3 % CPU per instance** (one note, default settings), measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

Patches to play (open them in the editor from their page): [MS-20-ed Hammond w/ Tape Delay & Lesley](https://musicbrain.nl/patches/ms-20-ed-hammond-w-tape-delay-lesley).

In the editor's example set: *🎹 Organ ×12 (tonewheel + Rotary)*, *🌪️ DX7 + Rotary*, *🪗 Organ ×12*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Own implementation (MIT licence), modelled on the rotating horn and drum
  speaker cabinets in the style of the Leslie; adjustable slow and fast
  speeds as on ELKA cabinets.

## Versions

- **0.5.78**: first version. Horn and drum with separate inertia, Doppler,
  directivity, cabinet reflection, two microphones, side noises, valve
  preamp, adjustable slow and fast speeds, Brake and the Fast gate.
