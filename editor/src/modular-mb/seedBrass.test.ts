import { describe, it, expect } from 'vitest';
import { emptyModularProject } from './types';
import { seedInternals } from './seedModules';
import { expandPatchConnections } from './polyExpand';
import { validateOps } from './recipe/compile';
import { seedCs80BrassPatch } from './seedBrass';

describe('seedCs80BrassPatch', () => {
  it('aftertouch op filter (per stem) en op vibratodiepte, chorus + galm op de bus', () => {
    const p = seedCs80BrassPatch(seedInternals(emptyModularProject()), 6);
    const patch = p.patches.find((x) => x.id === p.activePatchId)!;
    const typeOf = (id: string) => p.modules.find((m) => m.id === id)!.typeId;
    const e = patch.connections.map((c) => `${typeOf(c.from.moduleId)}.${c.from.portId}>${typeOf(c.to.moduleId)}.${c.to.portId}`);
    const press = e.filter((x) => x.startsWith('tp_mmb_midiin.press>'));
    expect(press).toEqual(['tp_mmb_midiin.press>tp_mmb_cvmath.c', 'tp_mmb_midiin.press>tp_mmb_cvmath.b']);
    expect(e).toContain('tp_mmb_midiin.cv_mod>tp_mmb_cvmath.a');
    expect(e.some((x) => x.endsWith('>tp_mmb_bbd_chorus.in_l'))).toBe(true);
    expect(e.some((x) => x.startsWith('tp_mmb_elements_reverb.out_l>tp_mmb_out'))).toBe(true);
    expect(patch.name).toContain('CS-80');
    validateOps(p, [], patch.id);
    expandPatchConnections(patch, p);
  });
});
