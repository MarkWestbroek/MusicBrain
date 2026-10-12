# Output

## Overview

The output: whatever arrives here is what you hear.

Every patch ends here. OUT has a left and a right input and one Level knob
that sets the final volume of both channels together. Patch a stereo pair
into L and R; a mono source on only one input plays on that side only, so
use a mixer or patch the same signal into both inputs if you want it in the
middle.

On the Brain the signal goes out over USB audio to the computer. In the
browser it goes to your speakers.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Level | 0 … 1 | 0.8 | The final volume. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| L | in | audio | Left channel of the output; a source here alone plays on the left only. |
| R | in | audio | Right channel of the output. |

## How it works

There is one audio output in the system, and every OUT module in a patch
feeds the same left/right gain pair in front of it. Level is that gain
(0 … 1). After the gain a peak meter measures the loudest sample on either
channel; the editor reads it from the Brain to show the output level.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): about **0.1 % CPU per instance** (one note, default settings), measured on firmware 0.5.108.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

Patches to play (open them in the editor from their page): [6-stemmig ladder-filter](https://musicbrain.nl/patches/6-stemmig-ladder-filter), [Acid jam](https://musicbrain.nl/patches/acid-jam), [SID piano (AT vibrato + comp + studio buizen)](https://musicbrain.nl/patches/sid-piano-at-vibrato-comp-studio-buizen), [Aged and a bit tired Mellotron](https://musicbrain.nl/patches/aged-and-a-bit-tired-mellotron), [CR-78-groove (Grids, zelfspelend)](https://musicbrain.nl/patches/cr-78-groove-grids-zelfspelend), [MS-20-ed Hammond w/ Tape Delay & Lesley](https://musicbrain.nl/patches/ms-20-ed-hammond-w-tape-delay-lesley), [CMI + REVERB (golvend)](https://musicbrain.nl/patches/cmi-reverb-golvend), [Synthex ×8 (dramatic)](https://musicbrain.nl/patches/synthex-8-dramatic).

In the editor's example set: *1-stemmig (mono)*, *2-stemmig*, *4-stemmig*, *8-stemmig*, *16-stemmig*, *4-stemmig + aftertouch → filter*, *🎺 CS-80 brass (aftertouch)*, *🎹 Axel F-lead (2 saws)*, *🎐 Ondes ×4 (Martenot-ensemble)*, *🕹️ SID ×3 (C64)*, *🕹️ SID ×6 (2 chips, stereo)*, *🕹️ SID ×9 (3 chips, stereo)*, *🕹️ SID ×12 (4 chips, stereo)*, *🕹️ SID 3-osc lead (mono)*, *🕹️ SID 3-osc ×4 (poly)*, *🎹 DX7 poly ×8*, *🎧 Sampler ×8 (cellen)*, *📼 Tape strip ×8 (Mellotron)*, *🎹 Organ ×12 (tonewheel + Rotary)*, *🎹 E-piano ×12 (tine / reed)*, *🎛️ Synthex ×8 (Elka)*, *🎤 Zingende stem ×8*, *FOF Stem (mono)*, *🎧 Sampler ×8 auto-wah*, *🎧 Sampler ×8 auto-wah + FET*, *🎧 Sampler ×8 + EQ + Vari-mu*, *🎚 Mixtur (Trautonium)*, *🎚 Mixtur + Plate reverb*, *🖥 CMI (Fairlight-stem)*, *🌊 Martenot + Palme*, *🌊 Martenot + Métallique*, *🧪 Acid (303-stijl bas)*, *〽️ Fluit + FOLDER (West Coast)*, *🎻 Strijker + ENSEMBLE (string machine)*, *🦆 String + WAH (touch-wah)*, *🎸 String + DRIVE (overdrive/fuzz)*, *🔥 String + TUBE (buizenversterker)*, *🔔 Rings + FREQ SHIFT*, *〰️ Scanned (levende golftabel)*, *🎲 GENDYN (stochastisch)*, *🫧 Excitable (prikkelbaar medium)*, *Material Bridge (materiaalgeheugen)*, *💍 Rings (resonator)*, *🎛️ Plaits (24 engines)*, *💎 Elements (modaal)*, *🎻 STK (9 instrumenten)*, *🎹 DX7 (6-op FM)*, *🎚️ DX7 + FET comp*, *🎚️ Rings + Opto comp*, *🎚️ Plaits + VCA-bus*, *🎚️ Elements + Vari-mu*, *🎚️ STK + Program EQ*, *🎚️ DX7 + Diode comp*, *🎚️ Rings + Console EQ*, *🎚️ Plaits + Para EQ*, *🔁 Plaits + Stereo tape*, *🔁 DX7 + Digital echo*, *🌊 DX7 + BBD chorus*, *💍 Rings + Ring mod*, *🎸 STK + Octaver*, *🎶 Plaits + Harmonizer*, *🏛️ Rings + Plate reverb*, *🪃 STK + Spring reverb*, *〰️ DX7 + Tremolo*, *💡 DX7 + Vibe*, *🌪️ DX7 + Rotary*, *✨ Rings + Shimmer*, *🌀 Plaits + Stereo phaser*, *☁️ Clouds ambient (+Tides)*, *🎲 Generative jam (Marbles)*, *Material Bridge demo (frase)*, *Reservoir demo (gedeelde bron)*, *🧪 Acid jam (Clock + Euclid + Chaos)*, *🌊 West Coast (Turing + Folder + LPG)*, *🌀 Rungler (Benjolin-stijl chaos)*, *🎛️ Buchla-stem (Complex + LPG)*, *🎚️ SEM sweep (LP → notch → HP)*, *🥁 Ritmebox (CR-78-presets)*, *🗣️ Warps vocoder*, *🎶 Koor zingt woorden (vocoder)*, *🎤 Koor zingt jouw stem (vocoder + mic)*, *🎶 Koor zingt jouw woorden (vocoder + ZANG)*, *🥁 808 jam (Peaks)*, *🌌 Krell (zelfspelend)*, *🎹 E-piano ×12*, *🪗 Organ ×12*, *🎼 DX7 ×8*, *🎞 Mellotron flute ×8*, *🎻 Mellotron strings ×8*, *🎺 CS-80 brass ×4*, *🎛 Synthex ×8*, *🎸 Axel F lead*, *👾 SID ×3*, *🔥 String + Tube*, *🧪 Buchla voice*, *🎚 Mixtur + Plate*, *🎐 Ondes Martenot*, *🖥 Fairlight CMI*, *🎐 Ondes ×4*, *🔁 Arp + String echo*, *🥁 Rhythm box (CR-78)*, *🧬 Acid jam*, *🌊 West Coast*, *🌌 Krell*, *🎲 Generative jam*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- The gain stages, the peak meter and the USB output are the
  `AudioAmplifier`, `AudioAnalyzePeak` and `AudioOutputUSB` objects of the
  Teensy Audio Library by PJRC (MIT licence).
- The MusicBrain module code is MIT licensed.

## Versions

- **0.5.33**: Level really sets the output volume (a shared master gain) and
  the output peak is reported to the editor.
- **First version** (May 2026): left and right inputs straight to the USB
  audio output.
