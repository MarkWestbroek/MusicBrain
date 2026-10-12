# Synthex polysynth

## Overview

After the Elka Synthex: two oscillators per voice through a four-pole filter, with chorus.

A polyphonic voice after the Elka Synthex (1981, designed by Mario Maggi),
with eight voices in one module. Each voice has two oscillators, noise, a
four-pole multimode filter and two envelopes; one LFO, glide and a stereo
chorus are shared. Joy X bends the pitch (V/Oct) and Joy Y moves the filter,
like the joystick on the original.

Play it from MIDI-IN; **Poly ▾ → Synthex ×8** sets it up. The knobs follow
the original's 0 to 10 scale. The envelope times run from 2 ms to 10 s
along that scale.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Feet | 16' / 8' / 4' / 2' | 4' | Oscillator 1 footage, 16′ to 2′. |
| Wave | Ramp / Sqr / Pulse | Ramp | Oscillator 1 waveform: ramp, square or pulse. |
| Volume | 0 … 10 | 10 | Oscillator 1 level in the mixer (16 steps). |
| Feet | 16' / 8' / 4' / 2' | 4' | Oscillator 2 footage, 16′ to 2′. |
| Transp | -12 … 12 semi | 0 | Oscillator 2 transposed in semitones. |
| Detune | -50 … 50 ct | 6 | Oscillator 2 slightly detuned: beating and width. |
| Wave | Ramp / Sqr / Pulse | Ramp | Oscillator 2 waveform: ramp, square or pulse. |
| Volume | 0 … 10 | 8 | Oscillator 2 level in the mixer (16 steps). |
| Sync | off / on | off | Locks oscillator 2 to oscillator 1. |
| Ring | off / on | off | Replaces oscillator 2 with the product of both oscillators. |
| PW | 0.05 … 0.5 | 0.3 | Pulse width for the Pulse waveform. |
| Noise | 0 … 10 | 0 | Noise level in the mixer. |
| Freq | 0 … 10 | 6 | Filter: the brightness. |
| Reso | 0 … 10 | 2 | Filter: the resonance peak. |
| Env | 0 … 10 | 4 | How much the filter envelope opens the filter on each note. |
| Kbd | 0 … 10 | 3 | Keyboard tracking of the filter: 10 = follows the pitch fully. |
| Mode | LP / BP / HP | LP | Filter mode: low-pass 24 dB, band-pass 12 dB or high-pass 24 dB. |
| A | 0 … 10 | 0.5 | Filter envelope attack. |
| D | 0 … 10 | 5 | Filter envelope decay. |
| S | 0 … 10 | 6 | Filter envelope sustain. |
| R | 0 … 10 | 4 | Filter envelope release. |
| A | 0 … 10 | 0.5 | Volume attack: how fast a note comes in. |
| D | 0 … 10 | 5 | Volume envelope decay. |
| S | 0 … 10 | 8 | Volume envelope sustain. |
| R | 0 … 10 | 4 | Volume release after you let go. |
| Rate | 0.05 … 20 Hz | 5 | LFO speed. |
| Wave | Tri / Sqr / Saw / S&H | Tri | LFO waveform: triangle, square, sawtooth or sample & hold. |
| →Osc | 0 … 1 | 0 | LFO to the pitch of both oscillators (1 = ±1 octave). |
| →PW | 0 … 1 | 0 | LFO to the pulse width. |
| →VCF | 0 … 1 | 0 | LFO to the filter cutoff (1 = ±2 octaves). |
| →VCA | 0 … 1 | 0 | LFO to the volume (tremolo). |
| Glide | 0 … 1 | 0 | Portamento time between notes. |
| Tune | -12 … 12 semi | 0 | Master tuning in semitones. |
| Chorus | off / on | on | The stereo chorus. |
| Level | 0 … 1 | 0.8 | Output volume. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| voct_1 | in | cv | Pitch of key 1, 1 V per octave (from MIDI-IN). |
| voct_2 | in | cv | Pitch of key 2, 1 V per octave (from MIDI-IN). |
| voct_3 | in | cv | Pitch of key 3, 1 V per octave (from MIDI-IN). |
| voct_4 | in | cv | Pitch of key 4, 1 V per octave (from MIDI-IN). |
| voct_5 | in | cv | Pitch of key 5, 1 V per octave (from MIDI-IN). |
| voct_6 | in | cv | Pitch of key 6, 1 V per octave (from MIDI-IN). |
| voct_7 | in | cv | Pitch of key 7, 1 V per octave (from MIDI-IN). |
| voct_8 | in | cv | Pitch of key 8, 1 V per octave (from MIDI-IN). |
| gate_1 | in | gate | Gate of key 1: high while the key is held. |
| gate_2 | in | gate | Gate of key 2: high while the key is held. |
| gate_3 | in | gate | Gate of key 3: high while the key is held. |
| gate_4 | in | gate | Gate of key 4: high while the key is held. |
| gate_5 | in | gate | Gate of key 5: high while the key is held. |
| gate_6 | in | gate | Gate of key 6: high while the key is held. |
| gate_7 | in | gate | Gate of key 7: high while the key is held. |
| gate_8 | in | gate | Gate of key 8: high while the key is held. |
| Joy X | in | cv | Joystick X: pitch bend, 1 V per octave. |
| Joy Y | in | cv | Joystick Y: moves the filter cutoff. |
| L | out | audio | Left output (after the chorus). |
| R | out | audio | Right output (after the chorus). |

## How it works

On the instrument the oscillators are digital (counters on a 4 MHz clock),
which is why it stays in tune. Each offers Ramp (sawtooth), Square or Pulse
(with PW) at 16′ to 2′. Oscillator 2 adds Transpose and Detune; Sync locks
it to oscillator 1, and Ring replaces it with the product of both. The mixer
counts in 16 steps, like the 4-bit volume switches (binary-weighted
resistors) of the original.

The filter on the original is four OTA stages in series with feedback for
resonance; switches choose the tap, so the same filter is low-pass,
band-pass or high-pass. Here it is four one-pole stages (TPT) with a soft
limiter in the loop, and the modes mix the stage outputs: LP 24 dB, BP
12 dB, HP 24 dB per octave. Freq spans 20 Hz to 20 kHz over the knob; the
filter envelope, keyboard tracking, LFO and Joy Y add to it. The chorus is
the MusicBrain BBD chorus. The split and double modes and the sequencer of
the original are not included.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): about **12.2 % CPU per instance** (one note, default settings), measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

Patches to play (open them in the editor from their page): [Synthex ×8 (dramatic)](https://musicbrain.nl/patches/synthex-8-dramatic).

In the editor's example set: *🎛️ Synthex ×8 (Elka)*, *🎛 Synthex ×8*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Own implementation (MIT licence), built from the topology in the Elka
  Synthex schematic diagrams (dated 1-6-83: sheet 1 block diagram, sheet 4
  voice card 410CST5800) and the oscillator calibration instructions; not a
  component-level simulation.

## Versions

- **First version** (October 2026): eight voices, two oscillators with sync
  and ring, noise, multimode filter, two ADSRs, LFO routing, glide, chorus
  and joystick inputs.
