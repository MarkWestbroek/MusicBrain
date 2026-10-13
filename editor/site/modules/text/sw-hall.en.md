## Overview

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
