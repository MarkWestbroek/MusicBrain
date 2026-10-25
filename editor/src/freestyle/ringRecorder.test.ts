// De ringbuffer van de freestyle-machine (MOCKUP.md §4.7): MasterRecorder
// met `keepSeconds` houdt alleen de laatste blokken. De trim zelf is puur.
import { describe, expect, it } from 'vitest';

import { trimParts } from '../modular-mb/sim/wavRecorder';

const block = (n: number, fill = 0): Float32Array[] => [new Float32Array(n).fill(fill), new Float32Array(n).fill(fill)];

describe('trimParts', () => {
  it('laat alles staan zolang de buffer korter is dan de grens', () => {
    const parts = [block(100, 1), block(100, 2)];
    const t = trimParts(parts, 200, 500);
    expect(t.parts).toBe(parts);
    expect(t.frames).toBe(200);
  });

  it('gooit de oudste blokken weg, maar houdt minstens de grens over', () => {
    const parts = [block(100, 1), block(100, 2), block(100, 3), block(100, 4)];
    const t = trimParts(parts, 400, 250);
    // 400 − 100 = 300 ≥ 250: blok 1 weg; 300 − 100 = 200 < 250: blok 2 blijft.
    expect(t.frames).toBe(300);
    expect(t.parts.map((p) => p[0]![0])).toEqual([2, 3, 4]);
  });

  it('houdt precies de grens als de blokken erop uitkomen', () => {
    const parts = [block(100, 1), block(100, 2), block(100, 3)];
    const t = trimParts(parts, 300, 200);
    expect(t.frames).toBe(200);
    expect(t.parts.map((p) => p[0]![0])).toEqual([2, 3]);
  });

  it('is stabiel bij herhaald aanroepen (elk nieuw blok)', () => {
    let parts: Float32Array[][] = [], frames = 0;
    for (let i = 0; i < 50; i++) {
      parts = [...parts, block(128, i)]; frames += 128;
      ({ parts, frames } = trimParts(parts, frames, 1000));
      expect(frames).toBeGreaterThanOrEqual(Math.min(1000, (i + 1) * 128));
      expect(frames).toBeLessThan(1000 + 128);
    }
    expect(parts[parts.length - 1]![0]![0]).toBe(49);
  });
});
