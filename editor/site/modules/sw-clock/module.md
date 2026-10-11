# Clock

## Overview

The clock everything runs in time to.

The master clock of a patch: one tempo from which all outputs are derived,
so they never drift apart. Beat gives quarter notes, ×2 eighths, ×3
triplets and ×4 sixteenths, the step clock for the sequencers (Seq Clk, or
Grids, Euclid and Turing with ExtClk on). Bar gives one pulse per bar of
four beats, and Div one pulse every Div sixteenths (6 = dotted quarter,
3 = dotted eighth).

Ramp is a saw from 0 to 1 over each bar: patch it into a filter or a morph
and the movement runs in time with the music.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Tempo | 20 … 300 bpm | 120 | The tempo (follows ♩ in the toolbar). |
| Run | off / on | on | Off: the clock stops and all gates stay low. |
| Swing | 0 … 1 | 0 | Swing: every second sixteenth later. |
| Width | 0.05 … 0.95 | 0.5 | Pulse width of the gate outputs. |
| Div | 1 … 64 | 6 | Length of the Div output in sixteenths (6 = dotted quarter). |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| Rst | in | gate | A rising edge goes back to beat one. |
| Tempo | in | cv | Tempo modulation, exponential: +1 doubles the tempo. |
| Bar | out | gate | One pulse per bar of four beats. |
| Beat | out | gate | Quarter notes. |
| ×2 | out | gate | Eighth notes. |
| ×3 | out | gate | Eighth-note triplets. |
| ×4 | out | gate | Sixteenth notes, with swing: the step clock for sequencers. |
| Div | out | gate | One pulse every Div sixteenths. |
| Ramp | out | cv | A saw from 0 to 1 over each bar. |

## How it works

The clock keeps a single phase counted in beats and advances it at the
control rate of 1 kHz; every output is a fraction of that phase, so a
division can never slip against another. Width is the pulse width of all
gate outputs. Swing moves every second sixteenth on ×4 later, from straight
(0) to triplet swing (1). The Tempo input is exponential: +1 doubles the
tempo, −1 halves it.

Rst goes back to beat one; right after a reset all outputs are high
together. Run off stops the clock and holds all gates low; Run on carries
on from where it stopped.

The Tempo knob follows the patch tempo (♩ in the toolbar), unless you set
the module to its own tempo.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain).
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

Patches to play (open them in the editor from their page): [Acid jam](https://musicbrain.nl/patches/acid-jam).

In the editor's example set: *🧪 Acid jam (Clock + Euclid + Chaos)*, *🌊 West Coast (Turing + Folder + LPG)*, *🧬 Acid jam*, *🌊 West Coast*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Our own code, MIT licence.

## Versions

- **0.5.95**: first version.
