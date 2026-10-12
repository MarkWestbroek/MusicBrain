# Tube

## Overview

A valve amp: warm, asymmetric distortion that breathes with your playing.

Valve overdrive in two modes. Amp is a guitar amplifier: two triode stages,
a tone stack, a push-pull power stage and a speaker cabinet. Studio is a
single triode stage and an output transformer: warmth and second harmonic on
a voice, a synth or a mix, without tone stack or cabinet, and at about the
same level whatever the Drive.

Bias goes from cold (cuts off earlier, rawer) to warm (grid current sooner,
rounder). Sag lets the power supply dip when you play hard, which compresses
and softens. Mix makes it a parallel effect, with the dry path kept in
phase. Drv+ adds a control voltage to Drive: an envelope follower on it means
harder playing gives more distortion. The module is stereo with two equal
channels; with only In L patched, both outputs carry the same signal.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Mode | Studio / Amp | Amp | Studio = one triode and an output transformer; Amp = guitar amp with tone stack and cabinet. |
| Drive | 0 … 1 | 0.5 | How hard the valves are driven. |
| Stack | Fender / Marshall / Vox | Fender | The tone stack: Fender, Marshall or Vox. |
| Bias | 0 … 1 | 0.5 | Left cold (cuts off earlier, rawer), right warm (grid current sooner, rounder). |
| Bass | 0 … 1 | 0.5 | Bass. |
| Mid | 0 … 1 | 0.5 | Middle. |
| Treble | 0 … 1 | 0.5 | Treble. |
| Pres | 0 … 1 | 0.5 | Presence: the very top, the bite. |
| Sag | 0 … 1 | 0.4 | How far the power supply dips when you play hard: compression and a spongier feel (Amp). |
| Cab | Uit / Aan | Aan | Speaker cabinet simulation on or off (Amp). |
| Mix | 0 … 1 | 1 | Dry against valve: below 1 it works as a parallel effect. |
| Level | 0 … 1 | 0.6 | Output level. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| Drv+ | in | cv | Added to the Drive knob. |
| In L | in | audio | Audio input, left (or mono). |
| In R | in | audio | Audio input, right; leave it empty and both outputs carry the left channel. |
| Out L | out | audio | Audio output, left. |
| Out R | out | audio | Audio output, right. |

## How it works

A valve clips differently from a diode. Above zero, grid current starts to
flow and the top is rounded softly; below zero the valve cuts off later and
harder. That asymmetry gives even harmonics. The grid current also charges
the coupling capacitor, so after a hard hit the operating point sinks and
recovers over tens of milliseconds (blocking): the distortion breathes with
your playing.

In Amp mode the preamp gives up to about 60 dB over two stages. The tone
stack follows three amp families: Fender (a deep mid scoop around 400 Hz),
Marshall (shallower and higher, around 650 Hz, more mids) and Vox top boost
(little scoop, bright). The cabinet (Cab) is a 4×12-like curve: little below
80 Hz, a bump around 110 Hz, little above 5 kHz; switch it off for your own
cabinet or reverb. The non-linear stages run at four times the sample rate,
and a soft limiter guards the output. It is our own model of behaviour and
topology, not a component-level simulation.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): about **52.7 % CPU per instance** (one note, default settings), measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

Patches to play (open them in the editor from their page): [SID piano (AT vibrato + comp + studio buizen)](https://musicbrain.nl/patches/sid-piano-at-vibrato-comp-studio-buizen).

In the editor's example set: *🔥 String + TUBE (buizenversterker)*, *🔥 String + Tube*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Tone stacks and amp behaviour modelled on Fender, Marshall and Vox
  amplifiers; no circuit simulation and no third-party code.
- The output limiter uses first-order antiderivative anti-aliasing (ADAA),
  our own implementation after J. D. Parker, V. Zavalishin, E. Le Bihan,
  "Reducing the Aliasing of Nonlinear Waveshaping Using Continuous-Time
  Convolution", Proc. DAFx-16, Brno, 2016, and S. Bilbao, F. Esqueda,
  J. D. Parker, V. Välimäki, "Antiderivative Antialiasing for Memoryless
  Nonlinearities", IEEE Signal Processing Letters 24(7), 2017.
- Own kernel `mmb_dsp/tube.h` (with `oversample.h`, `adaa.h` and
  `biquad.h`), MIT licence.

## Versions

- **0.5.107**: works on the Teensy again. ADAA removed from the triode and
  power stages (too costly for little gain), and with only In L patched it
  computes one channel: about 26 % CPU per instance.
- **0.5.102**: ADAA on the triode and power stages and a soft output
  limiter, for less aliasing; clearly cleaner in Studio mode.
- **0.5.95**: first numbered firmware with the module (built 2 October 2026).
