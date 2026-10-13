# Hall reverb

## Overview

Large reverb: a hall, room or church with a long, living tail.

HALL is the large reverb: a concert hall, a room, a chamber or a church, with
a long, smooth tail that keeps moving and does not turn metallic. It sits next
to REVERB (plate and spring) as a separate module because it is heavier, so
you choose it when you want the big space.

Algo picks the kind of space. Hall builds up slowly and fills a large room.
Room is small, with strong early reflections. Chamber is dense with little
movement. Random is Hall with a wandering, irregular modulation in the tail,
the movement the Lexicon 480L is known for.

Decay is the real reverb time in seconds (RT60, 0.2 to 30 s). Lo × makes the
bass ring longer (above 1) or shorter (below 1) than the rest, and Hi damp
makes the treble die away sooner. Size sets the size of the room and glides
without clicks. Pre delays the start of the reverb by up to 250 ms, Early sets
the level of the first reflections off the walls, Diff how quickly the reverb
becomes a dense cloud, Mod how much the tail moves, and Width the stereo
width. Freeze, on the button or the gate input, holds the tail forever and
closes the input, so you can play over a frozen chord. The CV inputs for
Size, Decay and Mix add to their knobs. Without a cable in R the right side
gets the same input as the left.

## Controls

| Control | Range | Default | What it does |
|---|---|---|---|
| Algo | Hall / Room / Chamber / Random | Hall | Kind of space: Hall, Room, Chamber or Random (the wandering 480L motion). |
| Size | 0 … 1 | 0.6 | How big the space is. |
| Decay | 0.2 … 30 s | 2.5 | The reverb time in seconds. |
| Pre | 0 … 250 ms | 20 | Delay before the reverb starts. |
| Early | 0 … 1 | 0.5 | The first reflections off the walls. |
| Diff | 0 … 1 | 0.85 | How quickly the reverb turns into a dense cloud. |
| Mod | 0 … 1 | 0.4 | Movement in the tail; removes the metallic ring. |
| Hi damp | 0 … 1 | 0.4 | How quickly the highs die away. |
| Lo × | 0.25 … 4 | 1.2 | Bass reverb time as a multiple of Decay: above 1 the bass rings longer, below 1 shorter. |
| Width | 0 … 1 | 1 | Stereo width of the reverb. |
| Freeze | off / on | off | Holds the tail forever and closes the input. |
| Mix | 0 … 1 | 0.3 | How much reverb is mixed with the dry sound. |

## Ports

| Port | Direction | Signal | What it carries |
|---|---|---|---|
| S+ | in | cv | CV for Size, added to the knob. |
| D+ | in | cv | CV for Decay: +1 makes the reverb time 16 times longer, −1 16 times shorter. |
| M+ | in | cv | CV for Mix, added to the knob. |
| Frz | in | gate | Gate: holds the tail while high. |
| L | in | audio | Audio in (left, or mono). |
| R | in | audio | Audio in, right. |
| L | out | audio | Left output. |
| R | out | audio | Right output. |

## How it works

HALL is our own code, built from published techniques. The input first goes
through a pre-delay, from which eight taps per side make the early
reflections; their pattern scales with Size and differs left and right. Four
all-pass filters in series then spread the input into a dense cloud
(Schroeder). The tail itself is a feedback delay network of eight delay lines
with a Householder mixing matrix (Jot and Chaigne). Each line has a damping
filter in three bands, below 300 Hz, in the middle and above 3 kHz, with a
gain per pass worked out from the reverb time you set, so Decay, Lo × and
Hi damp are reverb times rather than vague amounts. The length of each line
moves slowly, with its own sine and, in Random, a random drift, which keeps
the resonances of the network from ringing. Left and right are taken from
different lines.

Measured in the simulator: the reverb time per band matches the knobs within
25 % for all four algorithms, the tail above 1 kHz is flat within 4 dB, it is
dense after about 100 ms, left and right are uncorrelated, and Freeze holds
steady. Below 1 kHz small rooms colour the sound more, the room modes of a
real small room.

On the Brain HALL takes about 180 KB of working memory. That is a lot next to
other large effects: HALL and REVERB together in one patch do not fit.

## Runs on

- **Teensy 4.1** (the MusicBrain Brain): about **14.4 % CPU per instance** (one note, default settings), measured on firmware 0.5.113.
- **The browser**: the editor's simulator runs the same C++ code as WebAssembly, so what you hear while patching is what the Brain plays.

## Try it

In the editor's example set: *🏛️ STK + HALL*.

Editor: <https://editor.musicbrain.nl>

## Sources & licences

- Own code, MIT licence (`mmb_dsp/hall.h`), shared by the Brain and the
  browser simulator. No Lexicon or Bricasti algorithms are copied; theirs are
  not published.
- Techniques: M. R. Schroeder, "Natural Sounding Artificial Reverberation"
  (1962); J. A. Moorer, "About This Reverberation Business" (1979);
  J.-M. Jot and A. Chaigne, "Digital Delay Networks for Designing Artificial
  Reverberators" (1991); J. Dattorro, "Effect Design, Part 1" (1997).

## Versions

- **0.5.113** (14 October 2026): first version, with all four algorithms and
  Freeze, in the browser and on the Brain.
