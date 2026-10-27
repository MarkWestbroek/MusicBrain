// mmb_set_rate (mmb_abi.h): een module met MMB_RATE_FLEX rekent op de rate
// die de gastheer vóór mmb_init vraagt; de rest blijft op MMB_NATIVE_RATE.
// Voor de plugin op 96 kHz (doc/plans/plugin-patches.md §9); de browser
// roept het niet aan.

import { describe, expect, it } from 'vitest';

import { load, toneLevel } from './wasmTestHost';

/** Doorlaat van de LADDER (dB) bij `hz`, cutoff 1 kHz, Q 0. */
async function ladderGain(rate: number | undefined, hz: number): Promise<number> {
  const m = await load('tp_mmb_ladder', { rate });
  m.setCtl('cutoff', 1000); m.setCtl('q', 0);
  let n = 0;
  const out = m.render(0.5, (_t, mm) => {
    const b = mm.inBuf('in');
    for (let k = 0; k < mm.block; ++k, ++n) b[k] = 0.25 * Math.sin(2 * Math.PI * hz * n / mm.rate);
  }).out!;
  const from = Math.round(0.2 * m.rate);
  return 20 * Math.log10(toneLevel(out, hz, m.rate, from) / 0.25);
}

describe('mmb_set_rate', () => {
  it('LADDER (flex) rekent op 96 kHz met dezelfde cutoff', async () => {
    const m = await load('tp_mmb_ladder', { rate: 96000 });
    expect(m.rate).toBe(96000);
    for (const hz of [300, 1000, 3000]) {
      const at44 = await ladderGain(undefined, hz), at96 = await ladderGain(96000, hz);
      expect(Math.abs(at96 - at44), `${hz} Hz: ${at44.toFixed(1)} vs ${at96.toFixed(1)} dB`).toBeLessThan(1);
    }
    expect(await ladderGain(96000, 3000)).toBeLessThan(await ladderGain(96000, 300) - 20);   // filtert echt
  });

  it('zonder MMB_RATE_FLEX blijft de module op haar eigen rate', async () => {
    const m = await load('tp_mmb_lpg', { rate: 96000 });
    expect(m.rate).toBe(44100);
    expect(m.ex.mmb_set_rate(48000)).toBe(44100);
  });

  it('na mmb_init telt een nieuwe vraag niet meer; zonder vraag de standaard', async () => {
    const m = await load('tp_mmb_ladder');
    expect(m.rate).toBe(44100);
    expect(m.ex.mmb_set_rate(96000)).toBe(44100);
  });
});
