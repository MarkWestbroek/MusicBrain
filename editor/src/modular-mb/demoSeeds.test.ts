import { describe, expect, it } from 'vitest';

import { DEMO_SEEDS, standardProject } from './demoSeeds';
import { frontIssues } from './fronts';
import { autoFront } from './frontLayout';

describe('standardProject', () => {
  it('begint met de hele standaardset, de E-piano actief, en elk front tekenbaar', () => {
    const p = standardProject();
    expect(p.patches).toHaveLength(DEMO_SEEDS.length);
    expect(p.patches[0]!.name).toMatch(/piano/i);
    expect(p.activePatchId).toBe(p.patches[0]!.id);
    expect(p.activeRackId).toBe(p.patches[0]!.rackIds[0]);
    for (const patch of p.patches) {
      expect(frontIssues(patch, p)).toEqual([]);
      expect(autoFront(patch, p).items.some((it) => it.kind === 'control')).toBe(true);
    }
  });
});
