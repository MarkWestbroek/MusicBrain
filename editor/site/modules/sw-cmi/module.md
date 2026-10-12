# Fairlight CMI voice

## Overview

Fairlight CMI: 32 waveforms played one after another, drawn on PAGE 4.

One voice of the waveform synthesis of the Fairlight CMI (Page 4 and 5), in
the style of the CMI Series II. A sound is a harmonic profile: up to 32
harmonics, each with its own curve over 32 segments. The editor turns the
profile into 32 waveforms and the voice plays them one after another, so the
tone moves through the note.

Draw the profile on **PAGE 4** in the editor, green on black, with DUR (the
length of each segment) and ENRG (the volume curve over the segments). Seg
sets the basic segment length, Smooth blends between waveforms, and Loop
says where the voice cycles back to while you hold the key; letting go plays
on to the end. Seg+ shifts the position in the segments (±1 = ±16
segments) and Pos sends the position out as CV. Without a profile it plays
a built-in brass-like sound.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Coarse | -36 … 36 semi | 0 | Transposes the voice in semitones. |
| Fine | -100 … 100 ct | 0 | Fine tuning in cents. |
| Level | 0 … 1 | 0.8 | Output volume. |
| Seg | 5 … 1000 ms | 40 | How long each of the 32 segments lasts (DUR on Page 4 stretches or shrinks it per segment). |
| Smooth | 0 … 1 | 0.3 | 0 = switch waveforms hard (the CMI), higher = blend them. |
| Loop | 1 … 32 | 24 | While you hold the key it cycles from this segment; 32 = stay on the last one. |
| Att | 0.5 … 2000 ms | 4 | How fast a note comes in. |
| Rel | 1 … 5000 ms | 300 | How long it rings on after you let go. |
| Filter | 1 … 15 | 8 | Filter that follows the pitch, as on Page 7: higher = brighter, 8 = standard, 15 = off. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| V/Oct | in | cv | Pitch, 1 V per octave. |
| Gate | in | gate | Note on while high; on release the voice plays on to the last segment. |
| Vel | in | cv | Velocity 0 to 1, read at the start of the note. |
| Seg+ | in | cv | Shifts the position in the segments: ±1 = ±16 segments. |
| Pos | out | cv | The current position in the segments as CV, 0 to 1. |
| Out | out | audio | Mono audio output. |

## How it works

The editor computes 32 waveforms of 128 samples at 8 bit from the profile,
plus 32 duration factors and 32 energy levels, and sends them to the voice
in one message (base64 on the Teensy). The voice reads each waveform
without interpolation (zero-order hold), as the CMI did: it is clocked at
128 times the fundamental, so the mirror images of the 8-bit clock move
with the note.

After that comes a low-pass filter that follows this clock. Filter works
like FILTER on Page 7 of the CMI: 8 is the standard setting (0.45 times the
voice clock, capped at Nyquist), each step moves it half an octave, and 15
bypasses it so the aliasing of the 8-bit clock comes through. The
half-octave step is our choice; the manual gives no frequencies. The same
C++ kernel (`mmb_dsp/cmi.h`) runs on the Teensy and in the browser.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): about **1.8 % CPU per instance** (one note, default settings), measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

Patches to play (open them in the editor from their page): [CMI + REVERB (golvend)](https://musicbrain.nl/patches/cmi-reverb-golvend).

In the editor's example set: *🖥 CMI (Fairlight-stem)*, *🖥 Fairlight CMI*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Own implementation (MIT licence), modelled on the waveform synthesis of
  the Fairlight CMI Series II.
- Behaviour checked against the CMI *Operation Manual* v3.09 (Page 7,
  Level/Filter) and Greg Holmes' pages on the CMI Series II
  (<http://www.ghservices.com/gregh/fairligh/>).

## Versions

- **0.5.101**: Filter control (1–15) as on Page 7; 8 sounds as before.
- **0.5.100**: waveforms sent to the Teensy as base64, so each profile now
  sounds on the hardware too (before, a full patch fell back to the built-in
  brass).
- **0.5.99**: DURATION and ENERGY per segment; profiles drawn on PAGE 4 and
  stored in the patch.
- **0.5.98**: first version: 32 waveforms of 128 samples at 8 bit, Seg,
  Smooth, Loop, attack and release, Seg+ and Pos.
