import { describe, it, expect } from 'vitest';
import { notesOf, rebuildSmf, moveNotes, resizeNotes, deleteNotes, setVelocity, quantize, snapTime, drawController } from './noteEdit';
import type { ParsedSmf } from './smf';

const f: ParsedSmf = {
  tracks: 1, bpm: 120, beatsPerBar: 4, durationMs: 2000,
  events: [
    { t: 0, bytes: [0xB0, 1, 64] },
    { t: 10, bytes: [0x90, 60, 100] }, { t: 480, bytes: [0x80, 60, 0] },
    { t: 520, bytes: [0x91, 64, 80] }, { t: 990, bytes: [0x91, 64, 0] },
    { t: 1000, bytes: [0xE0, 0, 64] },
  ],
};
const g = { beatMs: 500, offsetMs: 0, div: 1 };

describe('noteEdit', () => {
  it('notesOf en rebuildSmf heen en terug; controllers blijven', () => {
    const n = notesOf(f);
    expect(n).toEqual([{ note: 60, start: 10, end: 480, vel: 100, ch: 0 }, { note: 64, start: 520, end: 990, vel: 80, ch: 1 }]);
    const back = rebuildSmf(f, n);
    expect(notesOf(back)).toEqual(n);
    expect(back.events.filter((e) => (e.bytes[0]! & 0xF0) === 0xB0 || (e.bytes[0]! & 0xF0) === 0xE0)).toHaveLength(2);
  });
  it('verplaatsen (niet vóór 0), rekken, weghalen, velocity', () => {
    const n = notesOf(f);
    expect(moveNotes(n, [0], -100, 2)[0]).toMatchObject({ start: 0, end: 470, note: 62 });
    expect(resizeNotes(n, [1], -1000)[1]!.end).toBe(530);
    expect(deleteNotes(n, [0])).toHaveLength(1);
    expect(setVelocity(n, [0, 1], 200).map((x) => x.vel)).toEqual([127, 127]);
  });
  it('kwantiseren met sterkte; herhaalde noot op hetzelfde moment klinkt opnieuw', () => {
    const n = notesOf(f);
    expect(snapTime(260, g)).toBe(500);
    const q = quantize(n, [0, 1], g, 1);
    expect(q.map((x) => x.start)).toEqual([0, 500]);
    expect(q[1]!.end).toBe(970);
    expect(quantize(n, [1], g, 0.5)[1]!.start).toBe(510);
    const same = rebuildSmf(f, [{ note: 60, start: 0, end: 500, vel: 90, ch: 0 }, { note: 60, start: 500, end: 900, vel: 90, ch: 0 }]);
    const at500 = same.events.filter((e) => e.t === 500).map((e) => e.bytes[0]! & 0xF0);
    expect(at500).toEqual([0x80, 0x90]);
  });
  it('controllerlijn tekenen vervangt die soort in het bereik', () => {
    const d = drawController(f, { type: 'cc', cc: 1 }, [{ t: 0, v: 0 }, { t: 100, v: 0.5 }, { t: 150, v: 0.5 }, { t: 200, v: 1 }]);
    const cc1 = d.events.filter((e) => e.bytes[0] === 0xB0 && e.bytes[1] === 1).map((e) => [e.t, e.bytes[2]]);
    expect(cc1).toEqual([[0, 0], [100, 64], [200, 127]]);           // dubbele waarde overgeslagen, oude 64 op t=0 weg
    const b = drawController(f, { type: 'bend' }, [{ t: 900, v: 1 }, { t: 1100, v: 0.5 }]);
    expect(b.events.filter((e) => (e.bytes[0]! & 0xF0) === 0xE0).map((e) => e.t)).toEqual([900, 1100]);
  });
});
