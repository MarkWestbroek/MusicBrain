// tp_mmb_vca (fw 0.5.108, FW-MOD-1): Gain is het basisniveau, de CV telt erbij
// op, Resp kiest lineair of exponentieel (48 dB). Bij gain 0 en Lin precies
// het oude gedrag: dicht zonder CV, de CV zet het niveau.

import { describe, expect, it } from 'vitest';

import { expectMatchesCatalog, load } from './wasmTestHost';

/** Uitgangsniveau voor een constante 0,5 op In, na het wegglijden van de slew. */
async function level(ctl: { gain?: number; resp?: number }, cv?: number): Promise<number> {
  const m = await load('tp_mmb_vca');
  m.setCtl('gain', ctl.gain ?? 0);
  m.setCtl('resp', ctl.resp ?? 0);
  m.setIn('in', 0.5);
  if (cv === undefined) m.setIn('cv', 0, false); else m.setIn('cv', cv);
  const out = m.render(0.05).out!;
  return out[out.length - 1]! / 0.5;
}

describe('tp_mmb_vca', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_vca'); });

  it('gain 0 zonder CV: dicht; met een envelope op CV: de CV zet het niveau', async () => {
    expect(await level({})).toBeCloseTo(0, 3);
    expect(await level({}, 0.6)).toBeCloseTo(0.6, 2);
  });

  it('Gain opent zonder CV, en de CV telt erbij op tot 1', async () => {
    expect(await level({ gain: 0.4 })).toBeCloseTo(0.4, 2);
    expect(await level({ gain: 0.4 }, 0.3)).toBeCloseTo(0.7, 2);
    expect(await level({ gain: 0.8 }, 0.8)).toBeCloseTo(1, 2);
    expect(await level({ gain: 0.5 }, -0.8)).toBeCloseTo(0, 3);
  });

  it('Exp: 1 blijft 1, halverwege ongeveer −24 dB, 0 blijft dicht', async () => {
    expect(await level({ gain: 1, resp: 1 })).toBeCloseTo(1, 2);
    const half = await level({ gain: 0.5, resp: 1 });
    expect(20 * Math.log10(half)).toBeGreaterThan(-26);
    expect(20 * Math.log10(half)).toBeLessThan(-22);
    expect(await level({ resp: 1 }, 0)).toBeCloseTo(0, 3);
  });
});
