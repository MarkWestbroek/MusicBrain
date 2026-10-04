import { describe, expect, it } from 'vitest';

import { midiInCcNumbers } from './midiInCc';
import { seedInternals } from '../seedModules';
import { seedEPianoPolyPatch } from '../seedShowcase';
import { emptyModularProject } from '../types';

describe('midiInCcNumbers', () => {
  it('leest CC1# en CC2# van de MIDI-IN in de patch; E-piano heeft CC2# = 64 (sustain)', () => {
    const p = seedEPianoPolyPatch(seedInternals(emptyModularProject()));
    const patch = p.patches.find((x) => x.id === p.activePatchId)!;
    expect(midiInCcNumbers(patch, p)).toEqual({ cc1: 74, cc2: 64 });
  });
  it('valt zonder patch of MIDI-IN terug op 74 en 71', () => {
    expect(midiInCcNumbers(undefined, emptyModularProject())).toEqual({ cc1: 74, cc2: 71 });
  });
});
