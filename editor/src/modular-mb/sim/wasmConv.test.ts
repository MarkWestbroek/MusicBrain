// CONV (doc/plans/conv-reverb.md §4): de opgedeelde convolutie is exact (ook
// over de grenzen van de partities), vertraging 64 samples die van de
// pre-delay afgaat, de gegenereerde ruimtes hebben hun galmtijd, Size rekt op,
// Length kapt af, Mix 0 = droog.

import { describe, expect, it } from 'vitest';

import { onePole, rt60 } from './hallMeasure';
import { load, peak } from './wasmTestHost';

type Ctl = Record<string, number>;
async function conv(ctl: Ctl) {
  const m = await load('tp_mmb_conv');
  m.setCtl('mix', 1); m.setCtl('predelay', 0); m.setCtl('locut', 10); m.setCtl('hicut', 20000);
  for (const [k, v] of Object.entries(ctl)) m.setCtl(k, v);
  return m;
}
async function ir(ctl: Ctl, secs: number) {
  const m = await conv(ctl);
  let first = true;
  const o = m.render(secs, (_t, mm) => { const b = mm.inBuf('in_l'); b.fill(0); if (first) { b[0] = 1; first = false; } });
  return { l: o.out_l!, r: o.out_r!, rate: m.rate };
}
const band = (x: Float32Array, rate: number) => onePole(onePole(x, rate, 500, 'hp'), rate, 2000, 'lp');

describe('tp_mmb_conv', () => {
  it('is een exacte convolutie: ruis erin = ruis * de gemeten impulsrespons', async () => {
    const ctl = { ir: 0, length: 0.5 };   // 0,5 s: raakt alle blokgroottes t/m 4096
    const h = (await ir(ctl, 0.8)).l;
    const m = await conv(ctl);
    let s = 7;
    const x: number[] = [];
    const n = Math.round(0.3 * m.rate);
    const y = m.render(0.6, (_t, mm) => {
      const b = mm.inBuf('in_l');
      for (let k = 0; k < mm.block; k++) { s = (s * 16807) % 2147483647; const v = x.length < n ? s / 2147483647 * 2 - 1 : 0; x.push(v); b[k] = v; }
    }).out_l!;
    let worst = 0, top = 0;
    for (let t = 0; t < y.length; t += 37) {
      let acc = 0;
      for (let k = 0; k <= t && k < h.length; k++) acc += h[k]! * x[t - k]!;
      worst = Math.max(worst, Math.abs(acc - y[t]!)); top = Math.max(top, Math.abs(acc));
    }
    expect(top).toBeGreaterThan(0.01);
    expect(worst / top).toBeLessThan(1e-3);
  });

  it('vertraging: 64 samples zonder pre-delay; met pre-delay precies de pre-delay', async () => {
    const onset = (a: Float32Array) => a.findIndex((v) => Math.abs(v) > 1e-6);
    // De IR zelf begint met een opbouw vanaf 0: de eerste niet-nul valt 1–2 samples later.
    const a0 = onset((await ir({ ir: 3, length: 0.3 }, 0.1)).l);
    expect(a0).toBeGreaterThanOrEqual(64); expect(a0).toBeLessThanOrEqual(66);
    const r = await ir({ ir: 3, length: 0.3, predelay: 20 }, 0.1);
    expect(onset(r.l) - a0).toBe(Math.round(0.02 * r.rate) - 64);
  });

  it('de gegenereerde ruimtes hebben hun galmtijd', async () => {
    const t60 = [2.4, 0.7, 1.4, 2.0, 4.2, 0.35];
    for (let i = 0; i < t60.length; i++) {
      const { l, rate } = await ir({ ir: i }, Math.min(4.5, t60[i]! * 1.6 + 0.3));
      const t = rt60(band(l, rate), rate);
      expect(t, `ir ${i}`).toBeGreaterThan(t60[i]! * 0.75);
      expect(t, `ir ${i}`).toBeLessThan(t60[i]! * 1.25);
    }
  });

  it('Size 2 rekt de ruimte op: dubbele galmtijd', async () => {
    const a = await ir({ ir: 2, size: 1 }, 3);
    const b = await ir({ ir: 2, size: 2 }, 4.2);
    const ratio = rt60(band(b.l, b.rate), b.rate) / rt60(band(a.l, a.rate), a.rate);
    expect(ratio).toBeGreaterThan(1.7);
    expect(ratio).toBeLessThan(2.3);
  });

  it('Length 1 s: daarna stilte', async () => {
    const { l, rate } = await ir({ ir: 4, length: 1 }, 1.5);
    expect(peak(l.subarray(Math.round(1.01 * rate)))).toBeLessThan(1e-5);
    expect(peak(l.subarray(Math.round(0.5 * rate), Math.round(0.6 * rate)))).toBeGreaterThan(1e-4);
  });

  it('links en rechts verschillen (stereo-IR)', async () => {
    const { l, r } = await ir({ ir: 0 }, 1);
    let d = 0, e = 0;
    for (let i = 0; i < l.length; i++) { d += (l[i]! - r[i]!) ** 2; e += l[i]! ** 2; }
    expect(d / e).toBeGreaterThan(0.5);
  });

  it('wisselen van IR tijdens het spelen blijft eindig en begrensd', async () => {
    const m = await conv({ ir: 0 });
    let s = 3;
    const noise = (_t: number, mm: { block: number; inBuf: (id: string) => Float32Array }) => {
      const b = mm.inBuf('in_l'); for (let k = 0; k < mm.block; k++) { s = (s * 16807) % 2147483647; b[k] = 0.3 * (s / 2147483647 * 2 - 1); }
    };
    m.render(0.5, noise);
    for (const i of [4, 1, 3]) { m.setCtl('ir', i); const o = m.render(0.3, noise).out_l!; expect(o.every(Number.isFinite)).toBe(true); expect(peak(o)).toBeLessThan(3); }
  });

  it('Mix 0 laat het droge signaal ongewijzigd door', async () => {
    const m = await conv({ mix: 0 });
    const o = m.render(0.1, (t, mm) => { const b = mm.inBuf('in_l'); for (let k = 0; k < mm.block; k++) b[k] = Math.sin(2 * Math.PI * 440 * (t + k / mm.rate)); });
    for (let i = 0; i < o.out_l!.length; i += 97) expect(o.out_l![i]!).toBeCloseTo(Math.sin(2 * Math.PI * 440 * i / m.rate), 4);
  });
});
