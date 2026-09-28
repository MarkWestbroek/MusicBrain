import { describe, it, expect } from 'vitest';
import { emptyModularProject } from './types';
import { seedInternals } from './seedModules';
import { expandPatchConnections } from './polyExpand';
import { validateOps } from './recipe/compile';
import { seedSidPolyPatch } from './seedSid';

describe('seedSidPolyPatch', () => {
  it('MidiIn → SID-cel 1, uitgewaaierd over drie cellen; LFO op PW+', () => {
    const p = seedSidPolyPatch(seedInternals(emptyModularProject()));
    const patch = p.patches.find((x) => x.id === p.activePatchId)!;
    const typeOf = (id: string) => p.modules.find((m) => m.id === id)!.typeId;
    const e = patch.connections.map((c) => `${typeOf(c.from.moduleId)}.${c.from.portId}>${typeOf(c.to.moduleId)}.${c.to.portId}`);
    expect(e).toContain('tp_mmb_midiin.pitch>tp_mmb_sid.voct_1');
    expect(e).toContain('tp_mmb_lfo.out>tp_mmb_sid.pw_cv');
    validateOps(p, [], patch.id);
    const flat = expandPatchConnections(patch, p).map((c) => `${c.from.portId}>${c.to.portId}`);
    for (const k of [1, 2, 3]) {
      expect(flat.some((x) => x.endsWith(`>voct_${k}`))).toBe(true);
      expect(flat.some((x) => x.endsWith(`>gate_${k}`))).toBe(true);
    }
  });
});
