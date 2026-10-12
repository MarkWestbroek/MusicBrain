// tp_mmb_beads — Mutable Instruments Beads (doc/plans/beads.md): de drie
// manieren van spelen. Korrels uit de ingang (alle vier de media), de
// delaystand (Size helemaal open; Time = delaytijd, Density = ritme), en zonder ingang de
// wavetable-klankbron. SEED Lock (standaard aan) laat de korrels vanzelf komen.

import { describe, expect, it } from 'vitest';

import { type Mod, expectMatchesCatalog, load, peak, rms } from './wasmTestHost';

const sine = (t: number, m: Mod): void => {
  const b = m.inBuf('in_l');
  for (let k = 0; k < m.block; k++) b[k] = 0.5 * Math.sin(2 * Math.PI * 220 * (t + k / m.rate));
};

describe('tp_mmb_beads', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_beads'); });

  it('zonder ingang: de wavetable-klankbron klinkt, binnen de perken', async () => {
    const m = await load('tp_mmb_beads');
    m.setCtl('density', 0.7);
    const o = m.render(2).out_l!;
    expect(rms(o)).toBeGreaterThan(0.02);
    expect(peak(o)).toBeLessThanOrEqual(1);
  });

  it('korrels uit de ingang, in alle vier de media', async () => {
    for (const q of [0, 1, 2, 3]) {
      const m = await load('tp_mmb_beads');
      m.setCtl('quality', q); m.setCtl('density', 0.7); m.setCtl('time', 0.05); m.setCtl('mix', 1);
      const o = m.render(2, sine).out_l!;
      let finite = true;
      for (const v of o) if (!Number.isFinite(v)) finite = false;
      expect(finite, `quality ${q}`).toBe(true);
      expect(rms(o, 44100), `quality ${q}`).toBeGreaterThan(0.01);
    }
  });

  it('SEED Lock uit en geen knop: geen korrels, alleen stilte bij Mix 1', async () => {
    const m = await load('tp_mmb_beads');
    m.setCtl('seed_lock', 0); m.setCtl('density', 0.7); m.setCtl('time', 0.05); m.setCtl('mix', 1); m.setCtl('reverb', 0);
    expect(rms(m.render(2, sine).out_l!, 44100)).toBeLessThan(1e-3);
  });

  it('delaystand: een tik komt terug', async () => {
    const m = await load('tp_mmb_beads');
    m.setCtl('size', 1); m.setCtl('time', 0.05); m.setCtl('mix', 1); m.setCtl('feedback', 0.5); m.setCtl('density', 0.8);
    const o = m.render(3, (t, mm) => {
      const b = mm.inBuf('in_l');
      b.fill(0);
      if (t >= 1.0 && t < 1.0 + 32 / 44100) b.fill(0.8);
    }).out_l!;
    expect(peak(o, Math.round(1.1 * 44100), Math.round(2.5 * 44100))).toBeGreaterThan(0.01);
  });
});
