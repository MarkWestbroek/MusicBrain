// "+"-ingangen tellen bij de knop op (FW-MOD-1, fw 0.5.110): een kabel op
// Mix+ van de digital echo met 0 V laat de knop staan (vroeger zette hij Mix
// op 0), en de CV schuift het bereik op.

import { describe, expect, it } from 'vitest';

import { load, rms } from './wasmTestHost';

/** Echo-energie rond 100 ms na een tik, voor een knop- en CV-stand. */
async function echo(mixKnob: number, cv?: number): Promise<number> {
  const m = await load('tp_mmb_digital_echo');
  m.setCtl('time', 0.1); m.setCtl('feedback', 0); m.setCtl('mix', mixKnob); m.setCtl('mod_depth', 0);
  if (cv !== undefined) m.setIn('mix_cv', cv);
  let first = true;
  const out = m.render(0.3, (_t, mm) => {
    const b = mm.inBuf('in_l');
    b.fill(0);
    if (first) { b[0] = 0.9; first = false; }
  });
  const o = out.out_l!;
  return rms(o, Math.round(0.09 * m.rate), Math.round(0.12 * m.rate));
}

describe('knop + CV (digital echo, Mix+)', () => {
  it('een kabel met 0 V laat de knop staan', async () => {
    const knobOnly = await echo(0.6);
    expect(knobOnly).toBeGreaterThan(1e-3);
    expect(await echo(0.6, 0)).toBeCloseTo(knobOnly, 4);
  });

  it('de CV telt op: knop 0 + CV 0,6 klinkt als knop 0,6; knop 0,6 − 0,6 is droog', async () => {
    const knob = await echo(0.6);
    expect(await echo(0, 0.6)).toBeCloseTo(knob, 3);
    expect(await echo(0.6, -0.6)).toBeLessThan(knob / 20);
  });
});
