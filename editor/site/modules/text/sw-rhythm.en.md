## Overview

A rhythm box with the preset rhythms of the Roland CR-78, played on the same
computed CR-78 sounds as the CR-78 module: bass drum, low conga, low and
high bongo, snare, rimshot, claves, cowbell, maracas, hi-hat and cymbal.
Pick a rhythm, press Run and play along.

There are 15 rhythms: Rock 1–4, Disco 1–2, Waltz, Shuffle, Slow rock, Swing,
Foxtrot, Tango, Boogie, Enka and Bossa nova, each with an A and a B bar.
Variation plays A, B, or A and B in turn. Four group levels (Bass, Snare,
Metal, Perc) and Accent let you shape the mix. A pulse on Start toggles
start/stop, like the original's foot switch; PADS works for that.

## How it works

Each rhythm is a table of steps per instrument for bar A and bar B, plus an
accent row: 16 steps per bar for straight rhythms, 12 for triplet feels and
the waltz. The internal clock runs at Tempo in beats per minute. With
ExtClk on it follows an external beat (for example CLOCK Beat): it measures
the time between beats and spreads the steps over it, so triplet rhythms
stay in time too. Rst goes back to the start of bar A.

The voices are panned slightly across the stereo field. Step, Bar and Acc
give a 10 ms pulse on every step, on beat one and on each accented step, to
sync a sequencer or an envelope.

The Tempo knob follows the patch tempo (♩ in the toolbar) unless ExtClk is
on.

The patterns were copied by hand from the notation in the CR-78 Service
Notes. Rock 4 and the two Disco patterns are uncertain. Samba, Mambo,
Cha-cha, Beguine and Rhumba are still missing because they cannot be read
reliably in the available scan; the fill-ins are missing too.

## Sources & licences

- Rhythm patterns: the "Rhythm Patterns" page of the Roland CR-78 Service
  Notes (20 June 1979).
- Sounds: our own model of the Roland CompuRhythm CR-78 (`mmb_dsp/cr78.h`),
  shared with the CR-78 module.
- Own kernel `mmb_dsp/rhythm_box.h`, shared by the Brain and the browser,
  MIT licence.

## Versions

- **0.5.95**: first version, 15 rhythms.
