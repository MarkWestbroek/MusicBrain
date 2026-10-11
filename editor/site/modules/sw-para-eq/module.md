# Parametric EQ

## Overview

A mixing-desk style parametric EQ.

A four-band parametric EQ with a nod to the British mixing-desk EQ of the
SSL E/G consoles: tight, clean, the workhorse. LF and HF can each be a bell or
a shelf; the two mid bands have their own Q. A high-pass and a low-pass filter
sit around it, and every band does ±15 dB.

Use it to make room in a mix or to shape a single voice. Prop.Q switches to
the American way of working (API 550 style): the Q follows the gain, so a
small boost is broad and a large one is focused. There is no saturation;
Output evens out the level so an A/B with Bypass is fair. The module is
stereo, with the same curve on both channels.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Freq | 30 … 450 Hz | 100 | Frequency of the low band, 30–450 Hz. |
| Gain | -15 … 15 dB | 0 | The bass: up or down. |
| Shape | Bell / Shelf | Shelf | Low band as a bell or a shelf. |
| Freq | 200 … 2000 Hz | 600 | Frequency of the low-mid band, 200 Hz–2 kHz. |
| Gain | -15 … 15 dB | 0 | The low mids: up or down. |
| Q | 0.4 … 4 | 1 | Width of the low-mid band: low = broad, high = narrow. |
| Freq | 600 … 7000 Hz | 2500 | Frequency of the high-mid band, 600 Hz–7 kHz. |
| Gain | -15 … 15 dB | 0 | The high mids: up or down. |
| Q | 0.4 … 4 | 1 | Width of the high-mid band: low = broad, high = narrow. |
| Freq | 1500 … 16000 Hz | 8000 | Frequency of the high band, 1.5–16 kHz. |
| Gain | -15 … 15 dB | 0 | The treble: up or down. |
| Shape | Bell / Shelf | Shelf | High band as a bell or a shelf. |
| HPF | 16 … 400 Hz | 16 | High-pass filter, 12 dB per octave; fully left is off. |
| LPF | 3000 … 20000 Hz | 20000 | Low-pass filter; fully right (20 kHz) is off. |
| Prop.Q | Uit / Aan | Uit | On: the Q follows the gain, broad for small changes, focused for large ones. |
| Output | -12 … 12 dB | 0 | Output level, to match the level for an A/B with Bypass. |
| Bypass | Uit / Aan | Uit | On: the signal passes unchanged. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| L | in | audio | Audio input, left (or mono). |
| R | in | audio | Audio input, right. |
| L | out | audio | Equalised audio, left. |
| R | out | audio | Equalised audio, right. |

## How it works

Each band is a biquad filter from the shared MusicBrain EQ building blocks
(RBJ cookbook formulas), so "a 6 dB shelf" means the same in every EQ module.
The ranges: LF 30–450 Hz, LMF 200 Hz–2 kHz, HMF 600 Hz–7 kHz, HF 1.5–16 kHz,
Q 0.4–4. The HPF has a 12 dB per octave slope and is off at the far left;
the LPF is off at the far right (20 kHz).

With Prop.Q on, a bell at 0 dB uses 0.4 times the set Q, rising to the full
Q at ±15 dB. All knobs glide over about 5 ms, so turning them does not zip,
and the filters are only recalculated while something moves.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain).
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *🎹 Axel F-lead (2 saws)*, *🎚️ Plaits + Para EQ*, *🎸 Axel F lead*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- In the spirit of the SSL E/G channel EQ, with the proportional Q of the
  API 550 as a switchable mode; no circuit simulation.
- Filter coefficients after the RBJ Audio EQ Cookbook (`mmb_dsp/biquad.h`).
- Own kernel `mmb_dsp/param_eq.h`, MIT licence.

## Versions

- **0.5.65**: first version. Measured on the Teensy with a sawtooth: LF
  shelf +10 dB at 100 Hz gives +8.4 dB at 65 Hz; HMF +12 dB at 2.5 kHz gives
  +11.9 dB. About 4 % CPU in mono.
