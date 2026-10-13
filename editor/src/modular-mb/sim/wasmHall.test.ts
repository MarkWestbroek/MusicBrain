// HALL (doc/plans/hall-reverb.md §3): galmtijd per band, kleur van de staart,
// stereo, Freeze en lange Decay stabiel, Mix 0 = droog.

import { describe, expect, it } from 'vitest';

import { correlation, onePole, rt60, spectralPeakDb } from './hallMeasure';
import { expectMatchesCatalog, load, peak } from './wasmTestHost';

/** Impulsrespons (links in, beide uit), alleen de staart: Mix 1, geen vroege reflecties, geen pre-delay. */
async function ir(ctl: Record<string, number>, secs = 6) {
  const m = await load('tp_mmb_hall');
  m.setCtl('mix', 1); m.setCtl('early', 0); m.setCtl('predelay', 0);
  for (const [k, v] of Object.entries(ctl)) m.setCtl(k, v);
  let first = true;
  const o = m.render(secs, (_t, mm) => { const b = mm.inBuf('in_l'); b.fill(0); if (first) { b[0] = 1; first = false; } });
  return { l: o.out_l!, r: o.out_r!, rate: m.rate };
}
const band = (x: Float32Array, rate: number, lo: number, hi: number) => onePole(onePole(x, rate, lo, 'hp'), rate, hi, 'lp');
const rms = (a: Float32Array, s: number, e: number) => { let x = 0; for (let i = s; i < e; i++) x += a[i]! * a[i]!; return Math.sqrt(x / (e - s)); };

describe('tp_mmb_hall', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_hall'); });

  it('Decay is de galmtijd (midden), voor alle vier de algoritmes', async () => {
    for (const algo of [0, 1, 2, 3]) for (const decay of [1, 3]) {
      const { l, rate } = await ir({ algo, decay, hidamp: 0, lomult: 1 }, decay * 2.5);
      const t = rt60(band(l, rate, 500, 2000), rate);
      expect(t, `algo ${algo} decay ${decay}`).toBeGreaterThan(decay * 0.75);
      expect(t, `algo ${algo} decay ${decay}`).toBeLessThan(decay * 1.25);
    }
  });

  it('Lo mult rekt het laag, Hi damp kort het hoog in', async () => {
    const { l, rate } = await ir({ decay: 2, lomult: 2, hidamp: 1 });
    const lo = rt60(onePole(l, rate, 150, 'lp'), rate);
    const mid = rt60(band(l, rate, 500, 2000), rate);
    const hi = rt60(onePole(l, rate, 6000, 'hp'), rate);
    expect(lo).toBeGreaterThan(mid * 1.4);
    expect(hi).toBeLessThan(mid * 0.6);
  });

  it('de staart klinkt niet metalig (boven 1 kHz geen pieken van meer dan 4 dB)', async () => {
    for (const algo of [0, 2, 3]) {
      const { l, rate } = await ir({ algo, size: 0.6, decay: 1.5 }, 3);
      expect(spectralPeakDb(l.subarray(Math.round(0.3 * rate)), rate, 1000, 10000), `algo ${algo}`).toBeLessThan(4);
    }
  });

  it('de staart wordt snel dicht: na 100 ms geen losse tikken meer', async () => {
    const { l, rate } = await ir({ decay: 2 }, 1);
    // Piek ten opzichte van rms in vensters van 10 ms: een losse echo steekt ver uit.
    const w = Math.round(0.01 * rate);
    for (let s = Math.round(0.1 * rate); s + w < Math.round(0.6 * rate); s += w) {
      const r = rms(l, s, s + w);
      expect(peak(l.subarray(s, s + w)) / r).toBeLessThan(5);
    }
  });

  it('links en rechts zijn gedecorreleerd', async () => {
    const { l, r, rate } = await ir({ decay: 2 });
    expect(Math.abs(correlation(l, r, Math.round(0.1 * rate)))).toBeLessThan(0.3);
  });

  it('Freeze houdt de staart vast zonder weg te lopen', async () => {
    const m = await load('tp_mmb_hall');
    m.setCtl('mix', 1);
    m.render(0.5, (t, mm) => { const b = mm.inBuf('in_l'); for (let k = 0; k < mm.block; k++) b[k] = 0.3 * Math.sin(2 * Math.PI * 330 * (t + k / mm.rate)); });
    m.setCtl('freeze_btn', 1);
    const o = m.render(10, (_t, mm) => { mm.inBuf('in_l').fill(0.3); }).out_l!;   // ingang is dicht
    const early = rms(o, 0, m.rate), late = rms(o, 9 * m.rate, 10 * m.rate);
    expect(late).toBeGreaterThan(early * 0.8);
    expect(late).toBeLessThan(early * 1.2);
    expect(peak(o)).toBeLessThan(1);
  });

  it('de Freeze-gate doet hetzelfde als de knop', async () => {
    const m = await load('tp_mmb_hall');
    m.setCtl('mix', 1); m.setCtl('decay', 0.5);
    m.render(0.3, (t, mm) => { const b = mm.inBuf('in_l'); for (let k = 0; k < mm.block; k++) b[k] = 0.3 * Math.sin(2 * Math.PI * 330 * (t + k / mm.rate)); });
    m.setIn('freeze', 1);
    const o = m.render(4, (_t, mm) => { mm.inBuf('in_l').fill(0); }).out_l!;
    expect(rms(o, 3 * m.rate, 4 * m.rate)).toBeGreaterThan(0.01);
  });

  it('Decay 30 s met een volle ingang blijft begrensd', async () => {
    const m = await load('tp_mmb_hall');
    m.setCtl('mix', 1); m.setCtl('decay', 30); m.setCtl('lomult', 4); m.setCtl('size', 1);
    let s = 1;
    const o = m.render(8, (_t, mm) => { const b = mm.inBuf('in_l'); for (let k = 0; k < mm.block; k++) { s = (s * 16807) % 2147483647; b[k] = 0.5 * (s / 2147483647 * 2 - 1); } }).out_l!;
    expect(peak(o)).toBeLessThan(2);
    expect(rms(o, 7 * m.rate, 8 * m.rate)).toBeLessThan(rms(o, 3 * m.rate, 4 * m.rate) * 1.5);
  });

  it('Mix 0 laat het droge signaal ongewijzigd door', async () => {
    const m = await load('tp_mmb_hall');
    m.setCtl('mix', 0);
    const o = m.render(0.1, (t, mm) => { const b = mm.inBuf('in_l'); for (let k = 0; k < mm.block; k++) b[k] = Math.sin(2 * Math.PI * 440 * (t + k / mm.rate)); });
    const ref = new Float32Array(o.out_l!.length).map((_, i) => Math.sin(2 * Math.PI * 440 * i / m.rate));
    for (let i = 0; i < ref.length; i += 97) expect(o.out_l![i]!).toBeCloseTo(ref[i]!, 4);
  });
});
