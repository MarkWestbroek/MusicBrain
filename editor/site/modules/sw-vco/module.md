# VCO

## Overview

Oscillator: the source of the tone.

The basic oscillator of MusicBrain, and the start of most example voices: a
VCO into a filter into a VCA. The Wave switch picks one of four waveforms
(sine, triangle, saw or square). Coarse tunes in semitones (±36), Fine in
cents (±100), and Level sets how loud it comes out.

Patch a pitch CV from MIDI-in or a sequencer into 1V/Oct: 0 V is C4
(261.6 Hz) and each volt is one octave. The Tune input adds a second pitch
voltage on top, for pitch bend or detune, without overwriting the note. The
FM input, scaled by the FM knob, moves the pitch in octaves: an LFO there
gives vibrato. It runs at the 1 kHz control rate; for audio-rate frequency
modulation use the FM-VCO.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Wave | Sin / Tri / Saw / Sqr | Saw | The waveform: sine, triangle, saw or square. |
| Coarse | -36 … 36 semi | 0 | Tuning in semitones, on top of the V/Oct input. |
| Fine | -100 … 100 ct | 0 | Fine tuning in cents. |
| FM | 0 … 1 | 0 | How much the FM input moves the pitch (at 1: one octave per unit). |
| Level | 0 … 1 | 0.8 | Output level. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| 1V/Oct | in | cv | Pitch, 1 V per octave; 0 V is C4. |
| Tune | in | cv | Extra pitch in V/Oct added to the note, for bend or detune. |
| FM | in | cv | Pitch modulation: adds FM × the FM knob in octaves (1 kHz control rate, for vibrato and sweeps). |
| Out | out | audio | The oscillator. |

## How it works

The oscillator is `AudioSynthWaveform` from the Teensy Audio Library, using
its plain (not band-limited) waveforms, so very high notes alias. The pitch
is 261.6256 Hz × 2^(V/Oct + Tune + FM × FM knob + Coarse/12 + Fine/1200),
recomputed as soon as any of these changes.

The browser simulator runs a WebAssembly copy of the same oscillator code,
so the editor and the Brain behave the same.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): about **0.1 % CPU per instance** (one note, default settings), measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

Patches to play (open them in the editor from their page): [6-stemmig ladder-filter](https://musicbrain.nl/patches/6-stemmig-ladder-filter).

In the editor's example set: *1-stemmig (mono)*, *2-stemmig*, *4-stemmig*, *8-stemmig*, *16-stemmig*, *4-stemmig + aftertouch → filter*, *🎺 CS-80 brass (aftertouch)*, *🎹 Axel F-lead (2 saws)*, *Reservoir demo (gedeelde bron)*, *🌊 West Coast (Turing + Folder + LPG)*, *🎚️ SEM sweep (LP → notch → HP)*, *🎺 CS-80 brass ×4*, *🎸 Axel F lead*, *🌊 West Coast*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Oscillator: `AudioSynthWaveform` from the Teensy Audio Library by PJRC
  (MIT licence).
- The MusicBrain module code is MIT licensed.

## Versions

- **0.5.109**: the FM input and FM knob work; the Sync input, which never
  did anything, is gone.
- **0.5.93**: Coarse and Fine retune at once (they used to wait for the next
  V/Oct change); unplugging the V/Oct cable returns the pitch to C4.
- **Simulator** (September 2026): the browser plays the firmware oscillator
  as WebAssembly.
- **May 2026**: Tune input, so pitch bend no longer overwrites the note.
- **First version** (May 2026): wave, coarse, fine and level.
