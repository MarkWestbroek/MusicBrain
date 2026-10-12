# Arpeggiator

## Overview

Arpeggiator: plays the keys you hold as a sequence.

An arpeggiator: hold a chord and it plays the notes one after another, in
time. It listens to the keyboard itself, just like MIDI-IN, and plays a
single voice on Pitch, Gate and Vel; patch those into an oscillator,
envelope and VCA the same way as the mono outputs of MIDI-IN.

Mode sets the order: Up, Down, Up/Down (the top and bottom notes once),
Random (never the same note twice in a row) or Played (the order in which
you pressed the keys). Oct repeats the sequence one to four octaves higher.
With Latch on the sequence keeps playing after you let go; a new chord
after releasing all keys starts a new sequence.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Mode | Up / Down / Up/Down / Random / Played | Up | Order: up, down, up and down, random, or as played. |
| Oct | 1 … 4 | 1 | How many octaves the sequence spans. |
| Tempo | 20 … 300 bpm | 120 | The tempo (follows ♩ in the toolbar). |
| Div | 1/4 / 1/8 / 1/8T / 1/16 / 1/16T / 1/32 | 1/16 | Note value of a step: 1/4, 1/8, 1/8 triplet, 1/16, 1/16 triplet or 1/32. |
| Gate | 0.05 … 1 | 0.5 | Note length as a part of the step. |
| Ch | 0 … 16 | 0 | MIDI channel it listens to; 0 = all. |
| Latch | off / on | off | On: the sequence keeps playing after you let go of the keys. |
| ExtClk | off / on | off | On: one step per rising edge on Clk instead of the internal tempo. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| Clk | in | gate | Step clock, used when ExtClk is on. |
| Rst | in | gate | A rising edge goes back to the start of the sequence. |
| Pitch | out | cv | Pitch of the current note, 1 V per octave (middle C = 0 V). |
| Gate | out | gate | High while the note plays. |
| Vel | out | cv | Velocity of the key, 0 … 1. |
| Step | out | gate | A short pulse on every step, also with no keys held. |

## How it works

The arpeggiator keeps a list of up to 16 held notes and plays one per clock
step. The internal clock runs at Tempo (bpm) divided by Div: quarter notes,
eighths, eighth triplets, sixteenths, sixteenth triplets or thirty-seconds.
With ExtClk on, each rising edge on Clk is one step. The first key pressed
from silence plays at once, without waiting for the next step.

Gate is the note length as a part of the step (with an external clock it is
measured from the last two clock edges). There is always at least a 2 ms gap
before the next step, so every note triggers again. Step pulses on every
step, also with no keys held; Rst goes back to the start of the sequence.
Ch picks a MIDI channel (0 = all). Releasing all keys without Latch stops
the sounding note; MIDI "all notes off" clears the sequence.

The Tempo knob follows the patch tempo (♩ in the toolbar) unless ExtClk is
on.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): less than **0.1 % CPU** per instance, measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *🔁 Arp + String echo*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Its features follow the useful part of the arpeggiator in Mutable
  Instruments Yarns; the code is our own.
- MIT licence.

## Versions

- **0.5.96**: first version.
