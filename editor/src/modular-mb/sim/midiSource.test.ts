// De test-sequence moet elke noot *loslaten* voordat de volgende komt.
//
// Vielen noteOff en noteOn in dezelfde tick, dan zag een wasm-module (Plaits,
// Rings, sampler — en dus elke poly-groep, want die bestaat alleen uit
// wasm-stemmen) nooit een dalende flank op zijn gate: hij hertriggerde niet en
// je hoorde alleen de eerste noot van de arpeggio. Zie de gate-gap in
// TestSequenceSource en `gateRatio` in de SEQ-module.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SEQUENCE_PATTERNS, TestSequenceSource,
  type MidiEvent, type SequencePattern,
} from './MidiSource';

/** Virtuele klok: fake timers laten Date.now() staan, dus tellen we zelf. */
const STEP_MS = 5;

describe('TestSequenceSource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', globalThis);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Alle events van een paar maten, met het tijdstip (±STEP_MS) erbij. */
  function run(bpm: number, ms: number, pattern: SequencePattern = 'arp'): { t: number; e: MidiEvent }[] {
    const src = new TestSequenceSource();
    src.setPattern(pattern);
    src.setBpm(bpm);
    const log: { t: number; e: MidiEvent }[] = [];
    let t = 0;
    src.subscribe((e) => log.push({ t, e }));
    src.start();
    for (let n = 0; n < ms; n += STEP_MS) { t = n + STEP_MS; vi.advanceTimersByTime(STEP_MS); }
    src.stop();
    return log;
  }

  it('laat elke noot los vóór de volgende noot-aan', () => {
    const log = run(120, 1000);
    expect(log.filter((x) => x.e.kind === 'noteOn').length).toBeGreaterThan(3);
    for (let i = 0; i < log.length - 1; i++) {
      const cur = log[i]!, next = log[i + 1]!;
      if (cur.e.kind !== 'noteOn') continue;
      // Wat na een noteOn komt is de noteOff van diezelfde noot…
      expect(next.e.kind).toBe('noteOff');
      expect(next.e.kind === 'noteOff' && next.e.note).toBe(cur.e.note);
      // …en die valt ruim vóór de volgende noteOn, niet in hetzelfde audioblok.
      const after = log[i + 2];
      if (after) expect(after.t - next.t).toBeGreaterThan(20);
    }
  });

  it('stopt zonder hangende noot', () => {
    const log = run(120, 1000);
    const open = new Set<number>();
    for (const { e } of log) {
      if (e.kind === 'noteOn')  open.add(e.note);
      if (e.kind === 'noteOff') open.delete(e.note);
    }
    expect([...open]).toEqual([]);
  });

  it('bouwt een akkoord op tot acht klinkende noten', () => {
    const log = run(120, 3000, 'build');
    let sounding = 0, peak = 0;
    for (const { e } of log) {
      if (e.kind === 'noteOn')  peak = Math.max(peak, ++sounding);
      if (e.kind === 'noteOff') sounding--;
      expect(sounding).toBeGreaterThanOrEqual(0);
    }
    expect(peak).toBe(8);
  });

  it('hertriggert een gehouden akkoordnoot niet', () => {
    for (const [pattern, ms] of [['build', 3000], ['chords', 9000]] as const) {
      const log = run(120, ms, pattern);
      const open = new Set<number>();
      for (const { e } of log) {
        // Twee keer aan zonder uit ertussen = een hertrigger die je hoort
        // als een hik in een noot die gewoon moest blijven liggen.
        if (e.kind === 'noteOn')  { expect(open.has(e.note), pattern).toBe(false); open.add(e.note); }
        if (e.kind === 'noteOff') { expect(open.has(e.note), pattern).toBe(true);  open.delete(e.note); }
      }
    }
  });

  it('laat een wegvallende noot los vóór de volgende aanslag', () => {
    for (const p of SEQUENCE_PATTERNS) {
      const log = run(120, 3000 * (p.stepFactor ?? 1), p.id);
      for (let i = 0; i < log.length; i++) {
        const cur = log[i]!;
        if (cur.e.kind !== 'noteOff') continue;
        // Elke noteOff heeft ruimte vóór de eerstvolgende noteOn: die stem
        // kan opnieuw uitgegeven worden en moet een dalende flank zien.
        const nextOn = log.slice(i + 1).find((x) => x.e.kind === 'noteOn');
        if (nextOn) expect(nextOn.t - cur.t, p.id).toBeGreaterThan(20);
      }
    }
  });

  it('neemt een nieuw tempo meteen over', () => {
    const src = new TestSequenceSource();
    let on = 0;
    src.subscribe((e) => { if (e.kind === 'noteOn') on++; });
    src.start();                       // 120 BPM → achtsten van 250 ms
    vi.advanceTimersByTime(500);
    const before = on;
    on = 0;
    src.setBpm(240);                   // → 125 ms
    vi.advanceTimersByTime(500);
    src.stop();
    expect(on).toBeGreaterThan(before);
  });
});

describe('akkoordpatroon', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('window', globalThis); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  function chordLog(ms: number): { t: number; e: MidiEvent }[] {
    const src = new TestSequenceSource();
    src.setPattern('chords');
    const log: { t: number; e: MidiEvent }[] = [];
    let t = 0;
    src.subscribe((e) => log.push({ t, e }));
    src.start();
    for (let n = 0; n < ms; n += 5) { t = n + 5; vi.advanceTimersByTime(5); }
    src.stop();
    return log;
  }

  it('geeft elk akkoord een hele noot (8 × een achtste)', () => {
    const on = chordLog(9000).filter((x) => x.e.kind === 'noteOn');
    const eerste = on[0]!.t;
    // Bij 120 BPM is een achtste 250 ms, dus een stap duurt 2 s.
    const volgende = on.find((x) => x.t > eerste + 100)!;
    expect(volgende.t - eerste).toBeGreaterThan(1800);
    expect(volgende.t - eerste).toBeLessThan(2200);
  });

  it('slaat de noten van één akkoord niet allemaal even hard aan', () => {
    const log = chordLog(2000);
    const vels = log
      .filter((x) => x.e.kind === 'noteOn')
      .map((x) => (x.e as { velocity: number }).velocity);
    expect(vels.length).toBeGreaterThanOrEqual(4);
    expect(new Set(vels).size).toBeGreaterThan(1);
    for (const v of vels) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThanOrEqual(1); }
    // Bas en bovenstem dragen het akkoord, de vulling blijft eronder.
    expect(Math.max(...vels)).toBeGreaterThan(Math.min(...vels) + 0.1);
  });
});
