import { describe, it, expect } from 'vitest';
import { emptyModularProject } from './types';
import { seedInternals } from './seedModules';
import { expandPatchConnections } from './polyExpand';
import { validateOps } from './recipe/compile';
import { seedAxelFLeadPatch } from './seedAxelF';

describe('seedAxelFLeadPatch', () => {
  it('twee saws in unison, Para EQ → Digital Echo op de bus', () => {
    const p = seedAxelFLeadPatch(seedInternals(emptyModularProject()));
    const patch = p.patches.find((x) => x.id === p.activePatchId)!;
    const typeOf = (id: string) => p.modules.find((m) => m.id === id)!.typeId;
    const e = patch.connections.map((c) => `${typeOf(c.from.moduleId)}.${c.from.portId}>${typeOf(c.to.moduleId)}.${c.to.portId}`);
    expect(e).toContain('tp_mmb_para_eq.out_l>tp_mmb_digital_echo.in_l');
    expect(e.some((x) => x.startsWith('tp_mmb_digital_echo.out_l>tp_mmb_out'))).toBe(true);
    const mi = patch.connections.map((c) => c.from.moduleId).find((id) => typeOf(id) === 'tp_mmb_midiin')!;
    expect(patch.controlState[mi]).toMatchObject({ unison: 1, spread: 12 });
    const vcos = p.modules.filter((m) => m.typeId === 'tp_mmb_vco' && patch.controlState[m.id]?.wave === 2);
    expect(vcos.length).toBeGreaterThanOrEqual(2);
    expect(patch.name).toContain('Axel F');
    validateOps(p, [], patch.id);
    expandPatchConnections(patch, p);
  });
});
