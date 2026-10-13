// Programmabank (modulePrograms.ts): een programma kiezen zet de knoppen van
// de module via setPatchControl; stemming en volume blijven staan.

import { describe, expect, it } from 'vitest';

import { ELEMENTS_PROGRAMS } from './modulePrograms';
import { PATCH_CATALOG } from './patchCatalog';
import { seedInternals } from './seedModules';
import { setPatchControl } from './setPatchControl';
import { getProject, setProject } from './store';
import { emptyModularProject } from './types';

describe('Elements-programma\'s', () => {
  it('de 19 geredde programma\'s, elk met de knoppen van de module', () => {
    expect(ELEMENTS_PROGRAMS.length).toBe(19);
    const b = seedInternals(emptyModularProject());
    const el = b.moduleTypes.find((t) => t.id === 'tp_mmb_elements')!;
    const ids = new Set(el.controls.map((c) => c.id));
    for (const p of ELEMENTS_PROGRAMS) for (const k of Object.keys(p.values)) expect(ids.has(k), `${p.name}.${k}`).toBe(true);
  });

  it('Program kiezen zet de knoppen; Coarse, Fine en Level blijven staan', () => {
    const entry = PATCH_CATALOG.find((e) => e.label.includes('Elements (modaal)'))!;
    const p0 = entry.build(seedInternals(emptyModularProject()));
    const patch = p0.patches.find((x) => x.id === p0.activePatchId)!;
    const el = p0.modules.find((m) => m.typeId === 'tp_mmb_elements' && patch.controlState[m.id])!;
    setProject({ ...p0, patches: p0.patches.map((x) => (x.id === patch.id
      ? { ...x, controlState: { ...x.controlState, [el.id]: { ...x.controlState[el.id], coarse: 7, fine: 12, level: 0.6 } } } : x)) });
    setPatchControl(patch.id, el.id, 'program', 2);   // mandolin
    const cs = getProject().patches.find((x) => x.id === patch.id)!.controlState[el.id]!;
    expect(cs.program).toBe(2);
    for (const [k, v] of Object.entries(ELEMENTS_PROGRAMS[2]!.values)) expect(cs[k]).toBe(v);
    expect([cs.coarse, cs.fine, cs.level]).toEqual([7, 12, 0.6]);
  });
});
