# Reflex editor

The Reflex editor is where a guitarist designs their switching rig. It runs
entirely in the browser — nothing to install, no account, no backend. The
project lives in local storage and can be exported and imported as a single
JSON file, which is also what the device consumes.

## Patches

The musician's view. Patches are listed with their MIDI program-change
numbers; clicking an effect toggles its bypass, and the composed relay mask
is shown at the bottom exactly as the hardware will apply it. Patch names
are limited to sixteen characters so they always fit the device display.

## Effect chain

The engineer's view: a graphical signal-path editor. Devices carry brand,
model and category, and are wired from input to output by dragging between
handles; parallel branches are allowed. An auto-assign pass sorts the graph
topologically and hands each device a relay, which can then be overridden
per device.

## Simulation

Before anything is wired for real, the whole rig can be played on screen.
The virtual footswitch serialises genuine MIDI program-change bytes, sends
them down an emulated cable, and the brain decodes them with the same
state machine as the firmware — what switches on screen is what will switch
on stage. The active signal path lights up through the pedal chain and the
relay matrix shows the resulting contact states.

## Versions

Software follows x.y.z. Version 0.1.0 was the first working editor
(May 2026); 0.2.0 adds RP Pico support and saving patches to the device
over MIDI (CC#102). Release tags in the repository follow
`editor/reflex/vX.Y.Z`.
