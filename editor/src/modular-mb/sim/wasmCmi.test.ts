// FAIRLIGHT-stem tp_mmb_cmi (doc/plans/fairlight.md), doorgemeten in node:
// de 32 segmenten lopen na elkaar af (de klank verandert door de noot), een
// eigen tabel komt binnen via de blob, de lus houdt de klank vast zolang de
// toets ligt, en de zero-order hold geeft spiegelingen die met de toon
// meegaan.

import { describe, expect, it } from 'vitest';

import { type Mod, expectMatchesCatalog, load, peak, rms, toneLevel } from './wasmTestHost';

const SEGS = 32, N = 128;

/** Zet een tabel: per segment een functie van (segment, fase 0..1). */
function setTable(m: Mod, f: (s: number, p: number) => number): void {
  const ptr = m.ex.mmb_blob_ptr(0, SEGS * N * 2) as number;
  const d = new Int16Array(m.ex.memory.buffer, ptr, SEGS * N);
  for (let s = 0; s < SEGS; s++) for (let i = 0; i < N; i++) d[s * N + i] = Math.round(30000 * f(s, i / N));
  m.ex.mmb_blob_commit(0, SEGS * N, 0, 1);
}
const sine = (h: number) => (p: number) => Math.sin(2 * Math.PI * h * p);

async function voice(ctl: Record<string, number> = {}): Promise<Mod> {
  const m = await load('tp_mmb_cmi');
  for (const [k, v] of Object.entries(ctl)) m.setCtl(k, v);
  m.setIn('voct', -1); m.setIn('vel', 1); m.setIn('gate', 1);   // 130,8 Hz
  return m;
}

describe('tp_mmb_cmi', () => {
  it('draagt de namen van de catalogus', async () => { await expectMatchesCatalog('tp_mmb_cmi'); });

  it('klinkt meteen met het ingebouwde profiel, binnen de perken', async () => {
    const m = await voice();
    const x = m.render(1).out!;
    expect(rms(x, 4410)).toBeGreaterThan(0.05);
    expect(peak(x)).toBeLessThan(1);
    expect(toneLevel(x, 130.81, m.rate, 4410)).toBeGreaterThan(0.02);
  });

  it('loopt door de segmenten: de eerste helft grondtoon, de tweede het octaaf erboven', async () => {
    // Segment 0..15 = sinus op h1, 16..31 = sinus op h2; Seg 20 ms, geen lus.
    const m = await voice({ seg: 20, smooth: 0, loop: 32 });
    setTable(m, (s, p) => (s < 16 ? sine(1)(p) : sine(2)(p)));
    m.setIn('gate', 0); m.render(0.05); m.setIn('gate', 1);   // opnieuw aanslaan: vanaf segment 1
    const x = m.render(1).out!;
    const r = m.rate, f = 130.81;
    const early = [Math.round(0.03 * r), Math.round(0.28 * r)];   // segment ~1..14
    const late = [Math.round(0.4 * r), Math.round(0.9 * r)];      // voorbij segment 20, op 32 blijven
    expect(toneLevel(x, f, r, early[0], early[1])).toBeGreaterThan(5 * toneLevel(x, 2 * f, r, early[0], early[1]));
    expect(toneLevel(x, 2 * f, r, late[0], late[1])).toBeGreaterThan(5 * toneLevel(x, f, r, late[0], late[1]));
  });

  it('Pos loopt van 0 naar 1 en de lus houdt hem in het laatste stuk zolang de toets ligt', async () => {
    const m = await voice({ seg: 10, loop: 24 });
    const o = m.render(1.5);
    const pos = o.pos!;
    expect(pos[Math.round(0.05 * m.rate)]!).toBeLessThan(0.3);
    let lo = 1, hi = 0;
    for (let i = Math.round(0.5 * m.rate); i < pos.length; i++) { lo = Math.min(lo, pos[i]!); hi = Math.max(hi, pos[i]!); }
    expect(lo).toBeGreaterThan(22 / 31 - 0.02);       // loopt rond vanaf segment 24 …
    expect(hi).toBeGreaterThan(0.95);                 // … tot het eind
  });

  it('zero-order hold: een spiegeling op 128 × f − f, die met de toon meeschuift', async () => {
    // Grondtoon 65,4 Hz (voct −2): de klok is 8372 Hz, de spiegeling ligt op 8307 Hz.
    const m = await voice({ seg: 1000 });
    setTable(m, () => 0);
    setTable(m, (_s, p) => sine(1)(p));
    m.setIn('voct', -2);
    const x = m.render(0.6).out!;
    const f = 65.41, from = Math.round(0.1 * m.rate);
    expect(toneLevel(x, 128 * f - f, m.rate, from)).toBeGreaterThan(0.002);
    expect(toneLevel(x, 128 * f - f, m.rate, from)).toBeGreaterThan(5 * toneLevel(x, 128 * f - f + 300, m.rate, from));
  });
});
