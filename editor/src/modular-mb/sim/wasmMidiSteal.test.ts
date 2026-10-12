// FW-10 (opgelost in fw 0.5.112): een gestolen stem slaat opnieuw aan. Met
// het sustainpedaal liggen er meer noten vast dan er stemmen zijn; de
// MIDI-IN steelt dan een stem. Vroeger gingen gate uit en aan binnen één
// tik, dus de envelope zag geen nieuwe flank en de filter-wah bleef weg
// (Mark 2026-10-13). Nu blijft de gate van die stem twee tikken laag.

import { describe, expect, it } from 'vitest';

import { load } from './wasmTestHost';

describe('tp_mmb_midiin: steal geeft een nieuwe aanslag', () => {
  it('vier stemmen, vijfde noot: de gestolen stem gaat even laag en weer hoog', async () => {
    const m = await load('tp_mmb_midiin');
    m.setCtl('voiceCount', 4);
    for (const n of [60, 62, 64, 65]) { m.ex.mmb_midi(0x90, n, 100); m.render(0.01); }
    const before = m.render(0.01);
    const gates = [1, 2, 3, 4].map((k) => before[`gate${k}`]!.at(-1)!);
    expect(gates).toEqual([1, 1, 1, 1]);
    m.ex.mmb_midi(0x90, 67, 100);   // vijfde noot: steal
    const after = m.render(0.01);
    const dipped = [1, 2, 3, 4].filter((k) => after[`gate${k}`]!.slice(0, 5).some((v) => v < 0.5));
    expect(dipped.length).toBe(1);
    expect(after[`gate${dipped[0]}`]!.at(-1)!).toBe(1);
  });
});

describe('tp_mmb_midiin: mono zonder legato', () => {
  it('een nieuwe toets terwijl de vorige ligt slaat opnieuw aan; met legato niet', async () => {
    for (const legato of [0, 1]) {
      const m = await load('tp_mmb_midiin');
      m.setCtl('voiceCount', 1); m.setCtl('legato', legato);
      m.ex.mmb_midi(0x90, 60, 100); m.render(0.01);
      m.ex.mmb_midi(0x90, 64, 100);
      const g = m.render(0.01).gate!;
      const dipped = g.slice(0, 5).some((v) => v < 0.5);
      expect(dipped, `legato ${legato}`).toBe(legato === 0);
    }
  });
});
