// Aanslagcurve op MIDI-IN (`velcurve`, fw 0.5.118): hoe de velocity van het
// keyboard op `vel` en `velK` komt. Normaal (default) is lineair zoals
// altijd; Zacht en Hard buigen de curve, Vast negeert de aanslag.

import { describe, expect, it } from 'vitest';

import { load } from './wasmTestHost';

async function velFor(curve: number | undefined, midiVel: number) {
  const m = await load('tp_mmb_midiin');
  m.setCtl('voiceCount', 2);
  if (curve !== undefined) m.setCtl('velcurve', curve);
  m.ex.mmb_midi(0x90, 60, midiVel);
  const o = m.render(0.01);
  return { vel: o.vel!.at(-1)!, vel1: o.vel1!.at(-1)! };
}

describe('tp_mmb_midiin: aanslagcurve', () => {
  it('Normaal (ook zonder knop) is lineair: vel/127', async () => {
    for (const v of [20, 64, 127]) {
      expect((await velFor(undefined, v)).vel).toBeCloseTo(v / 127, 5);
      expect((await velFor(1, v)).vel1).toBeCloseTo(v / 127, 5);
    }
  });

  it('Zacht ligt boven lineair, Hard eronder; de uitersten blijven 1', async () => {
    const x = 50 / 127;
    expect((await velFor(0, 50)).vel).toBeCloseTo(x ** 0.6, 4);
    expect((await velFor(2, 50)).vel).toBeCloseTo(x ** 1.7, 4);
    expect((await velFor(0, 50)).vel).toBeGreaterThan(x);
    expect((await velFor(2, 50)).vel).toBeLessThan(x);
    for (const c of [0, 1, 2]) expect((await velFor(c, 127)).vel1).toBeCloseTo(1, 5);
  });

  it('Vast geeft altijd 0,8, op vel en op velK', async () => {
    for (const v of [10, 64, 127]) {
      const r = await velFor(3, v);
      expect(r.vel).toBeCloseTo(0.8, 5);
      expect(r.vel1).toBeCloseTo(0.8, 5);
    }
  });
});
