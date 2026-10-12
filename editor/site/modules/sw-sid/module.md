# SID

## Overview

The Commodore 64 sound chip: three voices and a filter.

An emulation of the MOS 6581/8580, the sound chip of the Commodore 64,
written from scratch for MusicBrain. Each chip has three voices with
triangle, saw, pulse and noise, an ADSR envelope per voice and one
multimode filter. One module runs one to four chips (the SIDs knob), so up
to twelve voices, each chip with its own filter, like a dual or quad-SID
machine.

Play it with MIDI-in spread over the voice cells (Poly ▾ → SID ×3, ×6, ×9
or ×12). The waveform switches can be combined, the envelope and filter
knobs use the chip's own register values (0–15, cutoff 0–2047), and the Chip
switch chooses between the gritty 6581 and the cleaner 8580. Take Mono, the
stereo pair L/R (chips spread with Spread), or each chip on its own
output S1–S4.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Tri | Uit / Aan | Uit | Triangle wave on or off. |
| Saw | Uit / Aan | Uit | Sawtooth wave on or off. |
| Pulse | Uit / Aan | Aan | Pulse wave on or off. |
| Noise | Uit / Aan | Uit | Noise on or off; combined with another wave it dies out, as on the chip. |
| PW | 0 … 1 | 0.5 | Pulse width: from hollow (narrow) to full (square). |
| Combo | 0 … 10 | 7 | How strong combined waveforms are: 0 = pure AND, 4 = 8580, 7 = 6581. |
| Ring | Uit / Aan | Uit | Ring-modulates each voice's triangle with the voice before it. |
| Sync | Uit / Aan | Uit | Hard-syncs each voice to the voice before it. |
| A | 0 … 15 | 0 | How fast a note comes in (register value 0–15). |
| D | 0 … 15 | 9 | How fast it then falls (0–15). |
| S | 0 … 15 | 10 | Sustain level (0–15). |
| R | 0 … 15 | 9 | How fast a note fades after the gate closes (0–15). |
| Coarse | -24 … 24 semi | 0 | Tuning in semitones. |
| Fine | -100 … 100 ct | 0 | Fine tuning in cents. |
| Vol | 0 … 15 | 15 | The chip's 4-bit master volume (0–15). |
| Level | 0 … 1 | 0.8 | Output level of the module. |
| Filt | Uit / Aan | Uit | Sends the voices through the filter. |
| Chip | 6581 / 8580 | 6581 | Chip model for filter and output: 6581 or 8580. |
| Cutoff | 0 … 2047 | 1024 | Filter: the brightness. |
| Res | 0 … 15 | 0 | Filter: the resonance. |
| Curve | 0 … 1 | 0.5 | 6581 only: moves the cutoff curve, as no two 6581s are alike (0 = bright, 1 = dark). |
| LP | Uit / Aan | Aan | Low-pass mode on or off (combine with BP and HP). |
| BP | Uit / Aan | Uit | Band-pass mode on or off. |
| HP | Uit / Aan | Uit | High-pass mode on or off; LP + HP gives a notch. |
| SIDs | 1 … 4 | 1 | How many chips play (1–4), three voices each. |
| Spread | 0 … 1 | 0.7 | How far the chips are spread over left and right. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| voct_1 | in | cv | Pitch of voice 1 (chip 1), 1 V per octave. |
| voct_2 | in | cv | Pitch of voice 2 (chip 1), 1 V per octave. |
| voct_3 | in | cv | Pitch of voice 3 (chip 1), 1 V per octave. |
| voct_4 | in | cv | Pitch of voice 4 (chip 2), 1 V per octave. |
| voct_5 | in | cv | Pitch of voice 5 (chip 2), 1 V per octave. |
| voct_6 | in | cv | Pitch of voice 6 (chip 2), 1 V per octave. |
| voct_7 | in | cv | Pitch of voice 7 (chip 3), 1 V per octave. |
| voct_8 | in | cv | Pitch of voice 8 (chip 3), 1 V per octave. |
| voct_9 | in | cv | Pitch of voice 9 (chip 3), 1 V per octave. |
| voct_10 | in | cv | Pitch of voice 10 (chip 4), 1 V per octave. |
| voct_11 | in | cv | Pitch of voice 11 (chip 4), 1 V per octave. |
| voct_12 | in | cv | Pitch of voice 12 (chip 4), 1 V per octave. |
| gate_1 | in | gate | Gate of voice 1: starts and releases its envelope. |
| gate_2 | in | gate | Gate of voice 2: starts and releases its envelope. |
| gate_3 | in | gate | Gate of voice 3: starts and releases its envelope. |
| gate_4 | in | gate | Gate of voice 4: starts and releases its envelope. |
| gate_5 | in | gate | Gate of voice 5: starts and releases its envelope. |
| gate_6 | in | gate | Gate of voice 6: starts and releases its envelope. |
| gate_7 | in | gate | Gate of voice 7: starts and releases its envelope. |
| gate_8 | in | gate | Gate of voice 8: starts and releases its envelope. |
| gate_9 | in | gate | Gate of voice 9: starts and releases its envelope. |
| gate_10 | in | gate | Gate of voice 10: starts and releases its envelope. |
| gate_11 | in | gate | Gate of voice 11: starts and releases its envelope. |
| gate_12 | in | gate | Gate of voice 12: starts and releases its envelope. |
| Cut+ | in | cv | Added to the cutoff; 0 to 1 covers the whole range. |
| Ext 1 | in | audio | EXT IN of chip 1: any audio through that chip's filter. |
| 2 | in | audio | EXT IN of chip 2, through its filter. |
| 3 | in | audio | EXT IN of chip 3, through its filter. |
| 4 | in | audio | EXT IN of chip 4, through its filter. |
| S1 | out | audio | Chip 1 on its own, to mix and pan yourself. |
| S2 | out | audio | Chip 2 on its own, to mix and pan yourself. |
| S3 | out | audio | Chip 3 on its own, to mix and pan yourself. |
| S4 | out | audio | Chip 4 on its own, to mix and pan yourself. |
| Bend | in | cv | Pitch bend in V/Oct for all voices. |
| PW+ | in | cv | Added to the pulse width (0 to 1). |
| L | out | audio | Left: the chips spread over the stereo image with Spread. |
| R | out | audio | Right: the chips spread over the stereo image with Spread. |
| Mono | out | audio | Mono: all chips summed, with a limiter. |

## How it works

Each voice has a 24-bit phase accumulator. Saw, triangle and pulse come from
its bits, noise from a 23-bit shift register clocked by accumulator bit 19.
Every jump in a waveform is smoothed with a PolyBLEP at its exact moment, to
keep aliasing down. Ring and Sync link each voice to the one before it
(3 → 1 → 2 → 3). Combined waveforms use our own bit-line model: a 0 pulls
harder than a 1, so the result is like a weakened AND; the Combo knob sets
how weak, with the 8580 and 6581 marked on the scale. Noise in a
combination dies out, as on the chip. The ADSR is cycle-exact, with the
period table, the pseudo-exponential decay and the 15-bit rate counter, so
the famous ADSR bug (a wait of up to about 33 ms) happens by itself.

The filter is a two-pole state-variable filter, 12 dB per octave, with LP,
BP and HP as separate switches (LP + HP gives a notch). In 8580 mode the
cutoff runs nearly linearly from about 30 Hz to 12 kHz and resonance goes up
to Q ≈ 4. In 6581 mode the cutoff follows an S-curve (stuck around 220 Hz at
the bottom, steep in the middle, up to about 16 kHz), Curve moves that
middle to mimic different chips, resonance is weaker, loud signals distort,
and each voice gives a dull click when it starts, as does a volume change.
The combined-waveform strengths and the filter curves are tuned by ear, not
measured on a chip. A 10 Hz high-pass on the output plays the role of the
C64's coupling capacitor. A chip whose voices are all silent costs almost
nothing; a playing chip costs about 6 % of the Teensy (measured on
**0.5.86**).

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): about **11.3 % CPU per instance** (one note, default settings), measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

Patches to play (open them in the editor from their page): [SID piano (AT vibrato + comp + studio buizen)](https://musicbrain.nl/patches/sid-piano-at-vibrato-comp-studio-buizen).

In the editor's example set: *🕹️ SID ×3 (C64)*, *🕹️ SID ×6 (2 chips, stereo)*, *🕹️ SID ×9 (3 chips, stereo)*, *🕹️ SID ×12 (4 chips, stereo)*, *👾 SID ×3*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Our own clean-room emulation at register level (`mmb_dsp/sid.h`), written
  from public documentation: the datasheet, the Commodore 64 Programmer's
  Reference Guide and published descriptions of the chip's behaviour.
- It contains no code from reSID or reSIDfp, which are GPL. The MusicBrain
  code is MIT licensed.
- The browser simulator runs the same C++ header as WebAssembly.

## Versions

- **0.5.88**: EXT IN per chip (Ext 1–4, each through its own chip's
  filter); twelve SID sounds in the module presets.
- **0.5.87**: noise combined with another waveform no longer overloads the
  Teensy; chips share their waveform tables.
- **0.5.86**: one to four chips in one module, twelve voice cells, stereo
  L/R with Spread and separate outputs per chip.
- **0.5.85**: silent chips are skipped and the oscillator avoids doubles;
  a playing chip went from about 12 % to 8 % CPU.
- **0.5.84**: the engine keeps settings per voice (used by the sister module
  SID 3-osc).
- **0.5.83**: 6581 model for filter and output, with the Chip switch and
  Curve.
- **0.5.82**: the filter, 8580 model.
- **0.5.81**: combined waveforms as a bit-line model, with the Combo knob.
- **0.5.80**: DC blocker on the output.
- **0.5.79**: first version: three voices, four waveforms, ring and sync,
  cycle-exact ADSR; no filter yet.
