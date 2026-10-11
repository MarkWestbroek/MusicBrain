## Overview

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

## Sources & licences

- Own implementation (MIT licence), modelled on the rotating horn and drum
  speaker cabinets in the style of the Leslie; adjustable slow and fast
  speeds as on ELKA cabinets.

## Versions

- **0.5.78**: first version. Horn and drum with separate inertia, Doppler,
  directivity, cabinet reflection, two microphones, side noises, valve
  preamp, adjustable slow and fast speeds, Brake and the Fast gate.
