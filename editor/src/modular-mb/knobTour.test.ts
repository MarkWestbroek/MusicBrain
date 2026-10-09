// Knoptour: het verloop van een knop is voorspelbaar en eindigt waar hij
// begon; de frase past bij wat de patch zelf al doet.

import { describe, expect, it } from 'vitest';

import { SWEEP_MS, phraseFor, sweepValue, tourable } from './knobTour';
import type { Control } from './types';

const cutoff: Control = { kind: 'knob', id: 'cutoff', label: 'Cutoff', min: 20, max: 18000, defaultValue: 2000, unit: 'Hz' };
const mode: Control = { kind: 'switch', id: 'mode', label: 'Mode', positions: ['LP', 'HP', 'BP'], defaultIndex: 0 } as Control;

describe('knoptour', () => {
  it('een knop gaat naar min, dan max, en eindigt op zijn eigen waarde', () => {
    expect(sweepValue(cutoff, 2000, 0)).toBeCloseTo(2000, 3);
    expect(sweepValue(cutoff, 2000, 0.2 * SWEEP_MS)).toBeCloseTo(20, 3);
    expect(sweepValue(cutoff, 2000, 0.7 * SWEEP_MS)).toBeCloseTo(18000, 0);
    expect(sweepValue(cutoff, 2000, SWEEP_MS)).toBeCloseTo(2000, 3);
    // logaritmisch: halverwege min → max ligt rond het meetkundig midden, niet bij 9 kHz
    expect(sweepValue(cutoff, 2000, 0.45 * SWEEP_MS) as number).toBeLessThan(1200);
  });

  it('het deelbereik van het front begrenst de zwaai', () => {
    const r = { min: 200, max: 4000 };
    expect(sweepValue(cutoff, 1000, 0.2 * SWEEP_MS, r)).toBeCloseTo(200, 3);
    expect(sweepValue(cutoff, 1000, 0.7 * SWEEP_MS, r)).toBeCloseTo(4000, 0);
  });

  it('een schakelaar loopt alle standen af en eindigt op de beginstand', () => {
    const seen = new Set<unknown>();
    for (let ms = 0; ms < SWEEP_MS; ms += 100) seen.add(sweepValue(mode, 1, ms));
    expect([...seen].sort()).toEqual([0, 1, 2]);
    expect(sweepValue(mode, 1, SWEEP_MS)).toBe(1);
  });

  it('wat de tour kan laten horen', () => {
    expect(tourable(cutoff)).toBe(true);
    expect(tourable({ kind: 'button', id: 'b', label: 'B' } as Control)).toBe(false);
  });

  it('de frase: niets bij een ritmebox, een akkoord vasthouden bij de ARP, anders een gebroken akkoord op tempo', () => {
    expect(phraseFor(['tp_mmb_rhythm', 'tp_mmb_out'], 120).kind).toBe('none');
    expect(phraseFor(['tp_mmb_arp', 'tp_mmb_vco'], 120).kind).toBe('hold');
    const p = phraseFor(['tp_mmb_epiano'], 100);
    expect(p.kind === 'arp' && p.stepMs).toBe(600);
  });
});
