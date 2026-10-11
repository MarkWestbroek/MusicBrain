## Overview

The master clock of a patch: one tempo from which all outputs are derived,
so they never drift apart. Beat gives quarter notes, ×2 eighths, ×3
triplets and ×4 sixteenths, the step clock for the sequencers (Seq Clk, or
Grids, Euclid and Turing with ExtClk on). Bar gives one pulse per bar of
four beats, and Div one pulse every Div sixteenths (6 = dotted quarter,
3 = dotted eighth).

Ramp is a saw from 0 to 1 over each bar: patch it into a filter or a morph
and the movement runs in time with the music.

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

## Sources & licences

- Our own code, MIT licence.

## Versions

- **0.5.95**: first version.
