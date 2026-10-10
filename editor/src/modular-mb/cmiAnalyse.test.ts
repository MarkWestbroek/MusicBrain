// Een sample naar Page 4 (doc/plans/fairlight.md §6.4): bekende klanken
// erin, de bekende harmonischen eruit.

import { describe, expect, it } from 'vitest';

import { analyseSample, findPeriod, noteOf, segmentBounds } from './cmiAnalyse';
import { SAMPLES, SEG, computeTable, preset } from './cmiProfile';

const RATE = 48000;

/** Som van harmonischen; `amp(k, t)` mag in de tijd veranderen, `f(t)` ook. */
function synth(seconds: number, f: (t: number) => number, amp: (k: number, t: number) => number, kMax = 40): Float32Array {
  const n = Math.round(seconds * RATE);
  const x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    ph += (2 * Math.PI * f(t)) / RATE;
    let v = 0;
    for (let k = 1; k <= kMax; k++) {
      if (k * f(t) >= RATE / 2) break;
      const a = amp(k, t);
      if (a) v += a * Math.sin(k * ph);
    }
    x[i] = v * 0.3;
  }
  return x;
}
const lv = (p: { levels: Float32Array }, h: number, s: number): number => p.levels[h * SEG + s]!;
const db = (v: number): number => 20 * Math.log10(Math.max(1e-9, v));

describe('sample → Page 4', () => {
  it('zaag op 220 Hz: grondtoon binnen 0,5 %, niveaus ≈ 1/k', () => {
    const x = synth(1, () => 220, (k) => 1 / k);
    const a = analyseSample(x, RATE);
    expect(a.f0 / 220).toBeCloseTo(1, 2);
    for (const s of [3, 16, 30]) for (const k of [2, 3, 5, 8]) expect(lv(a.profile, k - 1, s), `h${k} s${s}`).toBeCloseTo(1 / k, 1);
    expect(a.harmonicity).toBeGreaterThan(0.95);
  });

  it('vierkant: even harmonischen onder −30 dB', () => {
    const a = analyseSample(synth(0.6, () => 330, (k) => (k % 2 ? 1 / k : 0)), RATE);
    for (const k of [2, 4, 6]) expect(db(lv(a.profile, k - 1, 15)), `h${k}`).toBeLessThan(-30);
    expect(lv(a.profile, 2, 15)).toBeCloseTo(1 / 3, 1);
  });

  it('een klank die verloopt: hoge harmonischen sterven sneller, ENERGY daalt', () => {
    const x = synth(1.5, () => 196, (k, t) => (1 / k) * Math.exp(-t * (0.5 + k * 0.8)));
    const a = analyseSample(x, RATE);
    const ratio = (s: number): number => lv(a.profile, 4, s) / lv(a.profile, 0, s);
    expect(ratio(28)).toBeLessThan(0.5 * ratio(4));
    expect(a.profile.energy[2]!).toBeGreaterThan(a.profile.energy[28]!);
    expect(Math.max(...a.profile.energy)).toBeCloseTo(1, 5);
  });

  it('vibrato van ±1 %: de niveaus blijven schoon', () => {
    const x = synth(1, (t) => 220 * (1 + 0.01 * Math.sin(2 * Math.PI * 5.5 * t)), (k) => 1 / k);
    const a = analyseSample(x, RATE);
    for (const s of [8, 20]) for (const k of [3, 6, 10]) expect(lv(a.profile, k - 1, s), `h${k} s${s}`).toBeCloseTo(1 / k, 1);
  });

  it('ruis: weinig harmonisch', () => {
    let seed = 1;
    const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 - 0.5; };
    const x = Float32Array.from({ length: RATE }, rnd);
    const a = analyseSample(x, RATE, { f0Hz: 200 });
    expect(a.harmonicity).toBeLessThan(0.4);
  });

  it('DURATION: samen even lang als het gebied; met aanzet fijner eerst korte segmenten', () => {
    const x = synth(1, () => 220, (k) => 1 / k);
    const a = analyseSample(x, RATE, { start: 4800, end: 4800 + RATE / 2, segMs: 25 });
    const total = a.profile.duration.reduce((s, d) => s + d * 25, 0);
    expect(total).toBeCloseTo(500, -1);
    expect(a.profile.duration[0]! * 10).toBeLessThan(a.profile.duration[31]!);
    const even = segmentBounds(0, 3200, false);
    expect(even[1]).toBeCloseTo(100, 5);
    expect(even[32]).toBe(3200);
  });

  it('de hint van de bankzone voorkomt een octaaffout bij een zwakke grondtoon', () => {
    // Grondtoon 110 Hz bijna weg: zonder hint kiest YIN makkelijk 220.
    const x = synth(1, () => 110, (k) => (k === 1 ? 0.05 : 1 / k));
    const T = findPeriod(x, RATE, RATE / 2, { hintHz: 110 });
    expect(RATE / T).toBeCloseTo(110, 0);
  });

  it('rondreis: profiel → golfvormen → afspelen → analyse geeft het profiel terug', () => {
    const p = preset('choir');
    const table = computeTable(p);
    const f0 = 220, segMs = 40;
    // De stem nagespeeld: segment s duurt segMs × DUR, zero-order hold op 128·f0 is
    // hier lineair lezen op 48 kHz (genoeg voor de niveaus).
    const out: number[] = [];
    let ph = 0;
    for (let s = 0; s < SEG; s++) {
      const n = Math.round((segMs * p.duration[s]! * RATE) / 1000);
      for (let i = 0; i < n; i++) {
        ph = (ph + (f0 * SAMPLES) / RATE) % SAMPLES;
        const j = Math.floor(ph), fr = ph - j;
        const a = table[s * SAMPLES + j]!, b = table[s * SAMPLES + ((j + 1) % SAMPLES)]!;
        out.push(((a + (b - a) * fr) / 32768) * p.energy[s]!);
      }
    }
    const a = analyseSample(Float32Array.from(out), RATE, { f0Hz: f0, fineAttack: false, segMs });
    for (const s of [6, 16, 26]) {
      let max = 0;
      for (let h = 0; h < 32; h++) max = Math.max(max, p.levels[h * SEG + s]!);
      for (const k of [1, 3, 4, 9]) expect(lv(a.profile, k - 1, s), `h${k} s${s}`).toBeCloseTo(p.levels[(k - 1) * SEG + s]! / max, 1);
    }
  });

  it('notennaam', () => {
    expect(noteOf(440)).toEqual({ midi: 69, cents: 0, name: 'A4' });
    expect(noteOf(110.2).name).toBe('A2');
  });
});
