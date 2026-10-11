## Overview

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
