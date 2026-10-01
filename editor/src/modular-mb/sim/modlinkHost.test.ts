import { describe, it, expect } from 'vitest';
import { midiFor, slotAxisOf, labelsFor, defaultMap, targetLabel, axisName, ccBaseForSlot, freeCc } from './modlinkHost';

describe('modlink-host', () => {
  it('nummering zoals het doorgeefluik', () => {
    expect(ccBaseForSlot(1)).toBe(40);
    expect(ccBaseForSlot(2)).toBe(46);
    expect(slotAxisOf(41)).toEqual({ slot: 1, axis: 1 });
    expect(slotAxisOf(46)).toEqual({ slot: 2, axis: 0 });
    expect(slotAxisOf(10)).toBeNull();
    expect(axisName(3)).toBe('schuif 4 · punt 2 Y');
  });
  it('as → MIDI, met terugveren bij loslaten', () => {
    const m = defaultMap();
    expect(midiFor(m[1]!, 0.5)).toEqual({ kind: 'at', value: 64 });
    expect(midiFor(m[1]!, 0.9, true)).toEqual({ kind: 'at', value: 0 });          // aftertouch veert terug
    expect(midiFor(m[2]!, 1)).toEqual({ kind: 'bend', value: 16383 });
    expect(midiFor(m[2]!, 0.2, true)).toEqual({ kind: 'bend', value: 8192 });     // bend terug naar midden
    expect(midiFor(m[0]!, 0.25)).toEqual({ kind: 'cc', cc: 74, value: 32 });
    expect(midiFor(m[0]!, 0.25, true)).toBeNull();                                 // cutoff blijft staan
    expect(midiFor({ target: { kind: 'none' }, spring: false }, 1)).toBeNull();
  });
  it('nieuwe CC-keuze krijgt een vrij nummer', () => {
    const m = defaultMap();
    expect(freeCc(m, 1)).toBe(20);
    const m2 = [...m]; m2[2] = { target: { kind: 'cc', cc: 20 }, spring: false };
    expect(freeCc(m2, 1)).toBe(21);
    expect(freeCc(m2, 2)).toBe(20);                 // eigen nummer telt niet mee
  });
  it('labels voor de telefoons', () => {
    const l = labelsFor([1, 2], () => defaultMap());
    expect(l).toHaveLength(12);
    expect(l[0]).toEqual({ cc: 40, label: 'Cutoff (CC 74)' });
    expect(l[1]).toEqual({ cc: 41, label: 'Aftertouch ↺' });
    expect(l[6]!.cc).toBe(46);
    expect(targetLabel({ kind: 'cc', cc: 20 })).toBe('CC 20');
  });
});
