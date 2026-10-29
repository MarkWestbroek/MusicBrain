// PUMP (tp_mmb_pump): VCA-compressor met sidechain en gate, 3630-stijl; de kern
// mmb_dsp::PumpComp is dezelfde als op de Teensy. Vastgelegd: de statische
// curve (ratio, ∞, zachte knie), attack en release, de sidechain (pompen op
// de sleutel, niets zonder), de gate (ook in bypass), Listen/Mix/Bypass, mono
// in → beide uitgangen, en dezelfde tijden op 96 kHz (MMB_RATE_FLEX).

import { describe, expect, it } from 'vitest';

import { load, rms } from './wasmTestHost';

type Sig = (t: number) => number;
interface Feed { in_l?: Sig; in_r?: Sig; sc?: Sig }

async function run(ctl: Record<string, number>, secs: number, sig: Feed, rate?: number) {
  const m = await load('tp_mmb_pump', { rate });
  for (const [id, v] of Object.entries(ctl)) m.setCtl(id, v);
  for (const id of ['in_l', 'in_r', 'sc'] as const) if (!sig[id]) m.setIn(id, 0, false);
  let n = 0;
  const out = m.render(secs, (_t, mm) => {
    const bufs = (['in_l', 'in_r', 'sc'] as const).filter((id) => sig[id]).map((id) => [mm.inBuf(id), sig[id]!] as const);
    for (let k = 0; k < mm.block; ++k, ++n) for (const [b, f] of bufs) b[k] = f(n / mm.rate);
  });
  return { ...out, rate: m.rate };
}

const sine = (db: number, f = 1000): Sig => (t) => 10 ** (db / 20) * Math.sin(2 * Math.PI * f * t);
const db = (x: number) => 20 * Math.log10(x);
/** Uitgangsniveau als piek-dB (RMS + 3 dB) over het laatste stuk. */
const peakDb = (x: Float32Array, rate: number, from = 0.6) => db(rms(x, Math.round(from * rate))) + 3.01;

// threshold-knop −12 → −30 dBFS (0 dB op de knop = −18 dBFS)
const STATIC = { threshold: -12, attack: 0.1, release: 3000 };

describe('PUMP (sidechain-compressor, 3630-stijl)', () => {
  it('statische curve: −20 dBFS in, drempel −30, ratio 4 → −27,5 dBFS; ∞ = begrenzer', async () => {
    const r4 = await run({ ...STATIC, ratio: 4 }, 0.8, { in_l: sine(-20) });
    expect(peakDb(r4.out_l!, r4.rate)).toBeCloseTo(-27.5, 0);
    const inf = await run({ ...STATIC, ratio: 21 }, 0.8, { in_l: sine(-20) });
    expect(peakDb(inf.out_l!, inf.rate)).toBeCloseTo(-30, 0);
    const onder = await run({ ...STATIC, ratio: 4 }, 0.8, { in_l: sine(-40) });
    expect(peakDb(onder.out_l!, onder.rate)).toBeCloseTo(-40, 0);
  }, 30_000);

  it('zachte knie grijpt op de drempel al ~1 dB in, de harde niet', async () => {
    const hard = await run({ ...STATIC, ratio: 4, knee: 0 }, 0.8, { in_l: sine(-30) });
    const soft = await run({ ...STATIC, ratio: 4, knee: 1 }, 0.8, { in_l: sine(-30) });
    expect(peakDb(hard.out_l!, hard.rate)).toBeCloseTo(-30, 0);
    const extra = peakDb(hard.out_l!, hard.rate) - peakDb(soft.out_l!, soft.rate);
    expect(extra).toBeGreaterThan(0.7);
    expect(extra).toBeLessThan(1.6);
  }, 30_000);

  it('release: de gain reduction zakt in ~de ingestelde tijd (63 %)', async () => {
    for (const ms of [100, 800]) {
      const o = await run({ threshold: -12, ratio: 21, attack: 0.1, release: ms }, 0.3 + 2.5 * ms / 1000,
        { in_l: (t) => (t < 0.3 ? sine(-6)(t) : 0) });
      const gr = o.gr!, i0 = Math.round(0.299 * o.rate);
      const top = gr[i0]!;
      const i63 = gr.findIndex((v, i) => i > i0 && v < top * 0.37);
      const tau = (i63 - i0) / o.rate * 1000;
      expect(tau, `release ${ms}`).toBeGreaterThan(ms * 0.8);
      expect(tau, `release ${ms}`).toBeLessThan(ms * 1.25);
    }
  }, 30_000);

  it('attack: 0,1 ms is na 2 ms al ver, 50 ms nog lang niet', async () => {
    const step: Sig = (t) => (t < 0.1 ? 0 : sine(-6)(t));
    const snel = await run({ threshold: -12, ratio: 21, attack: 0.1 }, 0.2, { in_l: step });
    const traag = await run({ threshold: -12, ratio: 21, attack: 50 }, 0.2, { in_l: step });
    const at = Math.round(0.102 * snel.rate);
    expect(snel.gr![at]!).toBeGreaterThan(0.7);            // ≥ 14 dB van de 24
    expect(traag.gr![at]!).toBeLessThan(0.15);
  }, 30_000);

  // Een "kick": 60 Hz met snel uitsterven, elke 0,5 s.
  const kick: Sig = (t) => { const p = t % 0.5; return 0.9 * Math.exp(-p / 0.08) * Math.sin(2 * Math.PI * 60 * p); };

  it('sidechain: een pad onder de drempel pompt op de kick, zonder sleutel gebeurt niets', async () => {
    const ctl = { threshold: -6, ratio: 10, attack: 0.5, release: 100 };   // drempel −24 dBFS
    const pad = sine(-30, 440);
    const met = await run(ctl, 2, { in_l: pad, sc: kick });
    const zonder = await run(ctl, 2, { in_l: pad });
    const win = (o: Float32Array, rate: number, a: number, b: number) => db(rms(o, Math.round(a * rate), Math.round(b * rate)));
    // net na de kick (1,0 s) diep weg, vlak voor de volgende (1,45 s) weer terug
    const dip = win(met.out_l!, met.rate, 1.02, 1.07), terug = win(met.out_l!, met.rate, 1.42, 1.48);
    expect(terug - dip).toBeGreaterThan(10);
    expect(win(zonder.out_l!, zonder.rate, 1.02, 1.07)).toBeCloseTo(-33, 0);
    expect(zonder.gr![Math.round(1.04 * zonder.rate)]!).toBe(0);
  }, 30_000);

  it('met een sleutel luistert de detector niet meer naar de eigen ingang', async () => {
    const o = await run({ threshold: -12, ratio: 21 }, 0.8, { in_l: sine(-6), sc: () => 0 });
    expect(peakDb(o.out_l!, o.rate)).toBeCloseTo(-6, 0);
  }, 30_000);

  it('SC HP: een basloze kick laat de pad bijna niet pompen', async () => {
    const ctl = { threshold: -6, ratio: 10, attack: 0.5, release: 150 };
    const zonder = await run(ctl, 1.2, { in_l: sine(-30, 440), sc: (t) => 0.5 * Math.sin(2 * Math.PI * 40 * t) });
    const met = await run({ ...ctl, sc_hp: 3 }, 1.2, { in_l: sine(-30, 440), sc: (t) => 0.5 * Math.sin(2 * Math.PI * 40 * t) });
    expect(met.gr![met.gr!.length - 1]!).toBeLessThan(0.5 * zonder.gr![zonder.gr!.length - 1]!);
  }, 30_000);

  it('gate sluit in de ingestelde tijd onder de drempel, ook in bypass', async () => {
    for (const bypass of [0, 1]) {
      const o = await run({ threshold: 20, gate: -40, gate_rate: 100, bypass }, 0.8,
        { in_l: (t) => (t < 0.3 ? sine(-20)(t) : sine(-60)(t)) });
      expect(o.gate![Math.round(0.25 * o.rate)]).toBe(1);
      expect(o.gate![Math.round(0.4 * o.rate)]).toBe(0);
      expect(db(rms(o.out_l!, Math.round(0.1 * o.rate), Math.round(0.29 * o.rate))) + 3.01).toBeCloseTo(-20, 0);
      expect(db(rms(o.out_l!, Math.round(0.6 * o.rate)))).toBeLessThan(-90);
    }
    const uit = await run({ gate: -70 }, 0.5, { in_l: sine(-60) });
    expect(peakDb(uit.out_l!, uit.rate, 0.3)).toBeCloseTo(-60, 0);
  }, 30_000);

  it('Listen laat de sleutel horen; Mix 0 en Bypass laten droog door', async () => {
    const key = sine(-12, 200);
    const l = await run({ listen: 1 }, 0.3, { in_l: sine(-6), sc: key });
    for (let i = 5000; i < 5100; i++) expect(l.out_l![i]!).toBeCloseTo(key(i / l.rate), 5);
    for (const ctl of [{ mix: 0 }, { bypass: 1 }]) {
      const o = await run({ threshold: -40, ratio: 21, ...ctl }, 0.3, { in_l: sine(-6) });
      for (let i = 5000; i < 5100; i++) expect(o.out_l![i]!).toBeCloseTo(sine(-6)(i / o.rate), 5);
    }
  }, 30_000);

  it('mono in → beide uitgangen; binnen ±1 met +20 dB output', async () => {
    const o = await run({ threshold: 20, output: 20 }, 0.3, { in_l: sine(0, 110) });
    for (let i = 3000; i < 3200; i++) expect(o.out_r![i]).toBe(o.out_l![i]);
    let pk = 0; for (const v of o.out_l!) pk = Math.max(pk, Math.abs(v));
    expect(pk).toBeLessThanOrEqual(1);
  }, 30_000);

  it('rekent op 96 kHz met dezelfde tijden (MMB_RATE_FLEX)', async () => {
    const o = await run({ threshold: -12, ratio: 21, attack: 0.1, release: 200 }, 1, { in_l: (t) => (t < 0.3 ? sine(-6)(t) : 0) }, 96000);
    expect(o.rate).toBe(96000);
    const gr = o.gr!, i0 = Math.round(0.299 * o.rate), top = gr[i0]!;
    const tau = (gr.findIndex((v, i) => i > i0 && v < top * 0.37) - i0) / o.rate * 1000;
    expect(tau).toBeGreaterThan(160);
    expect(tau).toBeLessThan(250);
  }, 30_000);
});
