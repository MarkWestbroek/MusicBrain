// RATCHET (tp_mmb_ratchet): de firmwareklasse via cvhost.h als wasm, 1 kHz.
// Plan: doc/plans/ratchet.md. Gemeten op genoteerd 140 bpm met Clock ×4
// (een zestiende = 107,14 ms), met en zonder swing.

import { describe, expect, it } from 'vitest';

import { type Mod, expectMatchesCatalog, load, risingEdges } from './wasmTestHost';

const SIXTEENTH = 60000 / 140 / 4;

/** Klokflanken (ms): om en om lang en kort bij swing (0.5 = recht). */
function clockEdges(count: number, swing = 0.5): number[] {
  const pair = 2 * SIXTEENTH;
  const out: number[] = [];
  for (let k = 0; k < count; ++k) out.push(Math.round(Math.floor(k / 2) * pair + (k % 2) * pair * swing));
  return out;
}

/** Klok als callback voor render(): 10 ms hoog op elke flank. */
function clockFrom(edges: number[]) {
  return (t: number, m: Mod): void => {
    const ms = Math.round(t * 1000);
    m.setIn('clock', edges.some((e) => ms >= e && ms < e + 10) ? 1 : 0);
  };
}

/** Een leeg patroon (alles rust) met één stand op stap 1 van A. */
async function withStep1(stand: number): Promise<Mod> {
  const m = await load('tp_mmb_ratchet');
  for (let i = 1; i <= 16; ++i) { m.setCtl(`a_${i}`, 0); m.setCtl(`b_${i}`, 0); }
  m.setCtl('a_1', stand);
  return m;
}

/** Slagen binnen [from, to) ms. */
const hitsIn = (gate: Float32Array, from: number, to: number): number[] =>
  risingEdges(gate).filter((e) => e >= from && e < to);

const expectNear = (actual: number[], expected: number[], tol = 2): void => {
  expect(actual.length, `${actual} ≠ ${expected.map((e) => e.toFixed(1))}`).toBe(expected.length);
  actual.forEach((a, i) => expect(Math.abs(a - expected[i]!), `slag ${i}: ${a} ≠ ${expected[i]!.toFixed(1)}`).toBeLessThanOrEqual(tol));
};

describe('tp_mmb_ratchet', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_ratchet'); });

  // De tweede maat: dan is de klok gemeten.
  const edges = clockEdges(40);
  const bar2 = edges[16]!;

  it('stand 3, 6 en 3:2 delen de stap (of twee stappen) gelijk op', async () => {
    for (const [stand, n, span] of [[3, 3, 1], [5, 6, 1], [7, 3, 2]] as const) {
      const m = await withStep1(stand);
      const gate = m.render(2.4, clockFrom(edges)).gate!;
      const d = (span * SIXTEENTH) / n;
      expectNear(hitsIn(gate, bar2, bar2 + 2 * SIXTEENTH - 5), Array.from({ length: n }, (_, k) => bar2 + k * d));
    }
  });

  it('3:2 met swing blijft een gelijke triool; 2 volgt de lange en de korte stap', async () => {
    const swung = clockEdges(40, 0.6);
    const s0 = swung[16]!, s1 = swung[17]!, s2 = swung[18]!;
    const triplet = await withStep1(7);
    const g = triplet.render(2.4, clockFrom(swung)).gate!;
    const third = (s2 - s0) / 3;
    expectNear(hitsIn(g, s0, s2 - 5), [s0, s0 + third, s0 + 2 * third]);

    const double = await withStep1(2);
    double.setCtl('a_2', 2);
    const g2 = double.render(2.4, clockFrom(swung)).gate!;
    expectNear(hitsIn(g2, s0, s2 - 5), [s0, s0 + (s1 - s0) / 2, s1, s1 + (s2 - s1) / 2]);
  });

  it('accent loopt van Base naar Base + Ramp, pitch van 0 naar Sweep', async () => {
    const m = await withStep1(4);   // vier slagen
    m.setCtl('base', 0.2); m.setCtl('ramp', 0.6); m.setCtl('sweep', 12);
    const o = m.render(2.4, clockFrom(edges));
    const hits = hitsIn(o.gate!, bar2, bar2 + SIXTEENTH - 5);
    expect(hits).toHaveLength(4);
    const acc = hits.map((h) => o.accent![h + 1]!);
    const pitch = hits.map((h) => o.pitch![h + 1]!);
    expect(acc[0]).toBeCloseTo(0.2, 3);
    expect(acc[3]).toBeCloseTo(0.8, 3);
    expect(acc[1]! > acc[0]! && acc[2]! > acc[1]!).toBe(true);
    expect(pitch[0]).toBeCloseTo(0, 3);
    expect(pitch[3]).toBeCloseTo(1, 3);   // 12 halve tonen = 1 V
  });

  it('A/B, Roll en Rat+ kiezen de stand; rust is stil', async () => {
    // Een nieuw exemplaar per geval: de klok begint dan weer bij nul.
    const a = await withStep1(1); a.setCtl('b_1', 4);
    expect(hitsIn(a.render(2.4, clockFrom(edges)).gate!, bar2, bar2 + SIXTEENTH - 5)).toHaveLength(1);
    const ab = await withStep1(1); ab.setCtl('b_1', 4); ab.setIn('ab', 1);
    expect(hitsIn(ab.render(2.4, clockFrom(edges)).gate!, bar2, bar2 + SIXTEENTH - 5)).toHaveLength(4);
    const roll = await withStep1(0); roll.setCtl('rollstand', 3); roll.setIn('roll', 1);   // stand 6
    const rg = roll.render(2.4, clockFrom(edges)).gate!;
    expect(hitsIn(rg, bar2, bar2 + SIXTEENTH - 5)).toHaveLength(6);
    expect(hitsIn(rg, edges[20]!, edges[20]! + SIXTEENTH - 5)).toHaveLength(6);   // elke stap
    const cv = await withStep1(1); cv.setIn('ratchet_cv', 0.4);                // +2 standen: 1 → 3
    expect(hitsIn(cv.render(2.4, clockFrom(edges)).gate!, bar2, bar2 + SIXTEENTH - 5)).toHaveLength(3);
    const rest = await withStep1(0);
    expect(risingEdges(rest.render(2.4, clockFrom(edges)).gate!)).toHaveLength(0);
  });

  it('Thru komt erdoor; Reset begint bij stap 1; Length kort de lus in', async () => {
    const m = await withStep1(0);
    const thruAt = [500, 900];
    const o = m.render(1.2, (t, mm) => {
      clockFrom(edges)(t, mm);
      const ms = Math.round(t * 1000);
      mm.setIn('thru', thruAt.some((e) => ms >= e && ms < e + 5) ? 1 : 0);
    });
    expect(risingEdges(o.gate!)).toEqual(thruAt);

    const short = await withStep1(1);
    short.setCtl('length', 4);
    const g = short.render(2.4, clockFrom(edges)).gate!;
    // Stap 1 op elke vierde flank.
    expect(risingEdges(g).filter((e) => e < edges[16]!)).toEqual([0, 4, 8, 12].map((k) => edges[k]!));

    const reset = await withStep1(1);
    reset.render(0.35, clockFrom(edges));                 // drie stappen verder
    reset.setIn('clock', 0); reset.setIn('reset', 1); reset.render(0.005);
    reset.setIn('reset', 0);
    const after = reset.render(0.2, clockFrom([0, 107])).gate!;
    expect(risingEdges(after)[0]).toBe(0);                // stap 1 slaat meteen
  });

  it('zonder klok stil; de eerste stap na het starten speelt één slag', async () => {
    const m = await withStep1(5);
    expect(risingEdges(m.render(0.5).gate!)).toHaveLength(0);
    const first = await withStep1(5);
    const g = first.render(0.12, clockFrom(edges)).gate!;
    expect(risingEdges(g)).toEqual([0]);
  });
});
