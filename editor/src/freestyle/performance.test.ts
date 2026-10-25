import { describe, expect, it } from 'vitest';

import { DROP_DOWN_S, Performance, START_LEAD_S } from './performance';
import { TRAP, type Change } from './style';

const BEAT = 60 / TRAP.bpm;          // 140 bpm
const BAR = 4 * BEAT;
const PHRASE = 4 * BAR;

function started(now = 10): { perf: Performance; t0: number } {
  const perf = new Performance(TRAP);
  const f = perf.start(now);
  return { perf, t0: f.at };
}
/** Alles wat tot en met tijd `until` landt, in stappen van een halve tel. */
function runUntil(perf: Performance, from: number, until: number): ReturnType<Performance['tick']> {
  const out: ReturnType<Performance['tick']> = [];
  for (let t = from; t <= until + 1e-9; t += BEAT / 2) out.push(...perf.tick(t));
  return out;
}
const has = (changes: Change[], module: string, control: string, value: number | boolean): boolean =>
  changes.some((c) => c.module === module && c.control === control && c.value === value);

describe('Performance', () => {
  it('start zet de klok aan even na nu, met de standen van de eerste sectie', () => {
    const perf = new Performance(TRAP);
    const f = perf.start(10);
    expect(f.at).toBeCloseTo(10 + START_LEAD_S);
    expect(has(f.changes, 'clock', 'run', true)).toBe(true);
    expect(has(f.changes, 'snare', 'level', 0)).toBe(true);           // intro: geen snare
    expect(f.master).toEqual({ gain: 1, rampS: expect.any(Number) });
    expect(perf.running).toBe(true);
    expect(perf.section.name).toBe('INTRO');
    expect(perf.clock.position(f.at)).toMatchObject({ beat: 0, bar: 0, phrase: 0 });
  });

  it('DROP omlaag is direct en stil; los landt de terugkeer op de volgende tel', () => {
    const { perf, t0 } = started();
    const now = t0 + BEAT * 1.3;
    const down = perf.dropDown(now)!;
    expect(down.at).toBe(now);
    expect(down.master).toEqual({ gain: 0, rampS: DROP_DOWN_S });
    expect(perf.dropped).toBe(true);
    expect(perf.dropDown(now + 0.1)).toBeNull();                      // al stil
    perf.dropUp(now + 0.2);                                           // tel 1,3 + 0,2 s ≈ tel 1,77 → tel 2
    const fired = runUntil(perf, now, t0 + BEAT * 2.5);
    expect(fired).toHaveLength(1);
    expect(fired[0]!.at).toBeCloseTo(t0 + 2 * BEAT, 5);
    expect(fired[0]!.master?.gain).toBe(1);
    expect(perf.dropped).toBe(false);
  });

  it('een korte tik en dan vasthouden: de gewapende terugkeer vervalt, het blijft stil', () => {
    const { perf, t0 } = started();
    const now = t0 + BEAT * 1.2;
    perf.dropDown(now);
    perf.dropUp(now + 0.05);                                          // tik: terug op tel 2
    expect(perf.pendingLabels()).toEqual(['beat returns on the beat']);
    expect(perf.dropDown(now + 0.15)).toBeNull();                     // meteen weer vast
    expect(perf.pendingLabels()).toEqual([]);
    expect(runUntil(perf, now, t0 + BEAT * 3)).toEqual([]);           // niets komt terug
    expect(perf.dropped).toBe(true);
    perf.dropUp(t0 + BEAT * 3.1);
    expect(runUntil(perf, t0 + BEAT * 3.1, t0 + BEAT * 4.2)).toHaveLength(1);
    expect(perf.dropped).toBe(false);
  });

  it('NEXT landt op de 1 van de volgende frase, nog eens drukken schuift een sectie verder', () => {
    const { perf, t0 } = started();
    perf.next(t0 + BAR * 1.5);
    expect(perf.pendingLabels()).toEqual(['→ VERSE on the 1']);
    perf.next(t0 + BAR * 1.6);
    expect(perf.pendingLabels()).toEqual(['→ HOOK on the 1']);
    expect(runUntil(perf, t0, t0 + PHRASE - BEAT)).toEqual([]);
    const fired = runUntil(perf, t0 + PHRASE - BEAT / 2, t0 + PHRASE);
    expect(fired).toHaveLength(1);
    expect(fired[0]!.at).toBeCloseTo(t0 + PHRASE, 5);
    expect(perf.section.name).toBe('HOOK');
    expect(has(fired[0]!.changes, 'snare', 'level', 0.75)).toBe(true);
    expect(has(fired[0]!.changes, 'grids', 'hh', 0.85)).toBe(true);
  });

  it('wrapt van de laatste sectie terug naar de eerste', () => {
    const { perf, t0 } = started();
    const n = TRAP.sections.length;
    for (let i = 0; i < n; i++) {
      perf.next(t0 + i * PHRASE + BEAT);
      runUntil(perf, t0 + i * PHRASE + BEAT, t0 + (i + 1) * PHRASE);
    }
    expect(perf.sectionIndex).toBe(0);
  });

  it('een stem landt op de volgende maat; nog eens drukken annuleert', () => {
    const { perf, t0 } = started();
    expect(perf.stems.hats).toBe(true);
    perf.toggleStem('hats', t0 + BEAT);
    expect(perf.stemWillBe('hats')).toBe(false);
    expect(perf.pendingLabels()).toEqual(['HATS off next bar']);
    perf.toggleStem('hats', t0 + BEAT * 1.1);                        // annuleren
    expect(perf.pendingLabels()).toEqual([]);
    perf.toggleStem('hats', t0 + BEAT * 1.2);
    const fired = runUntil(perf, t0 + BEAT, t0 + BAR);
    expect(fired).toHaveLength(1);
    expect(fired[0]!.at).toBeCloseTo(t0 + BAR, 5);
    expect(fired[0]!.changes).toEqual([{ module: 'hat', control: 'level', value: 0 }]);
    expect(perf.stems.hats).toBe(false);
  });

  it('de kick-stem neemt de 808-sub mee', () => {
    const { perf, t0 } = started();
    perf.toggleStem('kick', t0 + BEAT);
    const fired = runUntil(perf, t0 + BEAT, t0 + BAR);
    expect(fired[0]!.changes.map((c) => `${c.module}=${c.value}`).sort()).toEqual(['bass=0', 'kick=0']);
  });

  it('een sectiewissel zet de stems van de sectie en vergeet een losse mute', () => {
    const { perf, t0 } = started();
    perf.toggleStem('hats', t0 + BEAT);
    runUntil(perf, t0 + BEAT, t0 + BAR);
    expect(perf.stems.hats).toBe(false);
    perf.next(t0 + BAR + BEAT);
    runUntil(perf, t0 + BAR + BEAT, t0 + PHRASE);
    expect(perf.section.name).toBe('VERSE');
    expect(perf.stems.hats).toBe(true);
  });

  it('FILL duurt één maat en zet daarna de Grids-standen van de sectie terug', () => {
    const { perf, t0 } = started();
    perf.fill(t0 + BEAT);
    perf.fill(t0 + BEAT * 1.1);                                       // tweede druk: genegeerd
    expect(perf.pendingLabels()).toEqual(['FILL next bar']);
    const on = runUntil(perf, t0 + BEAT, t0 + BAR);
    expect(on).toHaveLength(1);
    expect(has(on[0]!.changes, 'grids', 'hh', 0.95)).toBe(true);
    expect(perf.filling).toBe(true);
    expect(perf.pendingLabels()).toEqual(['fill ends next bar']);
    const off = runUntil(perf, t0 + BAR + BEAT / 2, t0 + 2 * BAR);
    expect(off).toHaveLength(1);
    expect(off[0]!.at).toBeCloseTo(t0 + 2 * BAR, 5);
    expect(has(off[0]!.changes, 'grids', 'hh', 0.5)).toBe(true);     // intro-stand
    expect(off[0]!.changes.every((c) => c.module === 'grids')).toBe(true);
    expect(perf.filling).toBe(false);
  });

  it('DROP en NEXT tegelijk: de drop komt op de tel terug, de sectie op de frase', () => {
    const { perf, t0 } = started();
    perf.next(t0 + PHRASE - BAR);
    perf.dropDown(t0 + PHRASE - BEAT * 1.5);
    perf.dropUp(t0 + PHRASE - BEAT * 1.4);                           // → tel vóór de frase
    const fired = runUntil(perf, t0 + PHRASE - BAR, t0 + PHRASE);
    expect(fired.map((f) => f.label)).toEqual(['beat back', '→ VERSE']);
    expect(fired[0]!.at).toBeCloseTo(t0 + PHRASE - BEAT, 5);
    expect(fired[1]!.at).toBeCloseTo(t0 + PHRASE, 5);
  });

  it('TAP verandert het tempo zonder sprong en de gewapende frase landt op de nieuwe tijd', () => {
    const { perf, t0 } = started();
    perf.next(t0 + BEAT);
    const f = perf.setBpm(70, t0 + 2 * BEAT);                        // halve snelheid vanaf tel 2
    expect(has(f.changes, 'clock', 'tempo', 70)).toBe(true);
    expect(perf.bpm).toBe(70);
    const expectAt = t0 + 2 * BEAT + 14 * (60 / 70);
    const fired = runUntil(perf, t0, expectAt + 0.01);
    expect(fired).toHaveLength(1);
    expect(fired[0]!.at).toBeCloseTo(expectAt, 4);
  });

  it('percussionist aan maakt de hats dunner, nu en in de volgende sectie', () => {
    const { perf, t0 } = started();
    const f = perf.setPercussionist(true, t0 + BEAT)!;
    expect(f.changes.find((c) => c.control === 'hh')?.value).toBeCloseTo(0.5 * 0.55, 3);
    expect(f.changes.every((c) => c.module === 'grids')).toBe(true);
    perf.next(t0 + BEAT);
    const next = runUntil(perf, t0 + BEAT, t0 + PHRASE);
    expect(next[0]!.changes.find((c) => c.module === 'grids' && c.control === 'hh')?.value).toBeCloseTo(0.7 * 0.55, 3);
    expect(perf.setPercussionist(true, t0)).toBeNull();
  });

  it('stop zet de klok uit en vergeet wat gewapend stond', () => {
    const { perf, t0 } = started();
    perf.next(t0 + BEAT);
    const f = perf.stop(t0 + 2 * BEAT);
    expect(has(f.changes, 'clock', 'run', false)).toBe(true);
    expect(perf.running).toBe(false);
    expect(perf.pendingLabels()).toEqual([]);
    expect(perf.tick(t0 + PHRASE)).toEqual([]);
  });
});
