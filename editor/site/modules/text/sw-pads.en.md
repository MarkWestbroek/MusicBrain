## Overview

Four big push buttons that turn a mouse click or a finger into gates and
triggers. Handy to try out any gate input without a keyboard or sequencer:
the Ping of the LPG, Accent and Slide on ACID, the Fast input of the
ROTARY, a Reset, start/stop of the rhythm box, or an envelope.

Each button has two outputs. G1 … G4 are high while you hold the button;
T1 … T4 give a short trigger on each press. With Latch on, the gate toggles
on each press (on, off, on), so the button acts as a switch that stays put.
Any is high whenever one of the four gates is high.

## How it works

The buttons are panel controls that the editor sends to the module. A quick
click still holds the gate for at least 100 ms; each trigger is 10 ms long.
On the Brain the presses arrive from the editor as live control changes, so
the editor must be connected.

## Sources & licences

- Our own code, MIT licence.

## Versions

- **0.5.95**: first version.
