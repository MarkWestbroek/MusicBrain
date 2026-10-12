// FW-MOD-1 (fw 0.5.109): knoppen en poorten die deden wat het paneel zegt.
//  * VCO: FM × de FM-knop telt octaven bij de toonhoogte op; Sync is weg.
//  * LFO: de Gate-ingang stuurt Run = Gated en OneShot.
//  * Stages: Rate schaalt alle tijden.

import { describe, expect, it } from 'vitest';

import { expectMatchesCatalog, load, risingEdges } from './wasmTestHost';

/** Frequentie uit de stijgende nuldoorgangen. */
function freqOf(x: Float32Array, rate: number, from: number): number {
  const ups: number[] = [];
  for (let i = Math.max(1, from); i < x.length; i++) if (x[i - 1]! < 0 && x[i]! >= 0) ups.push(i);
  return ups.length < 2 ? 0 : (rate * (ups.length - 1)) / (ups.at(-1)! - ups[0]!);
}

describe('tp_mmb_vco: FM', () => {
  it('draagt de namen van de catalogus (zonder Sync)', async () => {
    const m = await expectMatchesCatalog('tp_mmb_vco');
    expect(m.inputs).not.toContain('sync');
  });

  it('FM 1 met FM-knop 1 is een octaaf hoger, met de knop op 0 niets', async () => {
    const at = async (amt: number): Promise<number> => {
      const m = await load('tp_mmb_vco');
      m.setCtl('wave', 0); m.setCtl('fm_amt', amt);
      m.setIn('voct', 0); m.setIn('fm', 1);
      return freqOf(m.render(0.3).out!, m.rate, 2000);
    };
    expect(await at(0)).toBeCloseTo(261.6, 0);
    expect(await at(1) / 261.6).toBeCloseTo(2, 1);
    expect(await at(0.5) / 261.6).toBeCloseTo(Math.SQRT2, 1);
  });
});

describe('tp_mmb_lfo: Gate', () => {
  it('draagt de namen van de catalogus (met Gate)', async () => {
    const m = await expectMatchesCatalog('tp_mmb_lfo');
    expect(m.inputs).toContain('gate');
  });

  it('Gated: staat stil zonder gate, loopt met gate', async () => {
    const m = await load('tp_mmb_lfo');
    m.setCtl('run', 1); m.setCtl('rate', 5); m.setCtl('wave', 3);   // blok, 5 Hz
    m.setIn('gate', 0);
    const still = m.render(1).out!;
    expect(Math.max(...still.subarray(10)) - Math.min(...still.subarray(10))).toBe(0);
    m.setIn('gate', 1);
    expect(risingEdges(m.render(1).out!).length).toBeGreaterThanOrEqual(4);
  });
});

describe('tp_mmb_stages: Rate', () => {
  /** Tijd (s) tot de eerste ramp na de gate zijn top haalt. */
  async function rampTime(rate: number): Promise<number> {
    const m = await load('tp_mmb_stages');
    m.setCtl('segments', 3); m.setCtl('t1', 0.5); m.setCtl('rate', rate);
    m.setIn('gate', 0); m.render(0.05);
    m.setIn('gate', 1);
    const out = m.render(1).out!;
    let peak = 0, at = 0;
    for (let i = 0; i < 400; i++) if (out[i]! > peak + 1e-4) { peak = out[i]!; at = i; }
    return at / m.rate;
  }

  it('Rate 2 maakt de ramp half zo lang, Rate 0,5 twee keer zo lang', async () => {
    const t1 = await rampTime(1);
    expect(t1).toBeGreaterThan(0.01);
    expect((await rampTime(2)) / t1).toBeCloseTo(0.5, 1);
    expect((await rampTime(0.5)) / t1).toBeCloseTo(2, 1);
  });
});
