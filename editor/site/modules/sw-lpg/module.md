# Low-pass gate

## Overview

Low-pass gate: filter and volume together, with the after-glow of a vactrol.

A low-pass gate in the style of the Buchla 292: filter and amplifier in
one, driven by a vactrol. In Both mode the same control sets brightness and
volume together, so a note that dies away also gets duller, like a struck
piece of wood or a plucked string.

Send a trigger to Ping and you get a short, natural "bonk" without any
envelope: the classic West Coast percussion sound. Or patch an envelope or
LFO into CV to open the gate slowly; it still closes with the lazy vactrol
tail. Env gives that vactrol state as a CV for use elsewhere.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Open | 0 … 1 | 0 | How far the gate is open without a hit. |
| Decay | 0.02 … 4 s | 0.25 | How long the vactrol glows on: the tail of each note. |
| Mode | LP / Both / VCA | Both | LP: only the filter follows the vactrol; Both: filter and volume; VCA: only the volume. |
| Res | 0 … 1 | 0.1 | Filter peak, from none to a peak that rings along. |
| Level | 0 … 1 | 0.9 | Output level. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| CV | in | cv | Opens the gate, 0 … 1, added to Open. |
| Ping | in | gate | Ping: a trigger flashes the vactrol for a short, natural hit. |
| In | in | audio | The audio to be gated. |
| Out | out | audio | The gated audio. |
| Env | out | cv | The vactrol state as CV, 0 … 1. |

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

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): about **3.5 % CPU per instance** (one note, default settings), measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *🌊 West Coast (Turing + Folder + LPG)*, *🎛️ Buchla-stem (Complex + LPG)*, *🧪 Buchla voice*, *🌊 West Coast*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Modelled on the behaviour of the Buchla 292 low-pass gate; our own model,
  not a circuit simulation.
- Own kernel `mmb_dsp/lpg.h`, shared by the Brain and the browser, MIT
  licence.

## Versions

- **0.5.95**: first version, with ping, three modes and the Env output.
