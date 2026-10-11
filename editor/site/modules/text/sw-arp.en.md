## Overview

An arpeggiator: hold a chord and it plays the notes one after another, in
time. It listens to the keyboard itself, just like MIDI-IN, and plays a
single voice on Pitch, Gate and Vel; patch those into an oscillator,
envelope and VCA the same way as the mono outputs of MIDI-IN.

Mode sets the order: Up, Down, Up/Down (the top and bottom notes once),
Random (never the same note twice in a row) or Played (the order in which
you pressed the keys). Oct repeats the sequence one to four octaves higher.
With Latch on the sequence keeps playing after you let go; a new chord
after releasing all keys starts a new sequence.

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

## Sources & licences

- Its features follow the useful part of the arpeggiator in Mutable
  Instruments Yarns; the code is our own.
- MIT licence.

## Versions

- **0.5.96**: first version.
