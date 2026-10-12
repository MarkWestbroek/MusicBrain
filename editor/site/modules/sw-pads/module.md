# Pads

## Overview

Push buttons.

Four big push buttons that turn a mouse click or a finger into gates and
triggers. Handy to try out any gate input without a keyboard or sequencer:
the Ping of the LPG, Accent and Slide on ACID, the Fast input of the
ROTARY, a Reset, start/stop of the rhythm box, or an envelope.

Each button has two outputs. G1 … G4 are high while you hold the button;
T1 … T4 give a short trigger on each press. With Latch on, the gate toggles
on each press (on, off, on), so the button acts as a switch that stays put.
Any is high whenever one of the four gates is high.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| 1 |  |  | Button 1: here it starts and stops the rhythm box. |
| 2 |  |  | Button 2: here back to beat one. |
| 3 |  |  | Button 3: a gate on G3 and a trigger on T3. |
| 4 |  |  | Button 4: a gate on G4 and a trigger on T4. |
| Latch | off / on | off | On: button 1 toggles its gate on each press. |
| Latch | off / on | off | On: button 2 toggles its gate on each press. |
| Latch | off / on | off | On: button 3 toggles its gate on each press. |
| Latch | off / on | off | On: button 4 toggles its gate on each press. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| G1 | out | gate | High while button 1 is held (or toggled on with Latch). |
| G2 | out | gate | High while button 2 is held (or toggled on with Latch). |
| G3 | out | gate | High while button 3 is held (or toggled on with Latch). |
| G4 | out | gate | High while button 4 is held (or toggled on with Latch). |
| T1 | out | gate | A 10 ms pulse on each press of button 1. |
| T2 | out | gate | A 10 ms pulse on each press of button 2. |
| T3 | out | gate | A 10 ms pulse on each press of button 3. |
| T4 | out | gate | A 10 ms pulse on each press of button 4. |
| Any | out | gate | High while any of the four gates is high. |

## How it works

The buttons are panel controls that the editor sends to the module. A quick
click still holds the gate for at least 100 ms; each trigger is 10 ms long.
On the Brain the presses arrive from the editor as live control changes, so
the editor must be connected.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): less than **0.1 % CPU** per instance, measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *🥁 Ritmebox (CR-78-presets)*, *🥁 Rhythm box (CR-78)*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Our own code, MIT licence.

## Versions

- **0.5.95**: first version.
