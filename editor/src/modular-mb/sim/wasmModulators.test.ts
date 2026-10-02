// Het modulatorpakket van 2026-10-02, doorgemeten in node: S&H, Clock,
// Euclid, Turing, Branches, Chaos, LFO-8, Slope en Logic. Het zijn
// firmware-CvModules die via cvhost.h als wasm draaien (1 kHz, blok 1), dus
// wat hier slaagt is het gedrag van de klasse die ook op de Teensy draait.
//
// Per module: dragen poorten en controls de namen van de catalogus, en doet
// hij aantoonbaar wat het paneel belooft.

import { describe, expect, it } from 'vitest';

import { type Mod, expectMatchesCatalog, load, maxOf, minOf, peak, risingEdges } from './wasmTestHost';

describe('tp_mmb_sh', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_sh'); });

  it('S&H neemt alleen op de flank over; T&H volgt zolang de trigger hoog is', async () => {
    const m = await load('tp_mmb_sh');
    m.setIn('in', 0.3); m.setIn('trig', 1);
    expect(m.render(0.01).out![9]).toBeCloseTo(0.3, 5);
    m.setIn('in', 0.8);                       // trigger blijft hoog: geen nieuwe flank
    expect(m.render(0.01).out![9]).toBeCloseTo(0.3, 5);
    m.setIn('trig', 0); m.render(0.01);
    m.setIn('trig', 1);
    expect(m.render(0.01).out![9]).toBeCloseTo(0.8, 5);
    m.setCtl('mode', 1);                      // T&H: hoog = volgen
    m.setIn('in', -0.4);
    expect(m.render(0.01).out![9]).toBeCloseTo(-0.4, 5);
    m.setIn('trig', 0); m.setIn('in', 0.9);
    expect(m.render(0.01).out![9]).toBeCloseTo(-0.4, 5);
  });

  it('zonder kabel in In is de bron ruis: elke trigger een andere waarde binnen ±1', async () => {
    const m = await load('tp_mmb_sh');
    const out = m.render(2, (t, mm) => mm.setIn('trig', Math.floor(t * 40 + 1e-6) % 2 === 0 ? 1 : 0)).out!;  // 20 flanken/s
    const values = new Set<number>();
    for (let i = 10; i < out.length; i += 50) values.add(out[i]!);
    expect(values.size).toBeGreaterThan(35);
    expect(peak(out)).toBeLessThanOrEqual(1);
  });

  it('Slew volgt de ingang met de tijdconstante', async () => {
    const m = await load('tp_mmb_sh');
    m.setCtl('mode', 2); m.setCtl('slew', 100);
    m.setIn('in', 1);
    const out = m.render(0.3).out!;
    expect(out[99]!).toBeGreaterThan(0.58);
    expect(out[99]!).toBeLessThan(0.68);
    expect(out[299]!).toBeGreaterThan(0.94);
  });
});

describe('tp_mmb_clock', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_clock'); });

  it('leidt alle delingen af van één fase', async () => {
    const m = await load('tp_mmb_clock');       // 120 bpm
    const o = m.render(4);
    expect(risingEdges(o.beat!).length).toBe(8);
    expect(risingEdges(o.bar!).length).toBe(2);
    expect(risingEdges(o.x2!).length).toBe(16);
    expect(risingEdges(o.x3!).length).toBe(24);
    expect(risingEdges(o.x4!).length).toBe(32);
    expect(risingEdges(o.div!)).toHaveLength(6); // elke 6 zestienden: 0, 6, .. 30
    // De één: alles tegelijk hoog op de eerste tick en op elke maat.
    for (const name of ['bar', 'beat', 'x2', 'x3', 'x4', 'div']) expect(o[name]![0], name).toBe(1);
    expect(Math.abs(risingEdges(o.bar!)[1]! - 2000)).toBeLessThanOrEqual(1);
    // Maatzaag: 0 naar 1 in twee seconden.
    expect(o.ramp![0]).toBeCloseTo(0, 3);
    expect(o.ramp![1000]).toBeCloseTo(0.5, 2);
    expect(o.ramp![1990]).toBeGreaterThan(0.98);
  });

  it('swing schuift elke tweede zestiende op; tempo-CV verdubbelt; reset gaat naar de één', async () => {
    const m = await load('tp_mmb_clock');
    m.setCtl('swing', 1);
    const swung = risingEdges(m.render(1).x4!);
    expect(swung[0]).toBe(0);
    expect(Math.abs(swung[1]! - 167)).toBeLessThanOrEqual(2);   // 2/3 van een achtste (250 ms)
    expect(Math.abs(swung[2]! - 250)).toBeLessThanOrEqual(2);
    const fast = await load('tp_mmb_clock');
    fast.setIn('tempo_cv', 1);
    expect(risingEdges(fast.render(4).beat!).length).toBe(16);
    const r = await load('tp_mmb_clock');
    r.render(0.3);                             // midden in een tel
    r.setIn('reset', 1);
    const after = r.render(0.01);
    expect(after.bar![1]).toBe(1);
    expect(after.ramp![1]).toBeLessThan(0.01);
  });

  it('staat stil met Run uit', async () => {
    const m = await load('tp_mmb_clock');
    m.setCtl('run', 0);
    expect(risingEdges(m.render(1).x4!).length).toBe(0);
  });
});

/** Leest een patroon van `count` stappen uit een gate bij 300 bpm (50 ms per stap). */
const stepPattern = (gate: Float32Array, count: number): string =>
  Array.from({ length: count }, (_, k) => (gate[k * 50 + 10]! >= 0.5 ? 'x' : '.')).join('');

describe('tp_mmb_euclid', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_euclid'); });

  it('maakt de bekende Euclidische patronen', async () => {
    const m = await load('tp_mmb_euclid');
    m.setCtl('tempo', 300);
    m.setCtl('steps_1', 8); m.setCtl('fill_1', 3); m.setCtl('rot_1', 0);   // tresillo
    m.setCtl('steps_2', 8); m.setCtl('fill_2', 5); m.setCtl('rot_2', 6);   // cinquillo
    m.setCtl('steps_3', 16); m.setCtl('fill_3', 4); m.setCtl('rot_3', 2);  // vier op de vloer, twee later
    const o = m.render(0.8);
    const tresillo = 'x..x..x.x..x..x.', cinquillo = 'x.xx.xx.x.xx.xx.', floor = '..x...x...x...x.';
    expect(stepPattern(o.out_1!, 16)).toBe(tresillo);
    expect(stepPattern(o.out_2!, 16)).toBe(cinquillo);
    expect(stepPattern(o.out_3!, 16)).toBe(floor);
    const any = Array.from({ length: 16 }, (_, i) =>
      tresillo[i] === 'x' || cinquillo[i] === 'x' || floor[i] === 'x' ? 'x' : '.').join('');
    expect(stepPattern(o.any!, 16)).toBe(any);
  });

  it('volgt een externe klok, Fill-CV maakt het dichter en Reset begint opnieuw', async () => {
    const m = await load('tp_mmb_euclid');
    m.setCtl('extclock', 1);
    m.setCtl('steps_1', 8); m.setCtl('fill_1', 2); m.setCtl('rot_1', 0);
    const clock = (t: number, mm: Mod): void => mm.setIn('clock', Math.floor(t * 40 + 1e-6) % 2 === 0 ? 1 : 0); // 50 ms per stap
    expect(stepPattern(m.render(0.4, clock).out_1!, 8)).toBe('x...x...');
    m.setIn('reset', 1); m.setIn('clock', 0); m.render(0.02);
    m.setIn('reset', 0);
    m.setIn('fill_1_cv', 0.25);               // +2 slagen op 8 stappen
    expect(stepPattern(m.render(0.4, clock).out_1!, 8)).toBe('x.x.x.x.');
    // Zonder klok geen slagen.
    const still = await load('tp_mmb_euclid');
    still.setCtl('extclock', 1);
    expect(peak(still.render(0.5).any!)).toBe(0);
  });
});

/** De CV per stap bij 300 bpm (50 ms per stap). */
const stepValues = (cv: Float32Array, count: number): number[] =>
  Array.from({ length: count }, (_, k) => cv[k * 50 + 25]!);

describe('tp_mmb_turing', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_turing'); });

  const locked = async (): Promise<Mod> => {
    const m = await load('tp_mmb_turing');
    m.setCtl('tempo', 300); m.setCtl('change', 0); m.setCtl('length', 5); m.setCtl('range', 3);
    return m;
  };

  it('op slot herhaalt de lus elke Length stappen, binnen Range', async () => {
    const o = (await locked()).render(2);
    const cv = stepValues(o.cv!, 40);
    for (let k = 16; k < 35; k++) expect(cv[k]).toBeCloseTo(cv[k + 5]!, 6);
    expect(new Set(cv.slice(16, 21)).size).toBeGreaterThan(2);
    expect(Math.max(...cv)).toBeLessThanOrEqual(3);
    expect(Math.min(...cv)).toBeGreaterThanOrEqual(0);
    expect(risingEdges(o.pulse!).length).toBeGreaterThan(5);
    // CV2 is dezelfde lijn acht stappen later.
    const cv2 = stepValues(o.cv2!, 40);
    for (let k = 8; k < 39; k++) expect(cv2[k]).toBeCloseTo(cv[k - 8]!, 6);
  });

  it('Reset geeft dezelfde lus terug, ook nadat hij veranderd is', async () => {
    const m = await locked();
    const first = stepValues(m.render(1).cv!, 20);
    m.setCtl('change', 0.5); m.render(2);       // laat hem afdwalen
    m.setCtl('change', 0);
    m.setIn('reset', 1); m.render(0.003); m.setIn('reset', 0);
    const again = stepValues(m.render(1.2).cv!, 24);
    // Na de reset begint de interne klok opnieuw; zoek het begin van de lus.
    const offset = [0, 1].find((shift) => first.slice(0, 15).every((v, i) => Math.abs(v - again[i + shift]!) < 1e-6));
    expect(offset).not.toBeUndefined();
  });

  it('Change 1 verdubbelt de lus; Change 0,5 herhaalt niet', async () => {
    const m = await load('tp_mmb_turing');
    m.setCtl('tempo', 300); m.setCtl('change', 1); m.setCtl('length', 4);
    const cv = stepValues(m.render(3).cv!, 60);
    for (let k = 20; k < 50; k++) expect(cv[k]).toBeCloseTo(cv[k + 8]!, 6);
    expect(cv.slice(20, 40).some((v, i) => Math.abs(v - cv[20 + i + 4]!) > 1e-6)).toBe(true);
    const r = await load('tp_mmb_turing');
    r.setCtl('tempo', 300); r.setCtl('change', 0.5); r.setCtl('length', 4);
    const wild = stepValues(r.render(3).cv!, 60);
    expect(wild.slice(20, 50).some((v, i) => Math.abs(v - wild[20 + i + 4]!) > 1e-6)).toBe(true);
    expect(wild.slice(20, 50).some((v, i) => Math.abs(v - wild[20 + i + 8]!) > 1e-6)).toBe(true);
  });
});

describe('tp_mmb_branches', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_branches'); });

  const run = async (set: (m: Mod) => void, seconds = 8): Promise<{ a: number[]; b: number[]; o: Record<string, Float32Array> }> => {
    const m = await load('tp_mmb_branches');
    set(m);
    const o = m.render(seconds, (t, mm) => mm.setIn('in', Math.floor(t * 100 + 1e-6) % 2 === 0 ? 1 : 0)); // 50 triggers/s
    return { a: risingEdges(o.a!), b: risingEdges(o.b!), o };
  };

  it('verdeelt triggers volgens de kans', async () => {
    const allA = await run((m) => m.setCtl('p', 0));
    expect(allA.a.length).toBe(400); expect(allA.b.length).toBe(0);
    const allB = await run((m) => m.setCtl('p', 1));
    expect(allB.a.length).toBe(0); expect(allB.b.length).toBe(400);
    const half = await run((m) => m.setCtl('p', 0.5));
    expect(half.a.length + half.b.length).toBe(400);
    expect(half.b.length).toBeGreaterThan(160); expect(half.b.length).toBeLessThan(240);
    const quarter = await run((m) => { m.setCtl('p', 0); m.setIn('p_cv', 0.25); });
    expect(quarter.b.length).toBeGreaterThan(60); expect(quarter.b.length).toBeLessThan(140);
  });

  it('Toggle met P = 1 wisselt om en om; Latch houdt de gekozen kant hoog', async () => {
    const alt = await run((m) => { m.setCtl('p', 1); m.setCtl('toggle', 1); });
    expect(alt.a.length).toBe(200); expect(alt.b.length).toBe(200);
    const latched = await run((m) => { m.setCtl('p', 0); m.setCtl('latch', 1); }, 1);
    expect(latched.a.length).toBe(1);                  // één keer omhoog en dan hoog blijven
    expect(latched.o.a![latched.o.a!.length - 1]).toBe(1);
    // Met Latch altijd precies één kant tegelijk.
    const half = await run((m) => { m.setCtl('p', 0.5); m.setCtl('latch', 1); }, 2);
    for (let i = 5; i < half.o.a!.length; i++) expect(half.o.a![i]! + half.o.b![i]!).toBe(1);
  });
});

describe('tp_mmb_chaos', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_chaos'); });

  const spread = (a: Float32Array): number => {
    let mean = 0; for (const v of a) mean += v; mean /= a.length;
    let s = 0; for (const v of a) s += (v - mean) * (v - mean);
    return Math.sqrt(s / a.length);
  };

  it('Lorenz blijft begrensd, bezoekt beide lobben en doet dat onregelmatig', async () => {
    const m = await load('tp_mmb_chaos');
    m.setCtl('rate', 4);
    const o = m.render(60);
    for (const axis of ['x', 'y', 'z']) {
      expect(o[axis]!.every(Number.isFinite)).toBe(true);
      expect(peak(o[axis]!)).toBeLessThanOrEqual(1);
      expect(peak(o[axis]!)).toBeGreaterThan(0.6);
      expect(spread(o[axis]!)).toBeGreaterThan(0.15);
    }
    const edges = risingEdges(o.gate!);
    expect(edges.length).toBeGreaterThan(8);
    const gaps = edges.slice(1).map((e, i) => e - edges[i]!);
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeGreaterThan(1.5);
  });

  it('Reset begint opnieuw op dezelfde baan', async () => {
    const m = await load('tp_mmb_chaos');
    m.setCtl('rate', 2);
    m.setIn('reset', 1); m.render(0.002); m.setIn('reset', 0);
    const first = m.render(5).x!;
    m.setIn('reset', 1); m.render(0.002); m.setIn('reset', 0);
    const second = m.render(5).x!;
    expect(Array.from(second)).toEqual(Array.from(first));
  });

  it('Rössler en Thomas bewegen begrensd; unipolair blijft boven nul; rate-CV versnelt', async () => {
    for (const model of [1, 2]) {
      const m = await load('tp_mmb_chaos');
      m.setCtl('model', model); m.setCtl('rate', 5);
      const o = m.render(40);
      for (const axis of ['x', 'y', 'z']) {
        expect(o[axis]!.every(Number.isFinite), `model ${model} ${axis}`).toBe(true);
        expect(peak(o[axis]!), `model ${model} ${axis}`).toBeLessThanOrEqual(1);
      }
      expect(spread(o.x!), `model ${model}`).toBeGreaterThan(0.15);
      expect(peak(o.x!), `model ${model}`).toBeGreaterThan(0.4);
    }
    const uni = await load('tp_mmb_chaos');
    uni.setCtl('bipolar', 0); uni.setCtl('rate', 4); uni.setCtl('depth', 0.5);
    const ux = uni.render(20).x!;
    expect(minOf(ux)).toBeGreaterThanOrEqual(0);
    expect(maxOf(ux)).toBeLessThanOrEqual(0.5);
    const slow = await load('tp_mmb_chaos'), fast = await load('tp_mmb_chaos');
    slow.setCtl('rate', 1); fast.setCtl('rate', 1); fast.setIn('rate_cv', 0.5);   // +2 octaven
    const crossings = (a: Float32Array): number => {
      let n = 0;
      for (let i = 1; i < a.length; i++) if ((a[i - 1]! < 0) !== (a[i]! < 0)) n++;
      return n;
    };
    expect(crossings(fast.render(30).y!)).toBeGreaterThan(crossings(slow.render(30).y!) * 2);
  });

  it('blijft eindig bij uitersten en ongeldige invoer', async () => {
    const m = await load('tp_mmb_chaos');
    m.setCtl('rate', 20); m.setCtl('shape', 1);
    const o = m.render(10, (t, mm) => mm.setIn('rate_cv', t < 5 ? 100 : Number.NaN));
    for (const axis of ['x', 'y', 'z']) expect(o[axis]!.every(Number.isFinite)).toBe(true);
  });
});

describe('tp_mmb_lfo8', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_lfo8'); });

  const cycles = (a: Float32Array): number => {
    let n = 0;
    for (let i = 1; i < a.length; i++) if (a[i - 1]! < 0 && a[i]! >= 0) n++;
    return n;
  };

  it('geeft acht LFO’s van snel naar traag in de verhouding Spread', async () => {
    const m = await load('tp_mmb_lfo8');
    m.setCtl('rate', 2); m.setCtl('spread', 2);
    const o = m.render(40);
    expect(cycles(o.out_1!)).toBeGreaterThanOrEqual(79);
    expect(cycles(o.out_1!)).toBeLessThanOrEqual(81);
    let previous = Infinity;
    for (let k = 1; k <= 8; k++) {
      const count = cycles(o[`out_${k}`]!);
      expect(count, `out_${k}`).toBeLessThan(previous);
      previous = count;
      expect(peak(o[`out_${k}`]!), `out_${k}`).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(cycles(o.out_3!) - 80 / 4 * 1.043)).toBeLessThanOrEqual(1.5);
    expect(peak(o.out_1!)).toBeGreaterThan(0.98);
  });

  it('Shape maakt van de driehoek een sinus; unipolair en Depth schalen; Reset zet de fase op nul', async () => {
    const tri = await load('tp_mmb_lfo8'), sine = await load('tp_mmb_lfo8');
    sine.setCtl('shape', 1);
    const a = tri.render(1).out_1!, b = sine.render(1).out_1!;
    expect(a[124]).toBeCloseTo(0.5, 2);                       // driehoek: halverwege de flank
    expect(b[124]).toBeCloseTo(Math.sin(Math.PI / 4), 2);     // sinus op 45 graden
    const uni = await load('tp_mmb_lfo8');
    uni.setCtl('bipolar', 0); uni.setCtl('depth', 0.5);
    const u = uni.render(2).out_1!;
    expect(minOf(u)).toBeGreaterThanOrEqual(0);
    expect(maxOf(u)).toBeLessThanOrEqual(0.5);
    expect(maxOf(u)).toBeGreaterThan(0.48);
    tri.setIn('reset', 1);
    const reset = tri.render(0.003);
    for (let k = 1; k <= 8; k++) expect(Math.abs(reset[`out_${k}`]![1]!)).toBeLessThan(0.02);
  });
});

describe('tp_mmb_slope', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_slope'); });

  const trigger = (t: number, mm: Mod): void => mm.setIn('trig', t < 0.01 ? 1 : 0);
  const indexOfMax = (a: Float32Array): number => a.indexOf(maxOf(a));

  it('een trigger geeft een AD-envelope met EOR en EOC', async () => {
    const m = await load('tp_mmb_slope');
    m.setCtl('rise', 0.1); m.setCtl('fall', 0.3);
    const o = m.render(0.6, trigger);
    const top = indexOfMax(o.out!);
    expect(Math.abs(top - 100)).toBeLessThanOrEqual(3);
    expect(o.out![top]).toBeCloseTo(1, 3);
    expect(o.out![50]).toBeCloseTo(0.5, 1);
    expect(o.out![250]).toBeCloseTo(0.5, 1);
    expect(o.out![450]).toBe(0);
    expect(o.inv![top]).toBeCloseTo(0, 3);
    expect(o.eor![50]).toBe(0); expect(o.eor![250]).toBe(1); expect(o.eor![450]).toBe(0);
    const eoc = risingEdges(o.eoc!);
    expect(eoc).toHaveLength(1);
    expect(Math.abs(eoc[0]! - 400)).toBeLessThanOrEqual(4);
  });

  it('Cycle maakt er een LFO van; Time-CV rekt de periode', async () => {
    const m = await load('tp_mmb_slope');
    m.setCtl('rise', 0.1); m.setCtl('fall', 0.3); m.setCtl('cycle', 1);
    const count = risingEdges(m.render(4).eoc!).length;
    expect(count).toBeGreaterThanOrEqual(9); expect(count).toBeLessThanOrEqual(10);
    const slow = await load('tp_mmb_slope');
    slow.setCtl('rise', 0.1); slow.setCtl('fall', 0.3); slow.setCtl('cycle', 1);
    slow.setIn('time_cv', 1 / 3);              // twee keer zo lang
    const slowCount = risingEdges(slow.render(4).eoc!).length;
    expect(slowCount).toBeGreaterThanOrEqual(4); expect(slowCount).toBeLessThanOrEqual(5);
  });

  it('volgt de ingang met aparte stijg- en daaltijd (ASR, lag)', async () => {
    const m = await load('tp_mmb_slope');
    m.setCtl('rise', 0.05); m.setCtl('fall', 0.2);
    const o = m.render(0.6, (t, mm) => mm.setIn('in', t < 0.3 ? 0.8 : 0));
    expect(o.out![100]).toBeCloseTo(0.8, 3);    // gestegen en vastgehouden op het niveau van de gate
    expect(o.out![290]).toBeCloseTo(0.8, 3);
    expect(o.out![380]).toBeCloseTo(0.4, 1);    // halverwege de daling van 0,8 (0,2 s per volle slag)
    expect(o.out![480]).toBe(0);
  });

  it('Shape buigt de lijn zonder de slagtijd veel te veranderen', async () => {
    const half = async (shape: number): Promise<{ mid: number; top: number }> => {
      const m = await load('tp_mmb_slope');
      m.setCtl('rise', 0.2); m.setCtl('fall', 5); m.setCtl('shape', shape);
      const out = m.render(0.5, trigger).out!;
      return { mid: out[100]!, top: indexOfMax(out) };
    };
    const log = await half(-1), lin = await half(0), exp = await half(1);
    expect(log.mid).toBeGreaterThan(0.75);
    expect(lin.mid).toBeCloseTo(0.5, 1);
    expect(exp.mid).toBeLessThan(0.25);
    for (const r of [log, exp]) { expect(r.top).toBeGreaterThan(150); expect(r.top).toBeLessThan(260); }
  });
});

describe('tp_mmb_logic', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_logic'); });

  it('rekent min/max, logica, vergelijker, gelijkrichter en omkering uit', async () => {
    const m = await load('tp_mmb_logic');
    const at = (a: number, b: number): Record<string, number> => {
      m.setIn('a', a); m.setIn('b', b);
      const o = m.render(0.005);
      return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v[4]!]));
    };
    const r = at(0.8, 0.2);
    expect(r.min).toBeCloseTo(0.2, 6); expect(r.max).toBeCloseTo(0.8, 6);
    expect(r.and).toBe(0); expect(r.or).toBe(1); expect(r.xor).toBe(1); expect(r.gt).toBe(1);
    expect(r.abs).toBeCloseTo(0.8, 6); expect(r.inv).toBeCloseTo(-0.8, 6);
    const both = at(0.9, 1);
    expect(both.and).toBe(1); expect(both.xor).toBe(0); expect(both.gt).toBe(0);
    const negative = at(-0.6, -0.9);
    expect(negative.abs).toBeCloseTo(0.6, 6); expect(negative.inv).toBeCloseTo(0.6, 6);
    expect(negative.or).toBe(0); expect(negative.gt).toBe(1);
  });

  it('vergelijkt A met Thresh als B los is: van een CV een gate', async () => {
    const m = await load('tp_mmb_logic');
    m.setCtl('thresh', 0.25);
    const o = m.render(2, (t, mm) => mm.setIn('a', Math.sin(2 * Math.PI * 2 * t)));
    expect(risingEdges(o.gt!).length).toBe(4);
    let high = 0; for (const v of o.gt!) high += v;
    expect(high / o.gt!.length).toBeGreaterThan(0.38);       // sinus boven 0,25: ~42 % van de tijd
    expect(high / o.gt!.length).toBeLessThan(0.46);
  });
});

// ── Testbediening (2026-10-02): drukknoppen, schuiven, draaiknoppen ──

describe('tp_mmb_pads', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_pads'); });

  it('gate zolang ingedrukt, trigger van 10 ms bij elke druk, Any', async () => {
    const m = await load('tp_mmb_pads');
    const o = m.render(0.3, (t, mm) => mm.setCtl('b2', t >= 0.05 && t < 0.2 ? 1 : 0));
    expect(o.gate_2![40]).toBe(0);
    expect(o.gate_2![60]).toBe(1);
    expect(o.gate_2![190]).toBe(1);
    expect(o.gate_2![210]).toBe(0);
    expect(risingEdges(o.trig_2!)).toEqual([50]);
    let high = 0; for (const v of o.trig_2!) high += v;
    expect(high).toBe(10);
    expect(o.any![100]).toBe(1);
    expect(peak(o.gate_1!)).toBe(0);
  });

  it('Latch wisselt bij elke druk', async () => {
    const m = await load('tp_mmb_pads');
    m.setCtl('latch3', 1);
    const o = m.render(0.6, (t, mm) => mm.setCtl('b3', (t >= 0.05 && t < 0.1) || (t >= 0.3 && t < 0.35) ? 1 : 0));
    expect(o.gate_3![200]).toBe(1);                 // na de eerste druk blijft hij hoog
    expect(o.gate_3![500]).toBe(0);                 // de tweede zet hem uit
    expect(risingEdges(o.trig_3!)).toHaveLength(2);
  });
});

describe('tp_mmb_faders en tp_mmb_knobs', () => {
  it('dragen de namen van de catalogus', async () => {
    await expectMatchesCatalog('tp_mmb_faders');
    await expectMatchesCatalog('tp_mmb_knobs');
  });

  it('de uitgang volgt de schuif met slew, maal Range; schuiven blijven boven nul, knoppen niet', async () => {
    const faders = await load('tp_mmb_faders');
    faders.setCtl('slew', 0); faders.setCtl('v1', 0.4); faders.setCtl('v4', -1);
    let o = faders.render(0.01);
    expect(o.out_1![5]).toBeCloseTo(0.4, 5);
    expect(o.out_4![5]).toBe(0);                    // 0..1: niet negatief
    faders.setCtl('range', 2);
    expect(faders.render(0.01).out_1![5]).toBeCloseTo(2, 5);
    faders.setCtl('range', 0); faders.setCtl('slew', 100); faders.setCtl('v2', 1);
    o = faders.render(0.3);
    expect(o.out_2![99]).toBeGreaterThan(0.58);
    expect(o.out_2![99]).toBeLessThan(0.68);
    const knobs = await load('tp_mmb_knobs');
    knobs.setCtl('slew', 0); knobs.setCtl('v3', -0.5); knobs.setCtl('range', 1);
    expect(knobs.render(0.01).out_3![5]).toBeCloseTo(-1, 5);
  });
});
