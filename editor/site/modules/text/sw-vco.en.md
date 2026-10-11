## Overview

The basic oscillator of MusicBrain, and the start of most example voices: a
VCO into a filter into a VCA. The Wave switch picks one of four waveforms
(sine, triangle, saw or square). Coarse tunes in semitones (±36), Fine in
cents (±100), and Level sets how loud it comes out.

Patch a pitch CV from MIDI-in or a sequencer into 1V/Oct: 0 V is C4
(261.6 Hz) and each volt is one octave. The Tune input adds a second pitch
voltage on top, for pitch bend or detune, without overwriting the note. The
FM and Sync inputs and the FM knob are on the panel but do nothing yet, on
the Teensy or in the simulator; for frequency modulation use the FM-VCO.

## How it works

The oscillator is `AudioSynthWaveform` from the Teensy Audio Library, using
its plain (not band-limited) waveforms, so very high notes alias. The pitch
is 261.6256 Hz × 2^(V/Oct + Tune + Coarse/12 + Fine/1200), recomputed as
soon as any of these changes.

The browser simulator runs a WebAssembly copy of the same oscillator code,
including the inputs that are not implemented yet, so the editor and the
Brain behave the same.

## Sources & licences

- Oscillator: `AudioSynthWaveform` from the Teensy Audio Library by PJRC
  (MIT licence).
- The MusicBrain module code is MIT licensed.

## Versions

- **0.5.93**: Coarse and Fine retune at once (they used to wait for the next
  V/Oct change); unplugging the V/Oct cable returns the pitch to C4.
- **Simulator** (September 2026): the browser plays the firmware oscillator
  as WebAssembly.
- **May 2026**: Tune input, so pitch bend no longer overwrites the note.
- **First version** (May 2026): wave, coarse, fine and level.
