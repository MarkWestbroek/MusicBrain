import { describe, expect, it } from 'vitest';

import { choosePatch } from './PatchSelect';
import { standardProject } from './demoSeeds';
import { getProject, setProject } from './store';

describe('choosePatch', () => {
  it('maakt een patch actief, en zet een voorbeeld uit de standaardset erbij', () => {
    setProject(standardProject());
    const p0 = getProject();
    choosePatch(p0.patches[2]!.id);
    expect(getProject().activePatchId).toBe(p0.patches[2]!.id);
    expect(getProject().activeRackId).toBe(p0.patches[2]!.rackIds[0]);
    choosePatch('seed:0');
    const p1 = getProject();
    expect(p1.patches).toHaveLength(p0.patches.length + 1);
    expect(p1.activePatchId).toBe(p1.patches.at(-1)!.id);
    choosePatch('seed:999');
    expect(getProject()).toBe(p1);
  });
});
