// PAGE D: de rijen kloppen met het profiel en worden van achter naar voor
// getekend, zodat de voorste rijen de achterste afdekken.

import { describe, expect, it } from 'vitest';

import { pageDRows, projectPageD } from './cmiPageDRows';
import { SAMPLES, SEG, emptyProfile, preset } from './cmiProfile';

const G = { width: 400, height: 240, rowWidth: 280, amp: 60 };

describe('PAGE D', () => {
  it('HARMONISCH: 32 rijen van 32 segmenten, de niveaus van Page 4; tijd volgt DURATION', () => {
    const p = emptyProfile();
    p.levels[2 * SEG + 5] = 0.7;                 // harmonische 3, segment 6
    p.duration[0] = 4;                           // segment 1 vier keer zo lang
    const d = pageDRows(p, 'harm');
    expect(d.rows).toHaveLength(32);
    expect(d.rows[2]![5]).toBeCloseTo(0.7, 5);
    expect(d.labels[0]).toBe(1);
    expect(d.xs[0]).toBeCloseTo(2 / 35, 5);      // midden van een segment van 4 op een totaal van 35
    expect(d.xs[1]! - d.xs[0]!).toBeCloseTo(2.5 / 35, 5);
  });

  it('dB-schaal: de sterkste is 1, −24 dB is 0,5, onder −48 dB is 0', () => {
    const p = emptyProfile();
    p.levels[0] = 1; p.levels[1 * SEG] = 10 ** (-24 / 20); p.levels[2 * SEG] = 0.001;
    const d = pageDRows(p, 'harm', 1, 'db');
    expect(d.rows[0]![0]).toBeCloseTo(1, 5);
    expect(d.rows[1]![0]).toBeCloseTo(0.5, 5);
    expect(d.rows[2]![0]).toBe(0);
  });

  it('GOLF: per segment de golfvorm, maal ENERGY; stap 4 geeft elk 4e segment', () => {
    const p = preset('bell');
    const d = pageDRows(p, 'wave', 4);
    expect(d.rows).toHaveLength(8);
    expect(d.labels).toEqual([1, 5, 9, 13, 17, 21, 25, 29]);
    expect(d.rows[0]).toHaveLength(SAMPLES);
    const peak = (r: number[]): number => Math.max(...r.map(Math.abs));
    expect(peak(d.rows[7]!)).toBeLessThan(peak(d.rows[0]!));   // de klok sterft uit
  });

  it('projectie: van achter naar voor; achteraan rechtsboven, vooraan linksonder', () => {
    const polys = projectPageD(pageDRows(preset('saw'), 'harm'), G);
    expect(polys.map((x) => x.row)).toEqual(Array.from({ length: 32 }, (_, i) => 31 - i));
    const front = polys.at(-1)!, back = polys[0]!;
    expect(front.labelAt[0]).toBeLessThan(back.labelAt[0]);
    expect(front.labelAt[1]).toBeGreaterThan(back.labelAt[1]);
    expect(front.depth).toBe(0);
    expect(back.depth).toBe(1);
    // alles binnen het beeld
    for (const pl of polys) for (const pt of pl.fill.split(' ')) {
      const [x, y] = pt.split(',').map(Number);
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(G.width + 0.1);
      expect(y).toBeGreaterThanOrEqual(-0.1); expect(y).toBeLessThanOrEqual(G.height + 0.1);
    }
  });
});
