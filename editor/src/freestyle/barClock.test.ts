import { describe, expect, it } from 'vitest';

import { ArmQueue, BarClock } from './barClock';

describe('BarClock', () => {
  it('telt tel, maat en frase vanaf de start op 120 bpm', () => {
    const c = new BarClock(120);
    c.start(10);
    expect(c.position(10)).toMatchObject({ absBeat: 0, beat: 0, bar: 0, phrase: 0 });
    expect(c.position(10.5)).toMatchObject({ beat: 1, bar: 0, phrase: 0 });       // een tel = 0,5 s
    expect(c.position(12)).toMatchObject({ beat: 0, bar: 1, phrase: 0 });         // een maat = 2 s
    expect(c.position(18)).toMatchObject({ beat: 0, bar: 0, phrase: 1 });         // een frase = 8 s
    expect(c.position(18.25).frac).toBeCloseTo(0.5);
  });

  it('staat vóór de start op nul en wapent dan op de start', () => {
    const c = new BarClock(120);
    c.start(10);
    expect(c.position(5)).toMatchObject({ absBeat: 0, beat: 0, bar: 0, phrase: 0 });
    expect(c.nextBoundary('bar', 5)).toBe(0);
    expect(c.timeOfBeat(0)).toBe(10);
  });

  it('kiest de eerstvolgende grens strikt ná het moment, met minimale voorsprong', () => {
    const c = new BarClock(120);
    c.start(0);
    expect(c.nextBoundary('beat', 0.1)).toBe(1);
    expect(c.nextBoundary('bar', 0.1)).toBe(4);
    expect(c.nextBoundary('phrase', 0.1)).toBe(16);
    // Precies op de grens: de volgende, niet deze.
    expect(c.nextBoundary('beat', 0.5)).toBe(2);
    // Een tel die over 10 ms valt haal je niet meer met 30 ms voorsprong.
    expect(c.nextBoundary('beat', 0.49, 0.03)).toBe(2);
    expect(c.nextBoundary('beat', 0.46, 0.03)).toBe(1);
    expect(c.nextBoundary('now', 0.3)).toBeCloseTo(0.6);
  });

  it('verandert tempo zonder sprong: de huidige tel blijft, de volgende komt eerder', () => {
    const c = new BarClock(120);
    c.start(0);
    // Op t = 1,25 s zijn we op tel 2,5.
    c.setBpm(60, 1.25);
    expect(c.beatAt(1.25)).toBeCloseTo(2.5);
    // Op 60 bpm duurt de rest van tel 2 (0,5 tel) een halve seconde.
    expect(c.timeOfBeat(3)).toBeCloseTo(1.75);
    expect(c.timeOfBeat(4)).toBeCloseTo(2.75);
    expect(c.bpm).toBe(60);
  });
});

describe('ArmQueue', () => {
  it('laat een gewapende actie op de volgende maat landen, en geeft hem één keer terug', () => {
    const c = new BarClock(120);
    c.start(0);
    const q = new ArmQueue<string>(c);
    const a = q.arm('bar', 'next', 0.3);
    expect(a.fireBeat).toBe(4);
    expect(q.pending()).toHaveLength(1);
    expect(q.due(0.5, 0.1)).toEqual([]);                 // maat 2 begint op 2,0 s
    const fired = q.due(1.92, 0.1);
    expect(fired).toHaveLength(1);
    expect(fired[0]!.at).toBeCloseTo(2);
    expect(fired[0]!.payload).toBe('next');
    expect(q.due(2.5, 0.1)).toEqual([]);
    expect(q.pending()).toHaveLength(0);
  });

  it('verschuift de landingstijd mee met een tempowissel, de tel blijft', () => {
    const c = new BarClock(120);
    c.start(0);
    const q = new ArmQueue<string>(c);
    q.arm('phrase', 'hook', 0.1);                        // tel 16, op 120 bpm t = 8 s
    c.setBpm(240, 1);                                    // vanaf tel 2 dubbel zo snel
    const fired = q.due(4.4, 0.1);                       // tel 16 valt nu op 1 + 14 × 0,25 = 4,5 s
    expect(fired).toHaveLength(1);
    expect(fired[0]!.fireBeat).toBe(16);
    expect(fired[0]!.at).toBeCloseTo(4.5);
  });

  it('kan annuleren, en levert in volgorde van landen', () => {
    const c = new BarClock(120);
    c.start(0);
    const q = new ArmQueue<string>(c);
    const later = q.arm('phrase', 'phrase', 0.1);
    q.arm('beat', 'beat', 0.1);
    q.arm('bar', 'bar', 0.1);
    expect(q.pending().map((x) => x.payload)).toEqual(['beat', 'bar', 'phrase']);
    expect(q.cancel(later.id)).toBe(true);
    expect(q.cancel(later.id)).toBe(false);
    expect(q.due(100, 0).map((x) => x.payload)).toEqual(['beat', 'bar']);
  });

  it('plant een actie die al voorbij is nooit in het verleden', () => {
    const c = new BarClock(120);
    c.start(0);
    const q = new ArmQueue<string>(c);
    q.arm('beat', 'x', 0.1);                             // tel 1 = 0,5 s
    const fired = q.due(0.7, 0.1);                       // te laat opgehaald
    expect(fired[0]!.at).toBe(0.7);
  });
});
