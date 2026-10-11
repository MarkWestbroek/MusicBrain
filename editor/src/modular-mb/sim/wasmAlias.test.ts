// Aliasing en intermodulatie van de vervormers (doc/dsp-check-2026-10.md),
// met een grens per geval: zo glijdt het niet ongemerkt terug. De grenzen
// liggen ~6 dB boven wat de kernen nu halen (fw 0.5.102, ADAA in Drive, Tube
// en de uitgang van de e-piano; fw 0.5.103 de eigen Ladder).

import { describe, expect, it } from 'vitest';

import { aliasOf } from './aliasProbe';
import { load } from './wasmTestHost';

const SINE_F0 = 3456.7, SAW_F0 = 220.13;
const sine = (ph: number): number => 0.8 * Math.sin(ph);
/** Bandbegrensde zaag (30 harmonischen): de ingang zelf is schoon. */
const saw = (ph: number): number => { let v = 0; for (let k = 1; k <= 30 && k * SAW_F0 < 20000; k++) v += Math.sin(k * ph) / k; return 0.5 * v; };

async function aliasFor(type: string, ctl: Record<string, number>, inp: string, out: string, f0: number, gen: (ph: number) => number) {
  const m = await load(type);
  for (const [k, v] of Object.entries(ctl)) m.setCtl(k, v);
  const buf = m.inBuf(inp);
  let ph = 0;
  const o = m.render(1.2, () => { for (let i = 0; i < m.block; i++) { ph += (2 * Math.PI * f0) / m.rate; buf[i] = gen(ph); } });
  return aliasOf(o[out]!, f0, m.rate);
}

describe('aliasing van de vervormers', () => {
  // [naam, type, knoppen, ingang, uitgang, grens sterkste alias < 10 kHz bij sinus, idem bij zaag]
  const cases: [string, string, Record<string, number>, string, string, number, number][] = [
    ['Drive Overdrive vol', 'tp_mmb_drive', { drive: 1, mode: 0, mix: 1 }, 'in', 'out', -66, -90],
    ['Drive Distortion vol', 'tp_mmb_drive', { drive: 1, mode: 1, mix: 1 }, 'in', 'out', -60, -90],
    ['Drive Fuzz vol', 'tp_mmb_drive', { drive: 1, mode: 2, mix: 1 }, 'in', 'out', -38, -59],
    // Tube zonder ADAA in de triodes (fw 0.5.107): een log per oversampled
    // sample was te duur op de Teensy (één Tube kostte 139 % cpu).
    ['Tube Studio vol', 'tp_mmb_tube', { drive: 1, mode: 0, mix: 1 }, 'in_l', 'out_l', -74, -93],
    ['Tube Amp vol', 'tp_mmb_tube', { drive: 1, mode: 1, mix: 1 }, 'in_l', 'out_l', -37, -61],
    // Ladder: eigen kern sinds fw 0.5.103 (mmb_dsp/ladder.h). De versie uit
    // de Teensy Audio Library aliaste hier −35 dB (zaag, Drive 4).
    ['Ladder open, drive 4', 'tp_mmb_ladder', { cutoff: 18000, q: 0, drive: 4 }, 'in', 'out', -60, -100],
  ];
  for (const [name, type, ctl, inp, out, limSine, limSaw] of cases) {
    it(`${name}: sterkste alias onder de grens (sinus ${SINE_F0} Hz en zaag A3)`, async () => {
      const a = await aliasFor(type, ctl, inp, out, SINE_F0, sine);
      const b = await aliasFor(type, ctl, inp, out, SAW_F0, saw);
      expect(a.worstAliasDb, `${name} sinus (${a.worstAliasHz} Hz)`).toBeLessThan(limSine);
      expect(b.worstAliasDb, `${name} zaag (${b.worstAliasHz} Hz)`).toBeLessThan(limSaw);
    }, 60000);
  }
});

describe('e-piano: akkoorden vervormen niet samen', () => {
  it('twee tonen op volle aanslag: intermodulatie op 2f1−f2 en 2f2−f1 onder −42 dB', async () => {
    const f1 = 261.6256, f2 = 329.6276;
    const m = await load('tp_mmb_epiano');
    m.setCtl('tremolo', 0);
    m.setIn('voct_1', 0); m.setIn('voct_2', 4 / 12); m.setIn('vel_1', 1); m.setIn('vel_2', 1);
    m.setIn('gate_1', 1); m.setIn('gate_2', 1);
    const o = m.render(1.0).out_l!;
    const r = aliasOf(o, f1, m.rate, Math.round(0.05 * m.rate));
    expect(r.levelAt(2 * f1 - f2)).toBeLessThan(-42);
    expect(r.levelAt(2 * f2 - f1)).toBeLessThan(-42);
    let pk = 0;
    for (const x of o) pk = Math.max(pk, Math.abs(x));
    expect(pk).toBeLessThan(0.95);
  }, 60000);
});
