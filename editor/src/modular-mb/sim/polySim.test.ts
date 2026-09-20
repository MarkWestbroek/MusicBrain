// Poly-gedrag van de simulator: kabels uitvouwen + stemtoewijzing.
//
// Deze twee stukken bepalen of een poly-patch polyfoon klinkt of stiekem
// alleen stem 1 laat horen. Ze zitten los van Tone zodat ze hier, zonder
// AudioContext, na te rekenen zijn.

import { describe, expect, it } from 'vitest';

import {
  expandPolyConnections, pickVoiceIndex, stealStrategyOf, VoiceAllocator,
  type PolyExpandOptions,
} from './polySim';
import type { PatchConnection } from '../types';

const VOICES = ['vco1', 'vco2', 'vco3', 'vco4'];
const VCAS   = ['vca1', 'vca2', 'vca3', 'vca4'];

function opts(over: Partial<PolyExpandOptions> = {}): PolyExpandOptions {
  return {
    groups: new Map([['vco1', VOICES], ['vca1', VCAS]]),
    cellMasterOf: new Map(),
    isEventSource: (id) => id === 'midiin' || id === 'seq',
    ...over,
  };
}
function c(fm: string, fp: string, tm: string, tp: string): PatchConnection {
  return { id: `${fm}.${fp}->${tm}.${tp}`, from: { moduleId: fm, portId: fp }, to: { moduleId: tm, portId: tp } };
}
const pairs = (cs: PatchConnection[]): string[] =>
  cs.map((x) => `${x.from.moduleId}.${x.from.portId}->${x.to.moduleId}.${x.to.portId}`);

describe('expandPolyConnections', () => {
  it('laat een patch zonder groepen met rust', () => {
    const conns = [c('vco1', 'out', 'out', 'l')];
    expect(pairs(expandPolyConnections(conns, opts({ groups: new Map() })))).toEqual(pairs(conns));
  });

  it('waaiert een globale bron uit over alle stemmen', () => {
    expect(pairs(expandPolyConnections([c('lfo', 'out', 'vco1', 'tune')], opts())))
      .toEqual(['lfo.out->vco1.tune', 'lfo.out->vco2.tune', 'lfo.out->vco3.tune', 'lfo.out->vco4.tune']);
  });

  it('koppelt groep aan groep per stem', () => {
    expect(pairs(expandPolyConnections([c('vco1', 'out', 'vca1', 'in')], opts())))
      .toEqual(['vco1.out->vca1.in', 'vco2.out->vca2.in', 'vco3.out->vca3.in', 'vco4.out->vca4.in']);
  });

  it('telt de mixerkanalen door bij groep → genummerde sink', () => {
    expect(pairs(expandPolyConnections([c('vca1', 'out', 'mixer', 'in1')], opts())))
      .toEqual(['vca1.out->mixer.in1', 'vca2.out->mixer.in2', 'vca3.out->mixer.in3', 'vca4.out->mixer.in4']);
  });

  it('sommeert op dezelfde poort als de sink niet genummerd is', () => {
    expect(pairs(expandPolyConnections([c('vca1', 'out', 'out', 'l')], opts())))
      .toEqual(['vca1.out->out.l', 'vca2.out->out.l', 'vca3.out->out.l', 'vca4.out->out.l']);
  });

  it('laat MIDI-In en sequencer op de master staan (die gaan via de toewijzer)', () => {
    const conns = [c('midiin', 'pitch', 'vco1', 'voct'), c('seq', 'cv', 'vco1', 'voct')];
    expect(pairs(expandPolyConnections(conns, opts()))).toEqual(pairs(conns));
  });

  it('vouwt cel-groepen uit op het poortnummer', () => {
    const cells = ['smp#1', 'smp#2', 'smp#3'];
    const o = opts({
      groups: new Map([['smp#1', cells]]),
      cellMasterOf: new Map([['smp', 'smp#1']]),
    });
    // cel → cel: stem k → stem k. Event → cel blijft staan.
    expect(pairs(expandPolyConnections([c('smp', 'env_1', 'smp', 'cutoff_1')], o)))
      .toEqual(['smp.env_1->smp.cutoff_1', 'smp.env_2->smp.cutoff_2', 'smp.env_3->smp.cutoff_3']);
    expect(pairs(expandPolyConnections([c('midiin', 'pitch', 'smp', 'voct_1')], o)))
      .toEqual(['midiin.pitch->smp.voct_1']);
  });
});

describe('VoiceAllocator', () => {
  it('zonder stemmen blijft alles monofoon', () => {
    const a = new VoiceAllocator();
    expect(a.size).toBe(0);
    expect(a.pick(60)).toBe(-1);
    expect(a.voiceOf(60)).toBe(-1);
  });

  it('verdeelt een akkoord over de stemmen', () => {
    const a = new VoiceAllocator();
    a.resize(4);
    expect([60, 64, 67, 71].map((n) => a.pick(n))).toEqual([0, 1, 2, 3]);
    expect(a.voiceOf(67)).toBe(2);
  });

  it('steelt de oudste stem als ze allemaal bezet zijn', () => {
    const a = new VoiceAllocator();
    a.resize(4);
    [60, 64, 67, 71].forEach((n) => a.pick(n));
    expect(a.pick(74)).toBe(0);          // 60 was het langst bezig
    expect(a.voiceOf(60)).toBe(-1);      // en is dus weg
    expect(a.pick(77)).toBe(1);          // daarna 64
  });

  it('geeft dezelfde noot zijn eigen stem terug', () => {
    const a = new VoiceAllocator();
    a.resize(4);
    a.pick(60); a.pick(64);
    expect(a.pick(60)).toBe(0);
  });

  it('hergebruikt een vrijgegeven stem', () => {
    const a = new VoiceAllocator();
    a.resize(4);
    [60, 64, 67, 71].forEach((n) => a.pick(n));
    a.release(a.voiceOf(64));
    expect(a.pick(77)).toBe(1);
    a.releaseAll();
    expect(a.pick(48)).toBe(0);
  });

  it('kiest het lid voor een stem, ook als een groep korter is', () => {
    expect(VoiceAllocator.memberFor(VOICES, 2, 'vco1')).toBe('vco3');
    expect(VoiceAllocator.memberFor(['a', 'b'], 3, 'a')).toBe('b');
    expect(VoiceAllocator.memberFor(undefined, 1, 'solo')).toBe('solo');
    expect(VoiceAllocator.memberFor(VOICES, -1, 'vco1')).toBe('vco1');
  });
});

describe('steal-strategie', () => {
  // Vier stemmen, allemaal bezet: 60 het langst, 74 het kortst.
  const bezet = [
    { note: 60, age: 1 }, { note: 67, age: 2 }, { note: 55, age: 3 }, { note: 74, age: 4 },
  ];

  it('vertaalt de STEAL-knop', () => {
    expect(stealStrategyOf(0)).toBe('oldest');
    expect(stealStrategyOf(1)).toBe('lowest');
    expect(stealStrategyOf(2)).toBe('highest');
    expect(stealStrategyOf(99)).toBe('oldest');
  });

  it('pakt de oudste, de laagste of de hoogste', () => {
    expect(pickVoiceIndex(bezet, 62, 'oldest')).toBe(0);    // age 1
    expect(pickVoiceIndex(bezet, 62, 'lowest')).toBe(2);    // noot 55
    expect(pickVoiceIndex(bezet, 62, 'highest')).toBe(3);   // noot 74
  });

  it('laat vrije stemmen en dezelfde noot vóór elke strategie gaan', () => {
    const half = [{ note: 60, age: 1 }, { note: null, age: 9 }];
    for (const s of ['oldest', 'lowest', 'highest'] as const) {
      expect(pickVoiceIndex(half, 62, s)).toBe(1);          // vrij wint
      expect(pickVoiceIndex(half, 60, s)).toBe(0);          // hertrigger wint
    }
  });

  it('volgt de strategie ook in de allocator', () => {
    const a = new VoiceAllocator();
    a.resize(3);
    a.setSteal('highest');
    [60, 72, 64].forEach((n) => a.pick(n));
    expect(a.pick(62)).toBe(1);                             // 72 was de hoogste
  });
});
