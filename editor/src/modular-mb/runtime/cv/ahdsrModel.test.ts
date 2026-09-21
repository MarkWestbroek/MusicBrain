// Het sim-model van de AHDSR tegen dezelfde scenario's als de firmware
// (firmware/core/tests/test_ahdsr.cpp) — zelfde tijden, zelfde verwachtingen.
// Dat is het hele punt: de sim moet klinken als de Teensy, en de Teensy is
// leidend.

import { describe, expect, it } from 'vitest';

import { AhdsrModel, ahdsrShape, type AhdsrParams } from './ahdsrModel';

const base: AhdsrParams = {
  attack: 10, hold: 0, decay: 200, sustain: 0.7, release: 300,
  curve: 0, loop: false, retrig: false,
};
const model = (p: Partial<AhdsrParams>): AhdsrModel => new AhdsrModel({ ...base, ...p });

describe('AHDSR zoals de firmware', () => {
  it('staat stil voor de eerste gate', () => {
    expect(model({}).stateAt(100)).toEqual({ phase: 'zero', value: 0 });
  });

  it('loopt attack → decay → sustain → release in de opgegeven tijden', () => {
    // ahdsr_attack_decay_sustain_release_progression
    const m = model({ attack: 10, hold: 0, decay: 20, sustain: 0.5, release: 40 });
    m.gate(true, 0);
    expect(m.stateAt(10).value).toBeCloseTo(1, 6);            // attack klaar
    expect(m.stateAt(30)).toEqual({ phase: 'sustain', value: 0.5 });
    expect(m.stateAt(530).value).toBe(0.5);
    m.gate(false, 530);
    expect(m.stateAt(550).value).toBeCloseTo(0.25, 6);       // halverwege, lineair
    expect(m.stateAt(570)).toEqual({ phase: 'zero', value: 0 });
  });

  it('is een lineaire release van de volle tijd — de Teensy-snelheid', () => {
    // De aanleiding: Tone.Envelope stond na 190 van 400 ms al op 5 %.
    const m = model({ sustain: 1, release: 400 });
    m.gate(true, 0);
    m.gate(false, 1000);
    expect(m.stateAt(1190).value).toBeCloseTo(1 - 190 / 400, 6);   // 0,525
  });

  it('voegt een echte hold in', () => {
    // ahdsr_hold_phase_inserted_when_hold_nonzero
    const m = model({ attack: 5, hold: 15, decay: 5, sustain: 0.3 });
    m.gate(true, 0);
    expect(m.stateAt(5)).toEqual({ phase: 'hold', value: 1 });
    expect(m.stateAt(19).phase).toBe('hold');
    expect(m.stateAt(20).phase).toBe('decay');
    expect(m.stateAt(25).value).toBeCloseTo(0.3, 6);
  });

  it('begint in loop-modus na de release opnieuw aan de attack', () => {
    // ahdsr_loop_restarts_after_release
    const m = model({ attack: 2, hold: 0, decay: 2, sustain: 0, release: 2, loop: true });
    m.gate(true, 0);
    expect(m.stateAt(4).phase).toBe('sustain');
    m.gate(false, 4);
    expect(m.stateAt(6).phase).toBe('attack');
  });

  it('geeft Lin/Exp/Log hun eigen midden', () => {
    // ahdsr_curve_changes_attack_midpoint
    const mid = (curve: 0 | 1 | 2): number => {
      const m = model({ attack: 100, decay: 100, sustain: 0, curve });
      m.gate(true, 0);
      return m.stateAt(50).value;
    };
    expect(mid(0)).toBeCloseTo(0.5, 6);
    expect(mid(1)).toBeCloseTo(0.25, 6);
    expect(mid(2)).toBeCloseTo(0.75, 6);
    expect(ahdsrShape(0.5, 1)).toBe(0.25);
  });

  it('gaat bij een nieuwe aanslag verder vanaf de huidige waarde', () => {
    // ahdsr_default_retrigger_continues_from_current_value
    const m = model({ attack: 100, decay: 10, sustain: 0.5, release: 100 });
    m.gate(true, 0);
    expect(m.stateAt(110).phase).toBe('sustain');
    m.gate(false, 110);
    const before = m.stateAt(130).value;                     // 0,4
    expect(before).toBeCloseTo(0.4, 6);
    expect(m.gate(true, 130)).toBe(true);
    expect(m.stateAt(130)).toEqual({ phase: 'attack', value: expect.closeTo(0.4, 6) });
    expect(m.stateAt(190).value).toBeCloseTo(1, 6);           // de rest van de attack: 60 ms
  });

  it('negeert een tweede aanslag tijdens attack of hold', () => {
    const m = model({ attack: 100, hold: 50 });
    m.gate(true, 0);
    expect(m.gate(true, 40)).toBe(false);
    expect(m.gate(true, 120)).toBe(false);
    expect(m.stateAt(149).phase).toBe('hold');
  });

  it('begint met Reset elke aanslag vanaf nul, ook als hij al open staat', () => {
    // ahdsr_retrigger_mode_restarts_from_zero
    const m = model({ attack: 100, decay: 10, sustain: 0.5, release: 100, retrig: true });
    m.gate(true, 0);
    expect(m.stateAt(110).value).toBeGreaterThan(0.45);
    expect(m.gate(true, 110)).toBe(true);
    expect(m.stateAt(110)).toEqual({ phase: 'attack', value: 0 });
  });

  it('releaset vanaf waar hij is als de gate midden in de attack sluit', () => {
    const m = model({ attack: 100, release: 200 });
    m.gate(true, 0);
    m.gate(false, 50);                                       // op 0,5
    expect(m.stateAt(150).value).toBeCloseTo(0.25, 6);       // halve release
    expect(m.stateAt(250).phase).toBe('zero');
  });

  it('tekent lineaire stukken met hun eindpunten en Exp/Log met meer', () => {
    const lin = model({ attack: 10, hold: 0, decay: 20, sustain: 0.5 });
    lin.gate(true, 0);
    expect(lin.points()).toEqual([[0, 0], [10, 1], [10, 1], [30, 0.5], [30, 0.5]]);
    const exp = model({ attack: 10, decay: 20, sustain: 0.5, curve: 1 });
    exp.gate(true, 0);
    expect(exp.points().length).toBeGreaterThan(60);
  });
});
