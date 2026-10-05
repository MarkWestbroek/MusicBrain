import { describe, expect, it } from 'vitest';

import { DEMO_SEEDS, standardProject } from './demoSeeds';
import { frontIssues } from './fronts';
import { autoFront, buildFrontModule } from './frontLayout';
import { resolveControls, type FrontItem, type ModularProject, type Patch } from './types';

type ControlItem = Extract<FrontItem, { kind: 'control' }>;
const controlsOf = (items: FrontItem[]): ControlItem[] => items.filter((it): it is ControlItem => it.kind === 'control');
const frontOf = (patch: Patch, p: ModularProject) => patch.fronts?.[0] ?? autoFront(patch, p);
const kindOfItem = (p: ModularProject, it: ControlItem): string | undefined => {
  const m = p.modules.find((x) => x.id === it.moduleId)!;
  return resolveControls(m, p.moduleTypes).find((c) => c.id === it.controlId)?.kind;
};

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
      // Het front dat de speler ziet (ontworpen of automatisch): elk item
      // komt op het paneel, niets valt stil weg.
      const front = frontOf(patch, p);
      const fm = buildFrontModule(front, patch, p);
      expect(fm.type.controls).toHaveLength(controlsOf(front.items).length);
    }
  });

  it('geeft elke patch een front waar een speler iets aan heeft: minstens drie knoppen, geen dubbele', () => {
    const p = standardProject();
    for (const patch of p.patches) {
      const items = controlsOf(frontOf(patch, p).items);
      const knobs = items.filter((it) => !['display', 'led'].includes(kindOfItem(p, it) ?? ''));
      expect(knobs.length, patch.name).toBeGreaterThanOrEqual(3);
      const keys = items.map((it) => `${it.moduleId}/${it.controlId}`);
      expect(new Set(keys).size, patch.name).toBe(keys.length);
    }
  });

  it('toont een naam bij elke keuzeknop die er een heeft (DX7, ritmebox, Plaits)', () => {
    const p = standardProject();
    const named = p.patches.filter((patch) => controlsOf(frontOf(patch, p).items).some((it) => kindOfItem(p, it) === 'display'));
    expect(named.map((x) => x.name)).toEqual(expect.arrayContaining([
      expect.stringMatching(/DX7 poly/), expect.stringMatching(/DX7 \+/), expect.stringMatching(/Ritmebox/), expect.stringMatching(/Plaits/),
    ]));
  });

  it('heeft ontworpen fronts voor orgel (alle negen trekstangen), koper, ritmebox en acid', () => {
    const p = standardProject();
    const designed = p.patches.filter((x) => x.fronts?.length).map((x) => x.name);
    expect(designed).toEqual(expect.arrayContaining([
      expect.stringMatching(/Organ/), expect.stringMatching(/koper/), expect.stringMatching(/Ritmebox/), expect.stringMatching(/Acid/),
    ]));
    const organ = p.patches.find((x) => /Organ/.test(x.name))!;
    const ids = controlsOf(organ.fronts![0]!.items).map((it) => it.controlId);
    for (const d of ['d16', 'd513', 'd8', 'd4', 'd223', 'd2', 'd135', 'd113', 'd1', 'speed']) expect(ids).toContain(d);
  });
});
