# Cortex editor

The Cortex editor is a full modular environment in the browser: rack,
patcher and a polyphonic simulation engine in one page. It is the front end
of the Cortex system — patches made here upload to the Teensy over USB, and
a contract test pins the editor to the firmware it was built against.

## Rack

Racks are assembled from module panels — both MusicBrain's own modules and
faithful recreations of classic hardware, drawn to the millimetre. Modules
can be grouped into voice groups, bundling identical modules into one
polyphonic stack.

## Patcher

Patching works like it does on hardware: drag from an out-jack to an
in-jack. Cables are colour-coded by signal type (CV, gate, trigger, audio,
MIDI), and knobs, sliders and switches on the panels are live — they show
and change the state of the current patch.

## Simulation and polyphony

The built-in engine plays the patch in the browser: MIDI comes from an
on-screen keyboard, a test sequence or Web MIDI, and the voice chain
follows the patch connections. Polyphony scales from mono to sixteen
voices, including an eight-voice DX7 with the original factory ROM banks.

## Firmware link

The editor and the Teensy firmware share one contract: the firmware dumps
its module catalogue and the editor's test suite verifies against it, so a
panel in the browser always matches a DSP module on the hardware. Editor
versions therefore follow the firmware series — 0.5.48 pairs with firmware
0.5.48, which carries the Mutable Instruments ports (Rings, Plaits, Clouds,
Tides, Marbles, Warps, Stages, Peaks), the DX7, drum machines and the
sequencer family. Release tags follow `editor/cortex/vX.Y.Z`.
