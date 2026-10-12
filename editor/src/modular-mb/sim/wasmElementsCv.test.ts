// Elements: de CV-ingangen met attenuverters zoals het origineel (fw 0.5.111,
// mmb_dsp/elements_cv.h): knop + attenuverter × CV. Met de attenuverter in
// het midden doet de CV niets; open telt hij op. PLAY slaat aan zonder gate.

import { describe, expect, it } from 'vitest';

import { expectMatchesCatalog, load, rms } from './wasmTestHost';

/** Geluid na een aanslag met strike, voor een paar knoppen en ingangen. */
async function hit(ctl: Record<string, number>, ins: Record<string, number> = {}, gate = true): Promise<Float32Array> {
  const m = await load('tp_mmb_elements');
  for (const [k, v] of Object.entries(ctl)) m.setCtl(k, v);
  for (const [k, v] of Object.entries(ins)) m.setIn(k, v);
  m.setIn('voct', 0);
  m.setIn('gate', gate ? 1 : 0);
  return m.render(0.6).out_l!;
}
const diff = (a: Float32Array, b: Float32Array): number => {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i]! - b[i]!);
  return d / a.length;
};

describe('tp_mmb_elements: CV + attenuverters', () => {
  it('draagt de namen van de catalogus (met de tien CV-ingangen en FM)', async () => {
    const m = await expectMatchesCatalog('tp_mmb_elements');
    for (const id of ['bow_timbre_cv', 'blow_meta_cv', 'geometry_cv', 'space_cv', 'fm']) expect(m.inputs).toContain(id);
  });

  it('attenuverter in het midden: de CV doet niets', async () => {
    const base = await hit({ geometry: 0.2 });
    const cvNoAmt = await hit({ geometry: 0.2, geometry_amt: 0 }, { geometry_cv: 1 });
    expect(diff(base, cvNoAmt)).toBeLessThan(1e-6);
  });

  it('attenuverter open: knop + CV, zelfde als de knop zelf op die stand', async () => {
    const knob = await hit({ geometry: 0.7 });
    const viaCv = await hit({ geometry: 0.2, geometry_amt: 1 }, { geometry_cv: 0.5 });
    expect(diff(knob, viaCv)).toBeLessThan(1e-4);
    expect(diff(knob, await hit({ geometry: 0.2 }))).toBeGreaterThan(1e-3);
  });

  it('PLAY slaat aan zonder gate', async () => {
    expect(rms(await hit({}, {}, false))).toBeLessThan(1e-4);
    expect(rms(await hit({ play: 1 }, {}, false))).toBeGreaterThan(1e-3);
  });
});
