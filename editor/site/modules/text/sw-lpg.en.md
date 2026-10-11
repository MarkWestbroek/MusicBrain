## Overview

A low-pass gate in the style of the Buchla 292: filter and amplifier in
one, driven by a vactrol. In Both mode the same control sets brightness and
volume together, so a note that dies away also gets duller, like a struck
piece of wood or a plucked string.

Send a trigger to Ping and you get a short, natural "bonk" without any
envelope: the classic West Coast percussion sound. Or patch an envelope or
LFO into CV to open the gate slowly; it still closes with the lazy vactrol
tail. Env gives that vactrol state as a CV for use elsewhere.

## How it works

A vactrol is a small lamp against a light-dependent resistor. It reacts
quickly to light but recovers slowly in the dark, and more slowly the
darker it gets. The model follows that: the vactrol state rises in about
1.5 ms and falls with a time constant that grows as it closes, scaled by
Decay. A ping flashes the lamp well past fully open.

The state drives a two-pole state-variable low-pass filter that sweeps
exponentially from 20 Hz (closed) to 20 kHz (open), and an amplifier. Mode
picks what follows the vactrol: LP (only the filter), Both (filter and
volume) or VCA (only the volume). Res sets the filter peak, from none
(Q 0.6) to a peak that rings along (Q 6).

## Sources & licences

- Modelled on the behaviour of the Buchla 292 low-pass gate; our own model,
  not a circuit simulation.
- Own kernel `mmb_dsp/lpg.h`, shared by the Brain and the browser, MIT
  licence.

## Versions

- **0.5.95**: first version, with ping, three modes and the Env output.
