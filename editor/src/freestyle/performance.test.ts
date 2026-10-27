import { describe, expect, it } from 'vitest';

import { DROP_DOWN_S, Performance, START_LEAD_S, abChanges } from './performance';
import { ACID_HOP_2, TRAP, type Change } from './style';

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

  it('kick en bas zijn aparte stems', () => {
    const { perf, t0 } = started();
    perf.toggleStem('kick', t0 + BEAT);
    perf.toggleStem('bass', t0 + BEAT);
    const fired = runUntil(perf, t0 + BEAT, t0 + BAR);
    expect(fired.map((f) => f.changes.map((c) => `${c.module}=${c.value}`).join())).toEqual(['kick=0', 'bass=0']);
    expect(perf.stems).toMatchObject({ kick: false, bass: false, hats: true });
  });

  it('vraag en antwoord: een sectie met B-maat wisselt per maat, zonder B-maat gebeurt er niets', () => {
    // TRAP heeft geen B-maat: de maatwissels leveren geen pakketjes.
    const { perf, t0 } = started();
    expect(runUntil(perf, t0, t0 + 2 * BAR + BEAT)).toEqual([]);
    // Acid hop II: INTRO zonder B, VERSE met B: na NEXT wisselt de bas per maat.
    const p2 = new Performance(ACID_HOP_2);
    const beat2 = 60 / ACID_HOP_2.bpm, bar2 = 4 * beat2, phrase2 = 4 * bar2;
    const s0 = p2.start(10).at;
    const run = (from: number, until: number): ReturnType<Performance['tick']> => {
      const out: ReturnType<Performance['tick']> = [];
      for (let t = from; t <= until + 1e-9; t += beat2 / 2) out.push(...p2.tick(t));
      return out;
    };
    // INTRO: de e-piano wisselt al A/B (Cm, dan de kwint C+G), de bas nog niet.
    const intro = run(s0, s0 + 2 * bar2 + beat2);
    expect(intro.map((f) => f.changes.map((c) => `${c.module}.${c.control}=${c.value}`).join())).toEqual(['chord.chord=9', 'chord.chord=1']);
    expect(p2.hasAb).toBe(true);
    p2.next(s0 + 2 * bar2 + beat2);
    const fired = run(s0 + 2 * bar2 + beat2, s0 + phrase2 + 2 * bar2 + beat2);
    expect(p2.section.name).toBe('VERSE');
    expect(p2.hasAb).toBe(true);
    // Op de 1 van de frase (maat 4, even) landt met de sectie ook de A-maat; dan B, A.
    const ab = fired.filter((f) => f.label === '' && f.at >= s0 + phrase2 - 1e-6);   // (maat 3 is nog de INTRO-B van de e-piano)
    expect(ab.map((f) => f.at.toFixed(3))).toEqual([0, 1, 2].map((n) => (s0 + phrase2 + n * bar2).toFixed(3)));
    const fill1 = (f: Change[]): unknown => f.find((c) => c.module === 'bassGate' && c.control === 'fill_1')?.value;
    const s6 = (f: Change[]): unknown => f.find((c) => c.module === 'bassSeq' && c.control === 's6')?.value;
    expect([fill1(ab[0]!.changes), s6(ab[0]!.changes)]).toEqual([5, 8]);   // A: [14,5,0], … A♭
    expect([fill1(ab[1]!.changes), s6(ab[1]!.changes)]).toEqual([1, 0]);   // B: [6,1,0] + …, … C
    expect([fill1(ab[2]!.changes), s6(ab[2]!.changes)]).toEqual([5, 8]);   // A
    // abChanges zelf: oneven = B, even = de A-waarden van dezelfde knoppen.
    const verse = ACID_HOP_2.sections[1]!;
    expect(abChanges(verse, 3)).toBe(verse.b);
    expect(abChanges(verse, 4)).toHaveLength(verse.b!.length);
    expect(abChanges(ACID_HOP_2.sections[0]!, 1)).toEqual([{ module: 'chord', control: 'chord', value: 9 }]);
    expect(abChanges(TRAP.sections[1]!, 1)).toEqual([]);
  });

  it('Autopilot: in de derde frase valt de bas de laatste maat weg en komt op de 1 terug', () => {
    const perf = new Performance(TRAP);
    perf.setAutopilot(true, 0);
    const t0 = perf.start(10).at;
    const fired = runUntil(perf, t0, t0 + 3 * PHRASE + BEAT);
    const out = fired.find((f) => f.label === 'autopilot · bass out')!;
    expect(out.at).toBeCloseTo(t0 + 2 * PHRASE + 3 * BAR, 4);
    expect(out.changes).toEqual([{ module: 'bass', control: 'level', value: 0 }]);
    const back = fired.find((f) => f.label === 'autopilot · all back')!;
    expect(back.at).toBeCloseTo(t0 + 3 * PHRASE, 4);
    expect(back.changes).toEqual([{ module: 'bass', control: 'level', value: 0.7 }]);
    expect(perf.stems.bass).toBe(true);                               // de knop stond al die tijd aan
  });

  it('Autopilot: de achtste frase begint met twee maten alleen bas en hats; zelf uitgezet blijft uit', () => {
    const perf = new Performance(TRAP);
    perf.setAutopilot(true, 0);
    const t0 = perf.start(10).at;
    perf.toggleStem('motif', t0 + BEAT);                              // de rapper zet het motief zelf uit
    const fired = runUntil(perf, t0, t0 + 7 * PHRASE + 2 * BAR + BEAT);
    const down = fired.find((f) => f.label === 'autopilot · phrase 8')!;
    // INTRO heeft geen snare en het motief staat zelf uit: alleen de kick gaat tijdelijk weg.
    expect(down.changes.filter((c) => c.control === 'level').map((c) => `${c.module}=${c.value}`)).toEqual(['kick=0']);
    // (De eerste "all back" op de 1 van frase 8 is de bas uit frase 7; de breakdown eindigt twee maten later.)
    const back = fired.find((f) => f.label === 'autopilot · all back' && f.at > t0 + 7 * PHRASE + BEAT)!;
    expect(back.at).toBeCloseTo(t0 + 7 * PHRASE + 2 * BAR, 4);
    expect(back.changes.map((c) => `${c.module}=${c.value}`)).toEqual(['kick=0.9']);
    expect(perf.stems.motif).toBe(false);
  });

  it('Autopilot uit tijdens een tijdelijke mute zet de stem meteen terug; NEXT ook', () => {
    const perf = new Performance(TRAP);
    perf.setAutopilot(true, 0);
    const t0 = perf.start(10).at;
    runUntil(perf, t0, t0 + 2 * PHRASE + 3 * BAR + BEAT);            // de bas is net weg
    const off = perf.setAutopilot(false, t0 + 2 * PHRASE + 3 * BAR + BEAT)!;
    expect(off.changes).toContainEqual({ module: 'bass', control: 'level', value: 0.7 });
    expect(runUntil(perf, t0 + 2 * PHRASE + 3 * BAR + BEAT, t0 + 4 * PHRASE)).toEqual([]);
    // En met NEXT: de sectie zet alle niveaus, de terugkeer vervalt.
    const perf2 = new Performance(TRAP);
    perf2.setAutopilot(true, 0);
    const s0 = perf2.start(10).at;
    perf2.next(s0 + 2 * PHRASE + 3 * BAR + BEAT);
    const fired = runUntil(perf2, s0, s0 + 3 * PHRASE + BEAT);
    expect(fired.map((f) => f.label)).toContain('autopilot · bass out');
    expect(fired.map((f) => f.label)).not.toContain('autopilot · all back');
    expect(fired.find((f) => f.label === '→ VERSE')!.changes).toContainEqual({ module: 'bass', control: 'level', value: 0.7 });
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

  it('STOP speelt een einde-fill op de volgende maat en stopt na die maat', () => {
    const { perf, t0 } = started();
    perf.next(t0 + BEAT);                                             // vervalt door het einde
    expect(perf.stop(t0 + 2 * BEAT)).toBeNull();
    expect(perf.ending).toBe(true);
    expect(perf.pendingLabels()).toEqual(['FILL next bar', 'ending — fill, then stop']);
    const fired = runUntil(perf, t0 + 2 * BEAT, t0 + 2 * BAR + BEAT);
    expect(fired.map((f) => f.label)).toEqual(['fill', 'end']);
    expect(fired[0]!.at).toBeCloseTo(t0 + BAR, 5);
    expect(fired[1]!.at).toBeCloseTo(t0 + 2 * BAR, 5);
    expect(has(fired[1]!.changes, 'clock', 'run', false)).toBe(true);
    expect(perf.running).toBe(false);
    expect(perf.pendingLabels()).toEqual([]);
    expect(perf.section.name).toBe('INTRO');
    expect(perf.tick(t0 + PHRASE)).toEqual([]);
  });

  it('STOP nog eens terwijl het einde gewapend staat: meteen stil', () => {
    const { perf, t0 } = started();
    perf.stop(t0 + BEAT);
    const f = perf.stop(t0 + BEAT * 1.5)!;
    expect(f.label).toBe('stop');
    expect(f.at).toBeCloseTo(t0 + BEAT * 1.5, 5);
    expect(perf.running).toBe(false);
    expect(perf.stop(t0 + 2 * BEAT)).toBeNull();                       // staat al stil
  });

  it('± schuift het tempo een bpm zonder sprong en blijft binnen de grenzen', () => {
    const { perf, t0 } = started();
    expect(perf.nudgeBpm(1, t0 + BEAT).changes).toEqual([{ module: 'clock', control: 'tempo', value: 141 }]);
    expect(perf.nudgeBpm(-2, t0 + BEAT).changes).toEqual([{ module: 'clock', control: 'tempo', value: 139 }]);
    expect(perf.setBpm(1000, t0 + BEAT).changes[0]!.value).toBe(300);
    expect(perf.clock.beatAt(t0 + BEAT)).toBeCloseTo(1);
  });

  it('Autopilot: per frase een variatie op de Grids-standen, elke vierde frase een fill in de laatste maat', () => {
    const perf = new Performance(TRAP);
    perf.setAutopilot(true, 0);
    const t0 = perf.start(10).at;
    expect(perf.autopilot).toBe(true);
    const fired = runUntil(perf, t0, t0 + 4 * PHRASE + BEAT);
    const labels = fired.map((f) => f.label);
    // Frase 2 (index 1): hh +0,1 en y +0,1 op de intro-standen (hh 0,5, y 0,15).
    const p2 = fired.find((f) => f.label === 'autopilot · phrase 2')!;
    expect(p2.at).toBeCloseTo(t0 + PHRASE, 4);
    expect(p2.changes.find((c) => c.control === 'hh')?.value).toBeCloseTo(0.6, 3);
    expect(p2.changes.find((c) => c.control === 'y')?.value).toBeCloseTo(0.25, 3);
    // Frase 3: terug naar de sectie.
    const p3 = fired.find((f) => f.label === 'autopilot · phrase 3')!;
    expect(p3.changes.find((c) => c.control === 'hh')?.value).toBe(0.5);
    // Frase 4: variatie én een fill in de laatste maat, die op de 1 van frase 5 eindigt.
    const fill = fired.find((f) => f.label === 'fill')!;
    expect(fill.at).toBeCloseTo(t0 + 3 * PHRASE + 3 * BAR, 4);
    expect(labels.indexOf('fill ends')).toBeGreaterThan(labels.indexOf('fill'));
    expect(fired.find((f) => f.label === 'fill ends')!.at).toBeCloseTo(t0 + 4 * PHRASE, 4);
    expect(labels).toContain('autopilot · phrase 5');
  });

  it('Autopilot uit zet de sectie-standen meteen terug; aan tijdens het spelen plant de volgende frase', () => {
    const { perf, t0 } = started();
    expect(perf.setAutopilot(true, t0 + BEAT)).toBeNull();
    const fired = runUntil(perf, t0 + BEAT, t0 + PHRASE);
    expect(fired.map((f) => f.label)).toEqual(['autopilot · phrase 2']);
    const off = perf.setAutopilot(false, t0 + PHRASE + BEAT)!;
    expect(off.label).toBe('autopilot off');
    expect(off.changes.find((c) => c.control === 'hh')?.value).toBe(0.5);
    expect(runUntil(perf, t0 + PHRASE + BEAT, t0 + 3 * PHRASE)).toEqual([]);
  });

  it('een sectiewissel neemt de Autopilot-variatie van die frase mee', () => {
    const perf = new Performance(TRAP);
    perf.setAutopilot(true, 0);
    const t0 = perf.start(10).at;
    perf.next(t0 + BEAT);
    const fired = runUntil(perf, t0, t0 + PHRASE);
    // Op de 1 van frase 2 landen de sectie (VERSE, hh 0,7) en de variatie
    // (+0,1) samen; wat als laatste klinkt heeft beide in zich.
    expect(fired.map((f) => f.label).sort()).toEqual(['autopilot · phrase 2', '→ VERSE'].sort());
    expect(fired[fired.length - 1]!.changes.find((c) => c.control === 'hh')?.value).toBeCloseTo(0.8, 3);
    expect(perf.section.name).toBe('VERSE');
  });
});
