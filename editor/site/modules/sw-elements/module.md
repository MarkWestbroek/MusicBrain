# Elements modal voice

## Overview

Modal synthesis as on Mutable Elements: an exciter (bow, blow, strike) sets a resonator ringing.

Elements is a complete voice in one module: an **exciter** sets a
**resonator** ringing. The exciter can bow, blow and strike at the same time
(three level knobs, freely mixed), each with its own character: Flow shapes
the breath from a soft breeze to turbulence, Mallet goes from a soft hammer
to a hard stick, and three Timbre knobs set how bright each one is. Contour
shapes the excitation from short and percussive to a slow swell.

The resonator decides what is struck: Geometry moves from a string via plates
and tubes to bells, Brightness and Damping set how it rings and dies away,
Position where it is played, and Space adds stereo width and reverb. Play it
from a keyboard with V/Oct and Gate; velocity on Strength makes every note as
loud and bright as you hit it. PLAY strikes without a gate. Each Ext In takes
your own sound as the breath or the strike.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Contour | 0 … 1 | 1 | Contour: the shape of the excitation, from short and percussive to a long swell. |
| Bow | 0 … 1 | 0 | How much bow: a sustained, scratchy excitation. |
| Blow | 0 … 1 | 0 | How much breath: air and noise through the resonator. |
| Strike | 0 … 1 | 0.8 | How much strike: a tap or a hit. |
| Play |  |  | Strikes the voice without a gate (held = gate high). |
| Flow | 0 … 1 | 0.5 | Flow: the character of the breath, from a soft breeze to turbulent. |
| Mallet | 0 … 1 | 0.5 | Mallet: what you strike with, from a soft mallet to a hard stick and sampled clicks. |
| Bow Timbre | 0 … 1 | 0.5 | Tone of the bow: dark to bright. |
| Blow Timbre | 0 … 1 | 0.5 | Tone of the breath: dark to bright. |
| Strike Timbre | 0 … 1 | 0.5 | Tone of the strike: dull to bright. |
| Coarse | -36 … 36 semi | 0 | Tuning in semitones, on top of V/Oct. |
| Fine | -100 … 100 ct | 0 | Fine tuning in cents. |
| FM | 0 … 1 | 0.5 | Attenuverter of the FM input: middle = off; fully open, one unit of CV is one octave. |
| Geometry | 0 … 1 | 0.2 | Shape of the resonator: from string via plate and tube to bell. |
| Brightness | 0 … 1 | 0.5 | How many high overtones the resonator lets ring. |
| Damping | 0 … 1 | 0.25 | How quickly the sound dies away. |
| Position | 0 … 1 | 0.3 | Where you strike or bow: the middle sounds hollower. |
| Space | 0 … 1 | 0.5 | Stereo width and reverb. |
| Bow Timbre CV | -1 … 1 | 0 | Attenuverter for the Bow Timbre CV input: middle = off, left inverts. |
| Flow CV | -1 … 1 | 0 | Attenuverter for the Flow CV input: middle = off, left inverts. |
| Blow Timbre CV | -1 … 1 | 0 | Attenuverter for the Blow Timbre CV input: middle = off, left inverts. |
| Mallet CV | -1 … 1 | 0 | Attenuverter for the Mallet CV input: middle = off, left inverts. |
| Strike Timbre CV | -1 … 1 | 0 | Attenuverter for the Strike Timbre CV input: middle = off, left inverts. |
| Damping CV | -1 … 1 | 0 | Attenuverter for the Damping CV input: middle = off, left inverts. |
| Geometry CV | -1 … 1 | 0 | Attenuverter for the Geometry CV input: middle = off, left inverts. |
| Position CV | -1 … 1 | 0 | Attenuverter for the Position CV input: middle = off, left inverts. |
| Brightness CV | -1 … 1 | 0 | Attenuverter for the Brightness CV input: middle = off, left inverts. |
| Space CV | -1 … 1 | 0 | Attenuverter for the Space CV input: middle = off, left inverts. |
| Signat | 0 … 1 | 0 | The exciter's 'signature' parameter, not on the original panel. |
| ModFrq | 0 … 1 | 0.5 | Speed of the internal resonator modulation. |
| ModOff | 0 … 1 | 0.1 | Depth of the internal resonator modulation. |
| Level | 0 … 1 | 0.8 | Output level. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| Timb | in | cv | CV for Bow Timbre, scaled by its attenuverter. |
| Flow | in | cv | CV for Flow, scaled by its attenuverter. |
| Timb | in | cv | CV for Blow Timbre, scaled by its attenuverter. |
| Mall | in | cv | CV for Mallet, scaled by its attenuverter. |
| Timb | in | cv | CV for Strike Timbre, scaled by its attenuverter. |
| Damp | in | cv | CV for Damping, scaled by its attenuverter. |
| Geom | in | cv | CV for Geometry, scaled by its attenuverter. |
| Pos | in | cv | CV for Position, scaled by its attenuverter. |
| Brgt | in | cv | CV for Brightness, scaled by its attenuverter. |
| Space | in | cv | CV for Space, scaled by its attenuverter. |
| V/Oct | in | cv | Pitch, 1 V per octave. |
| FM | in | cv | Frequency modulation, scaled by the FM knob. |
| Gate | in | gate | Starts and holds the excitation. |
| Strength | in | cv | How hard each note is played (velocity). |
| Ext In | in | audio | Your own sound as the breath (replaces the internal noise). |
| Ext In | in | audio | Your own sound as the strike. |
| Out L | out | audio | Left output. |
| Out R | out | audio | Right output. |

## How it works

The panel follows the original: exciter on the left, resonator on the right,
and the dotted lines that tie Contour to Bow and Blow, and Flow, Mallet,
Geometry and Brightness to their CV inputs. Below are ten CV inputs, each with
an attenuverter: the value is the knob plus attenuverter × CV, limited as on
the original (`BIND` in Émilie Gillet's `cv_scaler.cc`). FM is the
attenuverter of the FM input: in the middle it does nothing, fully open one
unit of CV moves the pitch by an octave.

Inside is the original modal synthesis code: a bank of resonant filters (or a
string model) driven by the exciter, then a reverb. It runs at 32 kHz and is
resampled to the Brain's 44.1 kHz. The browser simulator runs the same C++
code compiled to WebAssembly.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain).
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *💎 Elements (modaal)*, *🎚️ Elements + Vari-mu*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Based on Mutable Instruments Elements by Émilie Gillet, open source under
  the MIT licence (vendored in `firmware/lib/mi-elements`). This is a
  software port, not the Mutable Instruments hardware.
- The CV and attenuverter handling follows the original `cv_scaler.cc`
  (shared table in `mmb_dsp/elements_cv.h`). The MusicBrain wrapper is MIT
  licensed as well.

## Versions

- **0.5.111**: panel laid out like the original (34 HP), ten CV inputs with
  attenuverters, FM input, both Ext In inputs and the PLAY button on the
  panel; FM became the attenuverter of the FM input.
- **First version** (June 2026): a five-voice standalone Teensy build first,
  then Elements as a module in the Brain, with continuous Bow/Blow/Strike
  levels.
