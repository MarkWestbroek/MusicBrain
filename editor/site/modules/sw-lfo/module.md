# LFO

## Overview

A slow oscillator for movement (vibrato, wah, sweep).

A low-frequency oscillator with five waves: sine, triangle, saw, square and
sample & hold (a new random value each cycle). Use it for vibrato on a
pitch, a slow filter sweep, tremolo on a VCA or a random wobble.

Bip on gives a signal around zero (−Depth … +Depth), right for pitch and
filter. Bip off gives 0 … Depth, right for a VCA or anything that should
only go up. Inv is the same signal upside down, so one VCA can rise while
another falls. A pulse on Rst starts the cycle again, to keep several LFOs
in step.

Run chooses when it moves: Always runs freely, Gated only while the Gate
input is high, OneShot runs one cycle on each rising edge at Gate and then
stops — a simple extra envelope.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Rate | 0.01 … 50 Hz | 1 | How fast. |
| Wave | Sin / Tri / Saw / Sqr / S&H | Sin | Sine, triangle, saw, square, or sample & hold (a random value per cycle). |
| Depth | 0 … 1 | 1 | How deep. |
| Bip | off / on | on | On: −Depth … +Depth. Off: 0 … Depth. |
| Run | Always / Gated / OneShot | Always | Always runs freely; Gated runs only while Gate is high; OneShot runs one cycle per rising edge on Gate. |
| Rate CV | -1 … 1 | 1 | How much the Rate input changes the speed; at 1, ±1 CV is ±4 octaves; below 0 inverted. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| Rate | in | cv | Speed modulation, exponential: +1 is four octaves faster at Rate CV 1. |
| Gate | in | gate | Gate for the Gated and OneShot run modes. |
| Rst | in | trigger | A rising edge restarts the cycle. |
| Out | out | cv | The LFO signal. |
| Inv | out | cv | The same signal upside down. |

## How it works

The LFO runs at the control rate of 1 kHz. Rate is set in hertz (0.01 …
50 Hz on the knob). The Rate input bends the speed exponentially: with the
Rate CV knob at 1, +1 on the input makes the LFO 16 times faster (four
octaves) and −1 16 times slower; 0 ignores the input and negative values
turn it round.

The sample & hold value comes from a small pseudo-random generator and
changes once per cycle.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): less than **0.1 % CPU** per instance, measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

Patches to play (open them in the editor from their page): [6-stemmig ladder-filter](https://musicbrain.nl/patches/6-stemmig-ladder-filter), [SID piano (AT vibrato + comp + studio buizen)](https://musicbrain.nl/patches/sid-piano-at-vibrato-comp-studio-buizen).

In the editor's example set: *1-stemmig (mono)*, *2-stemmig*, *4-stemmig*, *8-stemmig*, *16-stemmig*, *4-stemmig + aftertouch → filter*, *🎺 CS-80 brass (aftertouch)*, *🎹 Axel F-lead (2 saws)*, *🕹️ SID ×3 (C64)*, *🕹️ SID ×6 (2 chips, stereo)*, *🕹️ SID ×9 (3 chips, stereo)*, *🕹️ SID ×12 (4 chips, stereo)*, *🎧 Sampler ×8 (cellen)*, *🎧 Sampler ×8 auto-wah*, *🎧 Sampler ×8 auto-wah + FET*, *🎧 Sampler ×8 + EQ + Vari-mu*, *🎺 CS-80 brass ×4*, *🎸 Axel F lead*, *👾 SID ×3*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Our own code, MIT licence.

## Versions

- **0.5.109**: Gate input on the panel, so Gated and OneShot work (before,
  those modes waited for an input that was not there).
- **0.5.82**: attenuverter on the Rate input (Rate CV, −1 … +1).
- **First version** (May 2026): five waves, depth, bipolar or unipolar,
  rate CV, reset and an inverted output.
